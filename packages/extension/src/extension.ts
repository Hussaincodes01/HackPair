import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import { SocketClient } from "./socket-client";
import { CollaborationSidebar } from "./sidebar";
import { CursorManager } from "./cursor-manager";
import { scanWorkspace, readFileContent, watchWorkspace, FileTreeItem } from "./workspace";

let socketClient: SocketClient | null = null;
let sidebar: CollaborationSidebar | null = null;
let cursorManager: CursorManager | null = null;
let serverProcess: any = null;
let extContext: vscode.ExtensionContext;
let workspaceFolder: string = "";
let fileContents: Map<string, string> = new Map();

function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

function startServer(port: number = 3001): Promise<{ port: number; url: string }> {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(extContext.extensionPath, "dist", "server.js");
    const { spawn } = require("child_process");
    serverProcess = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: String(port) },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let started = false;
    serverProcess.stdout?.on("data", (data: Buffer) => {
      if (!started && (data.toString().includes("running at") || data.toString().includes("listening"))) {
        started = true;
        const ips = getLocalIPs();
        const ip = ips[0] || "localhost";
        resolve({ port, url: `http://${ip}:${port}` });
      }
    });
    serverProcess.stderr?.on("data", (data: Buffer) => console.error("HackPair:", data.toString()));
    serverProcess.on("error", (err: Error) => { if (!started) reject(err); });
    serverProcess.on("exit", () => { serverProcess = null; });
    setTimeout(() => {
      if (!started) {
        started = true;
        const ips = getLocalIPs();
        const ip = ips[0] || "localhost";
        resolve({ port, url: `http://${ip}:${port}` });
      }
    }, 3000);
  });
}

function stopServer() {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
}

function parseInviteLink(link: string): { serverUrl: string; inviteCode: string } | null {
  try {
    const trimmed = link.trim();
    if (/^https?:\/\//.test(trimmed)) {
      const url = new URL(trimmed);
      const code = url.searchParams.get("room");
      if (!code) return null;
      return { serverUrl: `${url.protocol}//${url.host}`, inviteCode: code.toUpperCase() };
    }
    if (/^[A-Za-z0-9]{6}$/.test(trimmed)) return { serverUrl: "", inviteCode: trimmed.toUpperCase() };
    return null;
  } catch { return null; }
}

async function syncWorkspace() {
  if (!workspaceFolder || !socketClient?.isConnected()) return;
  const fileTree = scanWorkspace(workspaceFolder);
  socketClient.emitWorkspaceSync(fileTree);
}

