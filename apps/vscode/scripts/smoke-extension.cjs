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
const commands = new Map();
const treeProviders = new Map();
const errorMessages = [];
const outputLines = [];
const vscode = {
  commands: {
    registerCommand(name, callback) {
      commands.set(name, callback);
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
  ProgressLocation: {
    Notification: 15,
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
    createOutputChannel() {
      return {
        appendLine(line) {
          outputLines.push(line);
        },
        show() {},
        dispose() {},
      };
    },
    createStatusBarItem() {
      return {
        text: "",
        tooltip: "",
        command: "",
        show() {},
        hide() {},
        dispose() {},
      };
    },
    createWebviewPanel() {
      return {
        webview: {},
      };
    },
    registerTreeDataProvider(id, provider) {
      treeProviders.set(id, provider);
      return { dispose() {} };
    },
    registerWebviewViewProvider() {
      return { dispose() {} };
    },
    showInformationMessage() {
      return Promise.resolve(undefined);
    },
    showWarningMessage(message) {
      errorMessages.push(message);
      return Promise.resolve(undefined);
    },
    showErrorMessage(message) {
      errorMessages.push(message);
      return Promise.resolve(undefined);
    },
    withProgress(_options, task) {
      return task({
        report() {},
      });
    },
  },
  workspace: {
    getConfiguration() {
      return {
        get(_key, defaultValue) {
          return defaultValue;
        },
      };
    },
    workspaceFolders: [
      {
        uri: {
          fsPath: process.env.DEVNGN_SMOKE_WORKSPACE ?? process.cwd(),
        },
      },
    ],
  },
};

Module._load = (request, parent, isMain) =>
  request === "vscode" ? vscode : originalLoad(request, parent, isMain);

(async () => {
  try {
    const extension = require(bundlePath);
    const subscriptions = [];
    const secretStore = new Map();
    extension.activate({
      extension: {
        packageJSON: {
          version: "0.0.0",
        },
      },
      subscriptions,
      secrets: {
        get(key) {
          return Promise.resolve(secretStore.get(key));
        },
        store(key, value) {
          secretStore.set(key, value);
          return Promise.resolve();
        },
        delete(key) {
          secretStore.delete(key);
          return Promise.resolve();
        },
        onDidChange() {
          return { dispose() {} };
        },
      },
    });

    if (subscriptions.length === 0) {
      throw new Error(
        "VS Code extension activation did not register subscriptions.",
      );
    }

    const scanCommand = commands.get("devngn.scan");

    if (scanCommand === undefined) {
      throw new Error("VS Code extension did not register devngn.scan.");
    }

    await scanCommand();

    if (errorMessages.length > 0) {
      throw new Error(
        `VS Code extension smoke scan failed: ${errorMessages[0]}`,
      );
    }

    if (!outputLines.some((line) => line.includes("Completed scan"))) {
      throw new Error("VS Code extension smoke scan did not complete.");
    }

    const aiBitsProvider = treeProviders.get("devngn.aiBits");

    if (aiBitsProvider === undefined) {
      throw new Error(
        "VS Code extension did not register AI-bits tree provider.",
      );
    }

    const rootNodes = await aiBitsProvider.getChildren();

    if (!rootNodes.some((node) => String(node.label).startsWith("AI-bits"))) {
      throw new Error(
        "VS Code extension smoke scan did not update AI-bits tree.",
      );
    }
  } finally {
    Module._load = originalLoad;
  }
})();
