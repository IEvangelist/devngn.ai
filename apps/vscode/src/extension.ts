import * as vscode from "vscode";
import {
  createBootstrapRequest,
  listProviderReadiness,
  type AIProviderReadiness,
  type AIRequest,
  type TokenBudget,
} from "@devngn/ai";
import {
  initializeDevngnTelemetry,
  measureDevngnFlow,
  recordDevngnFlow,
  type DevngnTelemetryRuntime,
} from "@devngn/analytics";
import {
  scanWorkspace,
  type AIBit,
  type Finding,
  type ScanResult,
} from "@devngn/core";
import { recognizePatterns, type PatternMatch } from "@devngn/patterns";
import { getBundledRegistry } from "@devngn/vendors";
import { activateWellness } from "./wellness/controller.js";

let telemetry: DevngnTelemetryRuntime | null = null;

interface TokenDashboardState {
  scan: ScanResult | null;
  request: AIRequest | null;
  providers: AIProviderReadiness[];
}

export function activate(context: vscode.ExtensionContext): void {
  const packageVersion =
    typeof context.extension.packageJSON.version === "string"
      ? context.extension.packageJSON.version
      : "0.0.0";
  telemetry = initializeDevngnTelemetry({
    source: "vscode",
    serviceName: "devngn-vscode",
    serviceVersion: packageVersion,
  });
  recordDevngnFlow({
    name: "extension.activate",
    source: "vscode",
    properties: {
      activationKind: "extension-host",
    },
  });

  const aiBitsProvider = new AIBitsProvider();
  const tokenUsageProvider = new TokenUsageViewProvider();
  const output = vscode.window.createOutputChannel("devngn");
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  let scanInProgress = false;

  statusBar.command = "devngn.openTokenUsage";
  updateStatusBar(statusBar, null);
  statusBar.show();

  context.subscriptions.push(
    output,
    statusBar,
    vscode.window.registerTreeDataProvider("devngn.aiBits", aiBitsProvider),
    vscode.window.registerWebviewViewProvider(
      "devngn.tokenUsage",
      tokenUsageProvider,
    ),
    vscode.commands.registerCommand("devngn.scan", async () => {
      if (scanInProgress) {
        vscode.window.showWarningMessage("devngn scan is already running.");
        return;
      }

      scanInProgress = true;

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "devngn scan",
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: "Inspecting workspace AI-bits..." });
            const result = await scanCurrentWorkspace(output);

            if (result === null) {
              return;
            }

            progress.report({ message: "Updating devngn views..." });
            aiBitsProvider.setResult(result);
            tokenUsageProvider.setScanResult(result);
            updateStatusBar(statusBar, result);
            vscode.window.showInformationMessage(
              `devngn found ${result.summary.aiBits} AI-bits and ${result.summary.findings} findings.`,
            );
          },
        );
      } catch (error) {
        await handleScanError(error, output);
      } finally {
        scanInProgress = false;
      }
    }),
    vscode.commands.registerCommand("devngn.openTokenUsage", () => {
      const state = tokenUsageProvider.getState();
      recordDevngnFlow({
        name: "token.dashboard.open",
        source: "vscode",
        properties: {
          providers: state.providers.length,
          aiBits: state.scan?.summary.aiBits ?? 0,
          findings: state.scan?.summary.findings ?? 0,
          withinBudget: state.request?.tokenBudget.withinBudget ?? null,
        },
      });
      openTokenUsagePanel(state);
    }),
  );

  activateWellness(context);
}

export function deactivate(): Thenable<void> | void {
  return telemetry?.shutdown();
}

