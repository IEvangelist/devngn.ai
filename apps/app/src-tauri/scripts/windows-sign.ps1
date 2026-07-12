param(
  [Parameter(Mandatory = $true)]
  [string] $FilePath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $FilePath)) {
  throw "Cannot sign missing file: $FilePath"
}

$signtool = $env:SIGNTOOL_PATH
$dlib = $env:ARTIFACT_SIGNING_DLIB_PATH
$metadata = $env:ARTIFACT_SIGNING_METADATA_PATH

if ([string]::IsNullOrWhiteSpace($signtool) -or -not (Test-Path -LiteralPath $signtool)) {
  throw "SIGNTOOL_PATH is not set or does not point to signtool.exe. Run scripts/setup-windows-signing.ps1 before building Windows installers."
}

if ([string]::IsNullOrWhiteSpace($dlib) -or -not (Test-Path -LiteralPath $dlib)) {
  throw "ARTIFACT_SIGNING_DLIB_PATH is not set or does not point to Azure.CodeSigning.Dlib.dll. Run scripts/setup-windows-signing.ps1 before building Windows installers."
}

if ([string]::IsNullOrWhiteSpace($metadata) -or -not (Test-Path -LiteralPath $metadata)) {
  throw "ARTIFACT_SIGNING_METADATA_PATH is not set or does not point to metadata.json. Run scripts/setup-windows-signing.ps1 before building Windows installers."
}

& $signtool sign `
  /v `
  /debug `
  /fd SHA256 `
  /tr 'http://timestamp.acs.microsoft.com' `
  /td SHA256 `
  /dlib $dlib `
  /dmdf $metadata `
  $FilePath

if ($LASTEXITCODE -ne 0) {
  throw "signtool failed to sign $FilePath"
}

& $signtool verify /pa /v $FilePath
if ($LASTEXITCODE -ne 0) {
  throw "signtool verification failed for $FilePath"
}
