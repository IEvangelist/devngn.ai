$ErrorActionPreference = 'Stop'

$requiredVariables = @(
  'AZURE_ARTIFACT_SIGNING_ENDPOINT',
  'AZURE_ARTIFACT_SIGNING_ACCOUNT',
  'AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE'
)

$missingVariables = $requiredVariables | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
if ($missingVariables.Count -gt 0) {
  throw "Missing required Artifact Signing environment variables: $($missingVariables -join ', ')"
}

$root = Join-Path $PSScriptRoot '..'
$toolsRoot = Join-Path $root '.artifact-signing'
$nugetPath = Join-Path $toolsRoot 'nuget.exe'
$metadataPath = Join-Path $toolsRoot 'metadata.json'

New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath $nugetPath)) {
  Invoke-WebRequest -Uri 'https://dist.nuget.org/win-x86-commandline/latest/nuget.exe' -OutFile $nugetPath
}

& $nugetPath install Microsoft.Windows.SDK.BuildTools -OutputDirectory $toolsRoot -NonInteractive -Verbosity quiet
if ($LASTEXITCODE -ne 0) {
  throw "Failed to install Microsoft.Windows.SDK.BuildTools via NuGet."
}

& $nugetPath install Microsoft.ArtifactSigning.Client -OutputDirectory $toolsRoot -NonInteractive -Verbosity quiet
if ($LASTEXITCODE -ne 0) {
  throw "Failed to install Microsoft.ArtifactSigning.Client via NuGet."
}

$signtool = Get-ChildItem -Path $toolsRoot -Recurse -Filter signtool.exe |
  Where-Object { $_.FullName -match '\\bin\\[^\\]+\\x64\\signtool\.exe$' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $signtool) {
  throw "Could not locate x64 signtool.exe under $toolsRoot."
}

$dlib = Get-ChildItem -Path $toolsRoot -Recurse -Filter Azure.CodeSigning.Dlib.dll |
  Where-Object { $_.FullName -match '\\bin\\x64\\Azure\.CodeSigning\.Dlib\.dll$' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $dlib) {
  throw "Could not locate x64 Azure.CodeSigning.Dlib.dll under $toolsRoot."
}

$correlationId = if ($env:GITHUB_RUN_ID) { "github-actions-$env:GITHUB_RUN_ID" } else { "local-$([guid]::NewGuid())" }
$metadata = [ordered]@{
  Endpoint = $env:AZURE_ARTIFACT_SIGNING_ENDPOINT
  CodeSigningAccountName = $env:AZURE_ARTIFACT_SIGNING_ACCOUNT
  CertificateProfileName = $env:AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE
  CorrelationId = $correlationId
  ExcludeCredentials = @(
    'ManagedIdentityCredential',
    'WorkloadIdentityCredential',
    'SharedTokenCacheCredential',
    'VisualStudioCredential',
    'VisualStudioCodeCredential',
    'AzurePowerShellCredential',
    'AzureDeveloperCliCredential',
    'InteractiveBrowserCredential'
  )
}

$metadata | ConvertTo-Json -Depth 5 | Set-Content -Path $metadataPath -Encoding utf8NoBOM

@(
  "SIGNTOOL_PATH=$($signtool.FullName)",
  "ARTIFACT_SIGNING_DLIB_PATH=$($dlib.FullName)",
  "ARTIFACT_SIGNING_METADATA_PATH=$metadataPath"
) | ForEach-Object {
  if ($env:GITHUB_ENV) {
    Add-Content -Path $env:GITHUB_ENV -Value $_
  }
  else {
    Write-Output $_
  }
}

Write-Output "Configured Artifact Signing with $($signtool.FullName)"