async function scanCurrentWorkspace(
  output: vscode.OutputChannel,
): Promise<ScanResult | null> {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (workspace === undefined) {
    vscode.window.showWarningMessage(
      "Open a workspace before scanning AI-bits.",
    );
    return null;
  }

  const startedAt = Date.now();
  output.appendLine(
    `[${new Date().toISOString()}] Starting scan: ${workspace}`,
  );

  const result = await measureDevngnFlow(
    {
      name: "workspace.scan",
      source: "vscode",
      resultProperties: (scan) => ({
        vendors: scan.summary.vendors,
        aiBits: scan.summary.aiBits,
        findings: scan.summary.findings,
        recommendations: scan.recommendations.length,
      }),
    },
    () =>
      scanWorkspace({
        workspace,
        registry: getBundledRegistry(),
      }),
  );

  output.appendLine(
    `[${new Date().toISOString()}] Completed scan in ${Date.now() - startedAt}ms: ${result.summary.aiBits} AI-bits, ${result.summary.findings} findings.`,
  );

  return result;
}

async function handleScanError(
  error: unknown,
  output: vscode.OutputChannel,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  output.appendLine(`[${new Date().toISOString()}] Scan failed: ${message}`);

  if (stack !== undefined) {
    output.appendLine(stack);
  }

  const selection = await vscode.window.showErrorMessage(
    `devngn scan failed: ${message}`,
    "Show output",
  );

  if (selection === "Show output") {
    output.show(true);
  }
}

class AIBitsProvider implements vscode.TreeDataProvider<TreeNode> {
  private result: ScanResult | null = null;
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    TreeNode | undefined
  >();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  setResult(result: ScanResult): void {
    this.result = result;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): vscode.ProviderResult<TreeNode[]> {
    if (element !== undefined) {
      return element.children;
    }

    if (this.result === null) {
      return [
        new TreeNode(
          "Run devngn: Scan AI-bits",
          "No scan has been run yet.",
          vscode.TreeItemCollapsibleState.None,
        ),
      ];
    }

    return [
      new TreeNode(
        `AI-bits (${this.result.aiBits.length})`,
        "Discovered workspace and user AI-bits.",
        vscode.TreeItemCollapsibleState.Expanded,
        this.result.aiBits.map(toAIBitNode),
      ),
      new TreeNode(
        `Findings (${this.result.findings.length})`,
        "Drift, conflict, freshness, and cleanup findings.",
        vscode.TreeItemCollapsibleState.Collapsed,
        this.result.findings.map(toFindingNode),
      ),
      new TreeNode(
        "AI Providers",
        "Installed SDK, auth, and provider capability readiness.",
        vscode.TreeItemCollapsibleState.Collapsed,
        listProviderReadiness().map(toProviderNode),
      ),
      new TreeNode(
        "AI Patterns",
        "Known ecosystem patterns recognized in this workspace.",
        vscode.TreeItemCollapsibleState.Collapsed,
        recognizePatterns(this.result).map(toPatternNode),
      ),
    ];
  }
}

class TokenUsageViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private scan: ScanResult | null = null;
  private request: AIRequest | null = null;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: false,
    };
    this.render();
  }

  setScanResult(scan: ScanResult): void {
    this.scan = scan;
    this.request = createBootstrapRequest(scan);
    this.render();
  }

  getState(): TokenDashboardState {
    return {
      scan: this.scan,
      request: this.request,
      providers: listProviderReadiness(),
    };
  }

  private render(): void {
    if (this.view === null) {
      return;
    }

    this.view.webview.html = renderTokenDashboardHtml(this.getState(), "view");
  }
}

class TreeNode extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    readonly children: TreeNode[] = [],
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip;
  }
}

function openTokenUsagePanel(state: TokenDashboardState): void {
  const panel = vscode.window.createWebviewPanel(
    "devngnTokenUsage",
    "devngn Token Usage",
    vscode.ViewColumn.One,
    {
      enableScripts: false,
    },
  );

  panel.webview.html = renderTokenDashboardHtml(state, "panel");
}

function toAIBitNode(bit: AIBit): TreeNode {
  const location = bit.relativePath ?? bit.scope;
  return new TreeNode(
    `${bit.kind}: ${bit.name}`,
    `${bit.vendorId ?? "unknown vendor"} - ${location}`,
    vscode.TreeItemCollapsibleState.None,
  );
}

