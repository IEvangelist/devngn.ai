import * as vscode from "vscode";
import {
  scanWorkspace,
  type AIBit,
  type Finding,
  type ScanResult,
} from "@devngn/core";
import { getBundledRegistry } from "@devngn/vendors";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new AIBitsProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("devngn.aiBits", provider),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("devngn.scan", async () => {
      const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      if (workspace === undefined) {
        vscode.window.showWarningMessage(
          "Open a workspace before scanning AI-bits.",
        );
        return;
      }

      const result = await scanWorkspace({
        workspace,
        registry: getBundledRegistry(),
      });

      provider.setResult(result);
      vscode.window.showInformationMessage(
        `devngn found ${result.summary.aiBits} AI-bits and ${result.summary.findings} findings.`,
      );
    }),
  );
}

export function deactivate(): void {
  // VS Code handles disposable cleanup through the extension context.
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
    ];
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