export function activate(ctx: vscode.ExtensionContext) {
  extContext = ctx;
  cursorManager = new CursorManager();
  sidebar = new CollaborationSidebar(ctx.extensionUri, ctx.globalState);

  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider("hackpair.panel", sidebar));

  sidebar.onMessage(async (msg) => {
    if (msg.type === "create") {
      let displayName = msg.displayName || "";
      if (!displayName) {
        displayName = await vscode.window.showInputBox({ prompt: "Your display name", placeHolder: "Your Name", validateInput: (v) => v.trim().length > 0 ? null : "Required" }) || "";
        if (!displayName) return;
      }
      await ctx.globalState.update("hackpair.displayName", displayName);

      // Pick workspace folder
      const folder = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: "Share This Folder", title: "Select workspace folder to share" });
      if (!folder || !folder[0]) return;
      workspaceFolder = folder[0].fsPath;

      sidebar?.updateState({ connecting: true, error: "" });
      try {
        const { url } = await startServer();
        const res = await fetch(`${url}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${displayName}'s Room` }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const room = await res.json();

        const joinRes = await fetch(`${url}/api/rooms/${room.id}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
        if (!joinRes.ok) throw new Error("Failed to join");
        const joinData = await joinRes.json();

        await ctx.globalState.update("hackpair.roomId", room.id);
        await ctx.globalState.update("hackpair.token", joinData.token);
        await ctx.globalState.update("hackpair.roomName", room.name);
        await ctx.globalState.update("hackpair.inviteCode", room.inviteCode);
        await ctx.globalState.update("hackpair.serverUrl", url);
        const inviteUrl = `${url}?room=${room.inviteCode}`;
        await ctx.globalState.update("hackpair.inviteUrl", inviteUrl);

        connectToServer(url, ctx, room.id, joinData.token);

        sidebar?.updateState({ roomName: room.name, inviteCode: room.inviteCode, inviteUrl, memberId: joinData.memberId, displayName, connected: true, connecting: false });

        // Sync workspace after connection
        setTimeout(() => syncWorkspace(), 1000);

        // Watch workspace for changes
        watchWorkspace(workspaceFolder, (event, relativePath) => {
          syncWorkspace();
          if (event === "changed") {
            const content = readFileContent(workspaceFolder, relativePath);
            socketClient?.emitCodeEdit(relativePath, content);
          }
        });

        vscode.window.showInformationMessage(`HackPair: Room created! Share the invite link.`);
      } catch (err: any) {
        sidebar?.updateState({ connecting: false, error: err.message });
      }
    }

    if (msg.type === "join") {
      let displayName = msg.displayName || "";
      if (!displayName) {
        displayName = await vscode.window.showInputBox({ prompt: "Your display name", placeHolder: "Your Name", validateInput: (v) => v.trim().length > 0 ? null : "Required" }) || "";
        if (!displayName) return;
      }
      await ctx.globalState.update("hackpair.displayName", displayName);

      // Pick workspace folder
      const folder = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: "Share This Folder", title: "Select workspace folder to share" });
      if (!folder || !folder[0]) return;
      workspaceFolder = folder[0].fsPath;

      const parsed = parseInviteLink(msg.inviteLink || "");
      if (!parsed || !parsed.serverUrl) {
        sidebar?.updateState({ error: "Invalid invite link." });
        return;
      }

      sidebar?.updateState({ connecting: true, error: "" });
      try {
        const { serverUrl, inviteCode } = parsed;
        const lookupRes = await fetch(`${serverUrl}/api/rooms/lookup?code=${encodeURIComponent(inviteCode)}`);
        if (!lookupRes.ok) throw new Error("Room not found.");
        const { id: roomId, name: roomName } = await lookupRes.json();

        const joinRes = await fetch(`${serverUrl}/api/rooms/${roomId}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
        if (!joinRes.ok) throw new Error("Failed to join");
        const joinData = await joinRes.json();

        await ctx.globalState.update("hackpair.roomId", roomId);
        await ctx.globalState.update("hackpair.token", joinData.token);
        await ctx.globalState.update("hackpair.roomName", roomName);
        await ctx.globalState.update("hackpair.inviteCode", inviteCode);
        await ctx.globalState.update("hackpair.serverUrl", serverUrl);
        const inviteUrl = `${serverUrl}?room=${inviteCode}`;
        await ctx.globalState.update("hackpair.inviteUrl", inviteUrl);

        connectToServer(serverUrl, ctx, roomId, joinData.token);

        sidebar?.updateState({ roomName, inviteCode, inviteUrl, memberId: joinData.memberId, displayName, connected: true, connecting: false });

        setTimeout(() => syncWorkspace(), 1000);

        watchWorkspace(workspaceFolder, (event, relativePath) => {
          syncWorkspace();
          if (event === "changed") {
            const content = readFileContent(workspaceFolder, relativePath);
            socketClient?.emitCodeEdit(relativePath, content);
          }
        });

        vscode.window.showInformationMessage(`HackPair: Joined "${roomName}"`);
      } catch (err: any) {
        sidebar?.updateState({ connecting: false, error: err.message });
      }
    }

    if (msg.type === "selectMember") {
      const memberId = msg.memberId;
      const name = msg.name;

      if (memberId === "self") {
        // Open own workspace in VS Code
        if (workspaceFolder) {
          vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(workspaceFolder));
        }
        return;
      }

      // Request file tree from member
      sidebar?.updateState({ selectedMember: memberId, selectedMemberName: name });

      // If we don't have their file tree, request it
      if (!sidebar?._state.fileTrees[memberId]) {
        socketClient?.emitFileRequest(memberId, "__tree__");
      }
    }

    if (msg.type === "deselectMember") {
      sidebar?.updateState({ selectedMember: null, selectedMemberName: null });
    }

    if (msg.type === "openFile") {
      const filePath = msg.path;
      const memberId = msg.memberId;

      if (memberId === "self" && workspaceFolder) {
        const fullPath = path.join(workspaceFolder, filePath);
        vscode.window.showTextDocument(vscode.Uri.file(fullPath));
        return;
      }

      // Request file content from member
      socketClient?.emitFileRequest(memberId, filePath);
    }

    if (msg.type === "leave") {
      ctx.globalState.update("hackpair.roomId", undefined);
      ctx.globalState.update("hackpair.token", undefined);
      ctx.globalState.update("hackpair.roomName", undefined);
      ctx.globalState.update("hackpair.inviteCode", undefined);
      ctx.globalState.update("hackpair.inviteUrl", undefined);
      socketClient?.disconnect();
      cursorManager?.clearAllCursors();
      sidebar?.reset();
      fileContents.clear();
    }

    if (msg.type === "copyInvite") {
      if (msg.url) {
        await vscode.env.clipboard.writeText(msg.url);
        vscode.window.showInformationMessage("HackPair: Invite link copied!");
      }
    }
  });

  // Auto-reconnect
  const savedRoomId = ctx.globalState.get<string>("hackpair.roomId");
  const savedToken = ctx.globalState.get<string>("hackpair.token");
  const savedServerUrl = ctx.globalState.get<string>("hackpair.serverUrl");
  const savedRoomName = ctx.globalState.get<string>("hackpair.roomName");
  const savedInviteCode = ctx.globalState.get<string>("hackpair.inviteCode");
  const savedInviteUrl = ctx.globalState.get<string>("hackpair.inviteUrl");
  const savedName = ctx.globalState.get<string>("hackpair.displayName");

  if (savedRoomId && savedToken && savedServerUrl) {
    sidebar?.updateState({ roomName: savedRoomName, inviteCode: savedInviteCode, inviteUrl: savedInviteUrl, displayName: savedName, connected: true });
    connectToServer(savedServerUrl, ctx, savedRoomId, savedToken);
  }

  ctx.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((e) => {
    if (!socketClient?.isConnected()) return;
    const pos = e.textEditor.selection.active;
    const file = vscode.workspace.asRelativePath(e.textEditor.document.fileName);
    socketClient.emitCursorMove(file, pos.line, pos.character);
  }));

  ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
    if (socketClient?.isConnected()) {
      const file = vscode.workspace.asRelativePath(e.document.fileName);
      socketClient.emitCodeEdit(file, e.document.getText());
    }
  }));

  ctx.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && socketClient?.isConnected()) {
      const file = vscode.workspace.asRelativePath(editor.document.fileName);
      socketClient.emitPresenceFile(file);
    }
  }));

  ctx.subscriptions.push(vscode.workspace.onDidCreateFiles((e) => {
    e.files.forEach((f) => socketClient?.emitEvent("file_created", vscode.workspace.asRelativePath(f)));
  }));

  ctx.subscriptions.push(vscode.workspace.onDidDeleteFiles((e) => {
    e.files.forEach((f) => socketClient?.emitEvent("file_deleted", vscode.workspace.asRelativePath(f)));
  }));

  console.log("HackPair activated");
}