function toFindingNode(finding: Finding): TreeNode {
  return new TreeNode(
    `[${finding.severity}] ${finding.title}`,
    finding.message,
    vscode.TreeItemCollapsibleState.None,
  );
}

function toProviderNode(provider: AIProviderReadiness): TreeNode {
  const sdk =
    provider.sdkPackages.length === 0
      ? "SDK research required"
      : `${provider.installedSdkPackages.length}/${provider.sdkPackages.length} SDK packages installed`;

  return new TreeNode(
    provider.name,
    `${sdk}; auth ${provider.configuredAuth ? "configured" : "not configured"}; ${provider.capabilities.join(", ")}`,
    vscode.TreeItemCollapsibleState.None,
  );
}

function toPatternNode(match: PatternMatch): TreeNode {
  return new TreeNode(
    `${match.name} (${Math.round(match.score * 100)}%)`,
    `Trend: ${match.trend}; lights up: ${match.experienceTriggers.join(", ")}`,
    vscode.TreeItemCollapsibleState.None,
  );
}

function updateStatusBar(
  statusBar: vscode.StatusBarItem,
  result: ScanResult | null,
): void {
  if (result === null) {
    statusBar.text = "$(sparkle) devngn tokens";
    statusBar.tooltip = "Open devngn token usage dashboard.";
    return;
  }

  const request = createBootstrapRequest(result);
  const percent = budgetPercent(request.tokenBudget);
  statusBar.text = `$(sparkle) ${formatNumber(request.tokenBudget.estimatedInputTokens)} tok`;
  statusBar.tooltip = `devngn bootstrap request uses ${percent}% of the available input budget.`;
}

