const { readFileSync } = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const bundlePath = path.resolve(__dirname, "..", "dist", "extension.js");
const bundle = readFileSync(bundlePath, "utf8");

if (bundle.includes('require("@devngn/')) {
  throw new Error(
    "VS Code extension bundle must not require @devngn packages at runtime.",
  );
}

const originalLoad = Module._load;
const vscode = {
  commands: {
    registerCommand() {
      return { dispose() {} };
    },
  },
  EventEmitter: class {
    event = () => {};
    fire() {}
    dispose() {}
  },
  StatusBarAlignment: {
    Right: 2,
  },
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ViewColumn: {
    One: 1,
  },
  window: {
    createStatusBarItem() {
      return {
        show() {},
        dispose() {},
      };
    },
    createWebviewPanel() {
      return {
        webview: {},
      };
    },
    registerTreeDataProvider() {
      return { dispose() {} };
    },
    registerWebviewViewProvider() {
      return { dispose() {} };
    },
    showInformationMessage() {},
    showWarningMessage() {},
  },
  workspace: {
    workspaceFolders: [
      {
        uri: {
          fsPath: process.cwd(),
        },
      },
    ],
  },
};

Module._load = (request, parent, isMain) =>
  request === "vscode" ? vscode : originalLoad(request, parent, isMain);

try {
  const extension = require(bundlePath);
  const subscriptions = [];
  extension.activate({
    extension: {
      packageJSON: {
        version: "0.0.0",
      },
    },
    subscriptions,
  });

  if (subscriptions.length === 0) {
    throw new Error(
      "VS Code extension activation did not register subscriptions.",
    );
  }
} finally {
  Module._load = originalLoad;
}