function connectToServer(url: string, ctx: vscode.ExtensionContext, roomId?: string, token?: string) {
  socketClient?.disconnect();
  socketClient = new SocketClient(url);

  socketClient.onConnect(() => {
    sidebar?.updateState({ connected: true });
    if (roomId && token) socketClient?.connectToRoom(roomId, token);
  });

  socketClient.onDisconnect(() => sidebar?.updateState({ connected: false, members: [] }));

  socketClient.onMemberJoin((data) => sidebar?.addMember(data));
  socketClient.onMemberLeave((data) => sidebar?.removeMember(data.memberId));

  socketClient.onCodeEdit((data) => applyRemoteEdit(data.fileId, data.content));

  socketClient.onCursorUpdate((data) => {
    cursorManager?.updateCursor(data.memberId, data.displayName, data.colour, data.fileId, data.line, data.col);
  });

  // Workspace sync — receive member's file tree
  socketClient.onWorkspaceSync((data) => {
    sidebar?.updateFileTree(data.memberId, data.fileTree);
  });

  // File content received
  socketClient.onFileContent((data) => {
    openReadOnlyFile(data.displayName, data.filePath, data.content);
  });

  socketClient.connect();
}

function applyRemoteEdit(fileId: string, content: string) {
  for (const editor of vscode.window.visibleTextEditors) {
    const relPath = vscode.workspace.asRelativePath(editor.document.fileName);
    if (relPath === fileId) {
      const fullRange = new vscode.Range(0, 0, editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).text.length);
      editor.edit((editBuilder) => { editBuilder.replace(fullRange, content); });
      break;
    }
  }
}

function openReadOnlyFile(memberName: string, filePath: string, content: string) {
  const doc = vscode.window.activeTextEditor?.document;
  const fileName = path.basename(filePath);

  // Create virtual document
  const virtualUri = vscode.Uri.parse(`hackpair:${memberName}/${filePath}`);
  vscode.workspace.openTextDocument(virtualUri).then(
    (doc) => {
      // Show with custom name
      vscode.window.showTextDocument(doc, { preview: true });
    },
    () => {
      // Fallback: show content in a new untitled document
      vscode.workspace.openTextDocument({ content, language: getLanguageId(fileName) }).then((doc) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit((editBuilder) => {
            editBuilder.insert(new vscode.Position(0, 0), content);
          });
        }
        vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
      });
    }
  );
}

function getLanguageId(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescriptreact", ".js": "javascript", ".jsx": "javascriptreact",
    ".py": "python", ".rs": "rust", ".go": "go", ".java": "java", ".c": "c", ".cpp": "cpp",
    ".h": "c", ".hpp": "cpp", ".cs": "csharp", ".rb": "ruby", ".php": "php",
    ".html": "html", ".css": "css", ".scss": "scss", ".less": "less",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".md": "markdown", ".txt": "plaintext", ".sh": "shell", ".bash": "shell",
    ".sql": "sql", ".xml": "xml", ".vue": "vue", ".svelte": "svelte",
  };
  return map[ext] || "plaintext";
}

export function deactivate() {
  socketClient?.disconnect();
  cursorManager?.dispose();
  stopServer();
}