function renderTokenDashboardHtml(
  state: TokenDashboardState,
  surface: "view" | "panel",
): string {
  const budget = state.request?.tokenBudget ?? null;
  const percent = budget === null ? 0 : budgetPercent(budget);
  const status = budget === null ? "Awaiting scan" : budgetStatus(budget);
  const statusClass =
    budget === null
      ? "neutral"
      : budget.withinBudget && percent < budget.warningThreshold * 100
        ? "good"
        : budget.withinBudget
          ? "warn"
          : "bad";
  const layoutClass = surface === "panel" ? "panel-mode" : "view-mode";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: dark;
        --bg: #080b12;
        --card: rgba(15, 23, 42, 0.78);
        --card-strong: rgba(17, 24, 39, 0.94);
        --border: rgba(148, 163, 184, 0.2);
        --text: #f8fafc;
        --muted: #94a3b8;
        --accent: #70f0c8;
        --accent-2: #8aa8ff;
        --warn: #fbbf24;
        --bad: #fb7185;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at 20% 0%, rgba(112, 240, 200, 0.2), transparent 16rem),
          radial-gradient(circle at 90% 10%, rgba(138, 168, 255, 0.18), transparent 18rem),
          linear-gradient(180deg, rgba(8, 11, 18, 0.96), rgba(8, 11, 18, 1));
        color: var(--text);
        font-family: var(--vscode-font-family);
      }

      main {
        display: grid;
        gap: 1rem;
        padding: ${surface === "panel" ? "1.5rem" : "0.85rem"};
      }

      .panel-mode {
        grid-template-columns: minmax(18rem, 0.95fr) minmax(22rem, 1.35fr);
        max-width: 1180px;
        margin: 0 auto;
      }

      .view-mode {
        grid-template-columns: 1fr;
      }

      .hero,
      .card {
        border: 1px solid var(--border);
        border-radius: 1.25rem;
        background: var(--card);
        box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.24);
        overflow: hidden;
      }

      .hero {
        padding: 1.15rem;
      }

      .eyebrow {
        color: var(--accent);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      h1,
      h2,
      p {
        margin: 0;
      }

      h1 {
        font-size: ${surface === "panel" ? "clamp(2.4rem, 6vw, 4.8rem)" : "2.1rem"};
        line-height: 0.92;
        margin: 0.35rem 0 0.75rem;
      }

      h2 {
        font-size: 0.95rem;
      }

      p {
        color: var(--muted);
        line-height: 1.55;
      }

      .ring-wrap {
        align-items: center;
        display: grid;
        gap: 1rem;
        grid-template-columns: auto 1fr;
        margin-top: 1.1rem;
      }

      .ring {
        --percent: ${percent};
        align-items: center;
        background:
          radial-gradient(circle, #0f172a 56%, transparent 57%),
          conic-gradient(${ringColor(statusClass)} calc(var(--percent) * 1%), rgba(148, 163, 184, 0.22) 0);
        border-radius: 999px;
        display: grid;
        height: 7.5rem;
        justify-items: center;
        place-content: center;
        width: 7.5rem;
      }

      .ring strong {
        font-size: 1.35rem;
      }

      .ring span {
        color: var(--muted);
        font-size: 0.72rem;
      }

      .status {
        border-radius: 999px;
        display: inline-flex;
        font-size: 0.72rem;
        font-weight: 800;
        margin-bottom: 0.55rem;
        padding: 0.35rem 0.6rem;
        text-transform: uppercase;
      }

      .status.good {
        background: rgba(112, 240, 200, 0.14);
        color: var(--accent);
      }

      .status.warn {
        background: rgba(251, 191, 36, 0.14);
        color: var(--warn);
      }

      .status.bad {
        background: rgba(251, 113, 133, 0.14);
        color: var(--bad);
      }

      .status.neutral {
        background: rgba(148, 163, 184, 0.14);
        color: var(--muted);
      }

      .metrics {
        display: grid;
        gap: 0.65rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 1rem;
      }

      .metric {
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 0.9rem;
        padding: 0.8rem;
      }

      .metric span {
        color: var(--muted);
        display: block;
        font-size: 0.72rem;
        margin-bottom: 0.25rem;
      }

      .metric strong {
        font-size: 1.05rem;
      }

      .stack {
        display: grid;
        gap: 1rem;
      }

      .card {
        padding: 1rem;
      }

      .providers {
        display: grid;
        gap: 0.75rem;
      }

      .provider {
        background: var(--card-strong);
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 1rem;
        padding: 0.9rem;
      }

      .provider-head {
        align-items: center;
        display: flex;
        gap: 0.65rem;
        justify-content: space-between;
      }

      .pill {
        border-radius: 999px;
        color: var(--muted);
        font-size: 0.7rem;
        padding: 0.25rem 0.5rem;
        background: rgba(148, 163, 184, 0.14);
      }

      .pill.ready {
        background: rgba(112, 240, 200, 0.13);
        color: var(--accent);
      }

      .pill.missing {
        background: rgba(251, 191, 36, 0.13);
        color: var(--warn);
      }

      .bar {
        background: rgba(148, 163, 184, 0.18);
        border-radius: 999px;
        height: 0.5rem;
        margin-top: 0.75rem;
        overflow: hidden;
      }

      .bar span {
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
        display: block;
        height: 100%;
        width: ${percent}%;
      }

      .capabilities {
        color: var(--muted);
        font-size: 0.76rem;
        line-height: 1.45;
        margin-top: 0.55rem;
      }

      .empty {
        border: 1px dashed rgba(148, 163, 184, 0.32);
        border-radius: 1rem;
        color: var(--muted);
        padding: 1rem;
      }

      @media (max-width: 820px) {
        .panel-mode {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="${layoutClass}">
      <section class="hero">
        <div class="eyebrow">token-aware dev engine</div>
        <h1>AI budget, at a glance.</h1>
        <p>${escapeHtml(tokenHeroText(state))}</p>
        <div class="ring-wrap">
          <div class="ring">
            <strong>${percent}%</strong>
            <span>used</span>
          </div>
          <div>
            <span class="status ${statusClass}">${escapeHtml(status)}</span>
            <p>${escapeHtml(tokenStatusCopy(state, percent))}</p>
          </div>
        </div>
        <div class="bar"><span></span></div>
        <div class="metrics">
          ${renderMetric("Input", budget?.estimatedInputTokens)}
          ${renderMetric("Available", budget?.availableInputTokens)}
          ${renderMetric("Output max", budget?.maxOutputTokens)}
          ${renderMetric("Reserve", budget?.reserveTokens)}
        </div>
      </section>
      <section class="stack">
        <article class="card">
          <h2>Provider readiness</h2>
          <p>devngn only calls SDKs that are installed, authenticated, and capability-compatible.</p>
          <div class="providers">
            ${state.providers.map(renderProviderCard).join("")}
          </div>
        </article>
        <article class="card">
          <h2>Workspace signals</h2>
          ${renderWorkspaceSignals(state.scan)}
        </article>
      </section>
    </main>
  </body>
</html>`;
}

function renderMetric(label: string, value: number | undefined): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${value === undefined ? "—" : formatNumber(value)}</strong></div>`;
}

function renderProviderCard(provider: AIProviderReadiness): string {
  const sdkReady =
    provider.sdkPackages.length === 0 ||
    provider.installedSdkPackages.length === provider.sdkPackages.length;
  const authClass = provider.configuredAuth ? "ready" : "missing";
  const sdkClass = sdkReady ? "ready" : "missing";
  const sdkText =
    provider.sdkPackages.length === 0
      ? "research SDK"
      : `${provider.installedSdkPackages.length}/${provider.sdkPackages.length} SDK`;

  return `<div class="provider">
    <div class="provider-head">
      <strong>${escapeHtml(provider.name)}</strong>
      <span>
        <span class="pill ${sdkClass}">${escapeHtml(sdkText)}</span>
        <span class="pill ${authClass}">${provider.configuredAuth ? "auth ready" : "auth needed"}</span>
      </span>
    </div>
    <div class="capabilities">${escapeHtml(provider.capabilities.join(" · "))}</div>
  </div>`;
}

function renderWorkspaceSignals(scan: ScanResult | null): string {
  if (scan === null) {
    return `<div class="empty">Run <strong>devngn: Scan AI-bits</strong> to calculate token usage from the current workspace.</div>`;
  }

  return `<div class="metrics">
    ${renderMetric("AI-bits", scan.summary.aiBits)}
    ${renderMetric("Findings", scan.summary.findings)}
    ${renderMetric("Vendors", scan.summary.vendors)}
    ${renderMetric("Installed tools", scan.summary.installedTools)}
  </div>`;
}

function tokenHeroText(state: TokenDashboardState): string {
  if (state.request === null) {
    return "Run a scan to see how much context devngn needs before it asks an AI provider to reason about your workspace.";
  }

  return `Prepared a ${state.request.providerId} bootstrap request for ${state.request.model}.`;
}

function tokenStatusCopy(state: TokenDashboardState, percent: number): string {
  if (state.request === null) {
    return "The dashboard will estimate the input budget, output allowance, and reserved safety tokens before provider dispatch.";
  }

  if (!state.request.tokenBudget.withinBudget) {
    return "This request is over budget. devngn should summarize, chunk, or ask for a larger-context model before dispatch.";
  }

  return `This bootstrap request is within budget and currently uses ${percent}% of the available input window.`;
}

function budgetStatus(budget: TokenBudget): string {
  if (!budget.withinBudget) {
    return "Over budget";
  }

  const percent = budgetPercent(budget);
  return percent >= budget.warningThreshold * 100
    ? "Near budget"
    : "Within budget";
}

function budgetPercent(budget: TokenBudget): number {
  if (budget.availableInputTokens === 0) {
    return budget.estimatedInputTokens === 0 ? 0 : 100;
  }

  return Math.min(
    100,
    Math.round(
      (budget.estimatedInputTokens / budget.availableInputTokens) * 100,
    ),
  );
}

function ringColor(statusClass: string): string {
  switch (statusClass) {
    case "good":
      return "var(--accent)";
    case "warn":
      return "var(--warn)";
    case "bad":
      return "var(--bad)";
    default:
      return "rgba(148, 163, 184, 0.76)";
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}
