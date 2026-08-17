import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import { SocketClient } from "./socket-client";
import { CollaborationSidebar } from "./sidebar";
import { CursorManager } from "./cursor-manager";
import { CloudflareTunnel } from "./tunnel";
import { scanWorkspace, readFileContent, watchWorkspace, safeResolve, toPosix } from "./workspace";

const SERVER_PORT = 3001;
/** Must match READY_MARKER in packages/server/src/index.ts. */
const SERVER_READY = "HACKPAIR_SERVER_READY";
const SERVER_START_TIMEOUT_MS = 30000;
/** Coalesce keystrokes before shipping a whole file over the wire. */
const EDIT_DEBOUNCE_MS = 300;
/** Coalesce filesystem events before rescanning the workspace tree. */
const TREE_DEBOUNCE_MS = 1000;

let socketClient: SocketClient | null = null;
let sidebar: CollaborationSidebar | null = null;
let cursorManager: CursorManager | null = null;
let serverProcess: any = null;
let cfTunnel: CloudflareTunnel | null = null;
let workspaceWatcher: vscode.Disposable | null = null;
let extContext: vscode.ExtensionContext;
let workspaceFolder: string = "";
let canEditRemote = false;

/** File ids currently being written by a remote edit — see applyRemoteEdit. */
const applyingRemoteEdit = new Set<string>();
const pendingEdits = new Map<string, { content: string; timer: NodeJS.Timeout }>();
let treeSyncTimer: NodeJS.Timeout | null = null;

// ---------------------------------------------------------------------------
// Networking helpers
// ---------------------------------------------------------------------------

/**
 * Pick the IPv4 address teammates on the same network can actually reach.
 *
 * Taking `networkInterfaces()[0]` handed out WSL / Hyper-V / VirtualBox / Docker
 * addresses on most Windows machines, producing an invite link nobody could
 * open. Prefer real RFC1918 addresses and push virtual adapters to the back.
 */
function getLanIP(): string {
  const VIRTUAL = /(vethernet|wsl|hyper-?v|virtualbox|vmware|docker|tailscale|zerotier|loopback|bluetooth)/;
  const PRIVATE = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;
  const candidates: { address: string; score: number }[] = [];

  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      // 169.254.x.x is a link-local address handed out when DHCP failed.
      if (iface.address.startsWith("169.254.")) continue;
      let score = 0;
      if (PRIVATE.test(iface.address)) score += 2;
      if (VIRTUAL.test(name.toLowerCase())) score -= 5;
      candidates.push({ address: iface.address, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address || "localhost";
}

async function probeHealth(port: number, timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface ServerHandle {
  port: number;
  /** Loopback URL this extension talks to. Always reachable, never changes. */
  localUrl: string;
  /** LAN URL to hand to teammates when there's no tunnel. */
  lanUrl: string;
}

function serverHandle(port: number): ServerHandle {
  return {
    port,
    localUrl: `http://127.0.0.1:${port}`,
    lanUrl: `http://${getLanIP()}:${port}`,
  };
}

/**
 * Spawn the bundled server and wait until it answers /api/health.
 *
 * Two things this has to get right:
 *  - `process.execPath` in the extension host is VS Code's own binary, not
 *    node. Without ELECTRON_RUN_AS_NODE it launches another VS Code window
 *    instead of running the server.
 *  - Readiness is confirmed by polling the health endpoint. The stdout marker
 *    is only a hint that lets us poll sooner.
 */
async function startServer(port: number = SERVER_PORT): Promise<ServerHandle> {
  // A server from another window (or a previous session) may already own the
  // port. Reuse it rather than failing with "port in use".
  if (await probeHealth(port)) return serverHandle(port);

  stopServer();

  const serverPath = path.join(extContext.extensionPath, "dist", "server.js");
  const { spawn } = require("child_process");

  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      // The extension owns the tunnel; a second one would double-dial the port.
      HACKPAIR_NO_TUNNEL: "1",
      // The extension install directory is replaced on update and can be
      // read-only, so keep the database in VS Code's global storage.
      HACKSYNC_DATA_DIR: extContext.globalStorageUri.fsPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProcess = child;

  let sawReadyMarker = false;
  let exited: { code: number | null } | null = null;
  let spawnError: Error | null = null;
  let errorOutput = "";

  child.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    if (text.includes(SERVER_READY)) sawReadyMarker = true;
    console.log("HackPair server:", text.trim());
  });

  child.stderr?.on("data", (data: Buffer) => {
    errorOutput += data.toString();
    console.error("HackPair server:", data.toString().trim());
  });

  child.on("error", (err: Error) => {
    spawnError = err;
  });

  child.on("exit", (code: number | null) => {
    exited = { code };
    if (serverProcess === child) serverProcess = null;
  });

  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // Read through a cast: these are only ever assigned from child process
    // callbacks, which TypeScript's control-flow analysis cannot see.
    const failure = spawnError as Error | null;
    if (failure) {
      stopServer();
      throw new Error(`Failed to start server: ${failure.message}`);
    }

    const ended = exited as { code: number | null } | null;
    if (ended) {
      const detail = errorOutput.trim().slice(-300);
      throw new Error(`Server exited (code ${ended.code}).${detail ? ` ${detail}` : ""}`);
    }
    if (await probeHealth(port, sawReadyMarker ? 2000 : 800)) {
      return serverHandle(port);
    }
    await delay(300);
  }

  stopServer();
  const detail = errorOutput.trim().slice(-300);
  throw new Error(
    detail
      ? `Server failed to start: ${detail}`
      : `Server did not become ready within ${SERVER_START_TIMEOUT_MS / 1000}s. Port ${port} may be in use by another application.`
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopServer() {
  const child = serverProcess;
  serverProcess = null;
  if (!child) return;
  try {
    if (process.platform === "win32" && child.pid) {
      // child.kill() does not reap the process tree on Windows.
      require("child_process").spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill();
    }
  } catch {
    try { child.kill(); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Map a document to the file id peers use: a POSIX-separated path relative to
 * the *shared* folder.
 *
 * The old code used `vscode.workspace.asRelativePath`, which is relative to the
 * VS Code workspace root. That is a different folder whenever the user picks a
 * folder in the share dialog, and returns an absolute path when no folder is
 * open — so cursors and edits never matched on the receiving side.
 */
function toSharedPath(fsPath: string): string | null {
  if (!workspaceFolder || !fsPath) return null;
  const relative = path.relative(workspaceFolder, fsPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return toPosix(relative);
}

function documentPath(doc: vscode.TextDocument): string | null {
  // Untitled buffers, output channels, git diffs, and the read-only previews we
  // open for teammates' files are not part of the shared folder.
  if (doc.uri.scheme !== "file") return null;
  return toSharedPath(doc.uri.fsPath);
}

// ---------------------------------------------------------------------------
// Workspace sharing
// ---------------------------------------------------------------------------

function syncWorkspace() {
  if (!workspaceFolder || !socketClient?.isConnected()) return;
  socketClient.emitWorkspaceSync(scanWorkspace(workspaceFolder));
}

function scheduleWorkspaceSync() {
  if (treeSyncTimer) clearTimeout(treeSyncTimer);
  // Rescanning the whole tree on every individual file event made large repos
  // unusable; batch bursts of changes into one scan.
  treeSyncTimer = setTimeout(() => {
    treeSyncTimer = null;
    syncWorkspace();
  }, TREE_DEBOUNCE_MS);
}

function startWorkspaceSync() {
  stopWorkspaceWatcher();
  scheduleWorkspaceSync();
  workspaceWatcher = watchWorkspace(workspaceFolder, (event, relativePath) => {
    if (event !== "changed") scheduleWorkspaceSync();
    if (event === "changed" && canEditRemote) {
      queueCodeEdit(relativePath, readFileContent(workspaceFolder, relativePath));
    }
  });
}

function stopWorkspaceWatcher() {
  workspaceWatcher?.dispose();
  workspaceWatcher = null;
  if (treeSyncTimer) {
    clearTimeout(treeSyncTimer);
    treeSyncTimer = null;
  }
  for (const pending of pendingEdits.values()) clearTimeout(pending.timer);
  pendingEdits.clear();
}

/** Debounce per file so a burst of keystrokes sends one payload, not one each. */
function queueCodeEdit(fileId: string, content: string) {
  if (applyingRemoteEdit.has(fileId)) return;
  const existing = pendingEdits.get(fileId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const pending = pendingEdits.get(fileId);
    pendingEdits.delete(fileId);
    if (!pending || !socketClient?.isConnected() || !canEditRemote) return;
    socketClient.emitCodeEdit(fileId, pending.content);
  }, EDIT_DEBOUNCE_MS);
  pendingEdits.set(fileId, { content, timer });
}

async function resolveWorkspaceFolder(): Promise<string | null> {
  const current = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (current) return current;

  const folder = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: "Share This Folder",
    title: "Select workspace folder to share",
  });

  return folder?.[0]?.fsPath || null;
}

function parseInviteLink(link: string): { serverUrl: string; inviteCode: string } | null {
  try {
    const trimmed = link.trim();
    if (trimmed.length > 500) return null;
    if (/^https?:\/\//.test(trimmed)) {
      const url = new URL(trimmed);
      const code = url.searchParams.get("room");
      if (!code) return null;
      return { serverUrl: `${url.protocol}//${url.host}`, inviteCode: code.toUpperCase() };
    }
    if (/^[A-Za-z0-9]{6}$/.test(trimmed)) {
      return { serverUrl: `http://127.0.0.1:${SERVER_PORT}`, inviteCode: trimmed.toUpperCase() };
    }
    return null;
  } catch { return null; }
}

const SESSION_KEYS = [
  "hackpair.roomId",
  "hackpair.token",
  "hackpair.roomName",
  "hackpair.inviteCode",
  "hackpair.inviteUrl",
  "hackpair.role",
  "hackpair.canEdit",
  "hackpair.serverUrl",
];

async function clearSession(ctx: vscode.ExtensionContext) {
  for (const key of SESSION_KEYS) {
    await ctx.globalState.update(key, undefined);
  }
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(ctx: vscode.ExtensionContext) {
  extContext = ctx;
  cursorManager = new CursorManager();
  cursorManager.setPathResolver(documentPath);
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

      const folder = await resolveWorkspaceFolder();
      if (!folder) return;
      workspaceFolder = folder;
      canEditRemote = true;

      sidebar?.updateState({ connecting: true, error: "" });
      try {
        const { port, localUrl, lanUrl } = await startServer();

        let shareUrl = lanUrl;
        try {
          cfTunnel = await CloudflareTunnel.start(port, ctx);
          const tunnelUrl = cfTunnel.getUrl();
          if (tunnelUrl) {
            shareUrl = tunnelUrl;
            vscode.window.showInformationMessage(`HackPair: Public tunnel active.`);
          }
        } catch (tunnelErr: any) {
          console.warn("HackPair: Cloudflare tunnel failed:", tunnelErr.message);
          vscode.window.showWarningMessage(`HackPair: ${tunnelErr.message}. Using local network link.`);
        }

        const res = await fetch(`${localUrl}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${displayName}'s Room` }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const room = await res.json() as { id: string; name: string; inviteCode: string };

        const joinRes = await fetch(`${localUrl}/api/rooms/${room.id}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
        if (!joinRes.ok) throw new Error("Failed to join");
        const joinData = await joinRes.json() as { memberId: string; token: string };

        await ctx.globalState.update("hackpair.roomId", room.id);
        await ctx.globalState.update("hackpair.token", joinData.token);
        await ctx.globalState.update("hackpair.roomName", room.name);
        await ctx.globalState.update("hackpair.inviteCode", room.inviteCode);
        await ctx.globalState.update("hackpair.serverUrl", localUrl);
        await ctx.globalState.update("hackpair.role", "host");
        await ctx.globalState.update("hackpair.canEdit", true);
        await ctx.globalState.update("hackpair.workspaceFolder", workspaceFolder);
        const inviteUrl = `${shareUrl}?room=${room.inviteCode}`;
        await ctx.globalState.update("hackpair.inviteUrl", inviteUrl);

        connectToServer(localUrl, ctx, room.id, joinData.token);

        sidebar?.updateState({ roomName: room.name, inviteCode: room.inviteCode, inviteUrl, memberId: joinData.memberId, displayName, connected: true, connecting: false, role: "host", canEdit: true });
        startWorkspaceSync();

        vscode.window.showInformationMessage(`HackPair: Room created! Share the invite link.`);
      } catch (err: any) {
        cfTunnel?.stop();
        cfTunnel = null;
        stopServer();
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

      const parsed = parseInviteLink(msg.inviteLink || "");
      if (!parsed) {
        sidebar?.updateState({ error: "Invalid invite link. Paste the full URL (e.g. http://192.168.1.100:3001?room=ABC123) or just the 6-character invite code." });
        return;
      }

      const folder = await resolveWorkspaceFolder();
      if (!folder) return;
      workspaceFolder = folder;
      canEditRemote = false;

      sidebar?.updateState({ connecting: true, error: "" });
      try {
        const { serverUrl, inviteCode } = parsed;
        const lookupRes = await fetch(`${serverUrl}/api/rooms/lookup?code=${encodeURIComponent(inviteCode)}`);
        if (!lookupRes.ok) throw new Error("Room not found.");
        const { id: roomId, name: roomName } = await lookupRes.json() as { id: string; name: string };

        const joinRes = await fetch(`${serverUrl}/api/rooms/${roomId}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
        if (!joinRes.ok) throw new Error("Failed to join");
        const joinData = await joinRes.json() as { memberId: string; token: string };

        await ctx.globalState.update("hackpair.roomId", roomId);
        await ctx.globalState.update("hackpair.token", joinData.token);
        await ctx.globalState.update("hackpair.roomName", roomName);
        await ctx.globalState.update("hackpair.inviteCode", inviteCode);
        await ctx.globalState.update("hackpair.serverUrl", serverUrl);
        await ctx.globalState.update("hackpair.role", "viewer");
        await ctx.globalState.update("hackpair.canEdit", false);
        await ctx.globalState.update("hackpair.workspaceFolder", workspaceFolder);
        const inviteUrl = `${serverUrl}?room=${inviteCode}`;
        await ctx.globalState.update("hackpair.inviteUrl", inviteUrl);

        connectToServer(serverUrl, ctx, roomId, joinData.token);

        sidebar?.updateState({ roomName, inviteCode, inviteUrl, memberId: joinData.memberId, displayName, connected: true, connecting: false, role: "viewer", canEdit: false });
        startWorkspaceSync();

        vscode.window.showInformationMessage(`HackPair: Joined "${roomName}"`);
      } catch (err: any) {
        const message = err.message || "";
        if (/fetch failed|ECONNREFUSED|ENOTFOUND|network|timeout/i.test(message)) {
          sidebar?.updateState({ connecting: false, error: `Cannot reach server at ${parsed.serverUrl}. Make sure the host's server is running and you're on the same network (or use a tunnel URL).` });
        } else {
          sidebar?.updateState({ connecting: false, error: message });
        }
      }
    }

    if (msg.type === "selectMember") {
      const memberId = msg.memberId;
      const name = msg.name;

      if (memberId === "self") {
        // Show your own shared tree. This used to call `vscode.openFolder`,
        // which reloaded the whole VS Code window and dropped the session.
        sidebar?.updateFileTree("self", workspaceFolder ? scanWorkspace(workspaceFolder) : []);
        sidebar?.updateState({ selectedMember: "self", selectedMemberName: name || "You" });
        return;
      }

      sidebar?.updateState({ selectedMember: memberId, selectedMemberName: name });

      if (!sidebar?.hasFileTree(memberId)) {
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
        const fullPath = safeResolve(workspaceFolder, filePath);
        if (fullPath) {
          vscode.window.showTextDocument(vscode.Uri.file(fullPath));
        }
        return;
      }

      socketClient?.emitFileRequest(memberId, filePath);
    }

    if (msg.type === "leave") {
      await leaveRoom(ctx);
    }

    if (msg.type === "requestEditAccess") {
      const host = sidebar?.getHostMember();
      if (!host) {
        vscode.window.showWarningMessage("HackPair: Host is not connected yet.");
        return;
      }
      socketClient?.emitEditRequest(host.memberId, "*");
      vscode.window.showInformationMessage("HackPair: Edit access requested.");
    }

    if (msg.type === "copyInvite") {
      if (msg.url) {
        await vscode.env.clipboard.writeText(msg.url);
        vscode.window.showInformationMessage("HackPair: Invite link copied!");
      }
    }
  });

  restoreSession(ctx);

  ctx.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((e) => {
    if (!socketClient?.isConnected()) return;
    const file = documentPath(e.textEditor.document);
    if (!file) return;
    const pos = e.textEditor.selection.active;
    socketClient.emitCursorMove(file, pos.line, pos.character);
  }));

  ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
    if (!socketClient?.isConnected() || !canEditRemote) return;
    const file = documentPath(e.document);
    if (!file) return;
    // Do not echo an edit we just received back to its sender.
    if (applyingRemoteEdit.has(file)) return;
    queueCodeEdit(file, e.document.getText());
  }));

  ctx.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor || !socketClient?.isConnected()) return;
    const file = documentPath(editor.document);
    if (file) socketClient.emitPresenceFile(file);
  }));

  ctx.subscriptions.push(vscode.workspace.onDidCreateFiles((e) => {
    e.files.forEach((f) => {
      const file = toSharedPath(f.fsPath);
      if (file) socketClient?.emitEvent("file_created", file);
    });
  }));

  ctx.subscriptions.push(vscode.workspace.onDidDeleteFiles((e) => {
    e.files.forEach((f) => {
      const file = toSharedPath(f.fsPath);
      if (file) socketClient?.emitEvent("file_deleted", file);
    });
  }));

  console.log("HackPair activated");
}

/** Restore a previous session on window reload, if the saved token still works. */
function restoreSession(ctx: vscode.ExtensionContext) {
  const savedRoomId = ctx.globalState.get<string>("hackpair.roomId");
  const savedToken = ctx.globalState.get<string>("hackpair.token");
  const savedServerUrl = ctx.globalState.get<string>("hackpair.serverUrl");
  if (!savedRoomId || !savedToken || !savedServerUrl) return;

  const savedRole = ctx.globalState.get<string>("hackpair.role");
  const savedCanEdit = ctx.globalState.get<boolean>("hackpair.canEdit") || savedRole === "host";
  const savedFolder = ctx.globalState.get<string>("hackpair.workspaceFolder");

  canEditRemote = savedCanEdit;
  workspaceFolder = savedFolder || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";

  sidebar?.updateState({
    roomName: ctx.globalState.get<string>("hackpair.roomName"),
    inviteCode: ctx.globalState.get<string>("hackpair.inviteCode"),
    inviteUrl: ctx.globalState.get<string>("hackpair.inviteUrl"),
    displayName: ctx.globalState.get<string>("hackpair.displayName"),
    connected: false,
    connecting: true,
    role: savedRole,
    canEdit: savedCanEdit,
  });

  (async () => {
    try {
      let serverUrl = savedServerUrl;
      if (savedRole === "host") {
        const handle = await startServer();
        serverUrl = handle.localUrl;
        await ctx.globalState.update("hackpair.serverUrl", serverUrl);
      }
      connectToServer(serverUrl, ctx, savedRoomId, savedToken);
      if (workspaceFolder) startWorkspaceSync();
    } catch (err: any) {
      console.warn("HackPair: Failed to reconnect:", err.message);
      await clearSession(ctx);
      sidebar?.reset();
      sidebar?.updateState({ connecting: false, error: "Could not restore your previous room. Please create or join again." });
    }
  })();
}

async function leaveRoom(ctx: vscode.ExtensionContext) {
  const serverUrl = ctx.globalState.get<string>("hackpair.serverUrl");
  const roomId = ctx.globalState.get<string>("hackpair.roomId");
  const token = ctx.globalState.get<string>("hackpair.token");

  // Tell the server before tearing down, so the member row is released and
  // doesn't count against the room's member limit.
  if (serverUrl && roomId && token) {
    try {
      await fetch(`${serverUrl}/api/rooms/${roomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch { /* best effort — we're leaving either way */ }
  }

  cfTunnel?.stop();
  cfTunnel = null;
  stopWorkspaceWatcher();
  canEditRemote = false;
  workspaceFolder = "";
  applyingRemoteEdit.clear();
  socketClient?.disconnect();
  socketClient = null;
  cursorManager?.clearAllCursors();
  await clearSession(ctx);
  await ctx.globalState.update("hackpair.workspaceFolder", undefined);
  sidebar?.reset();
  stopServer();
}

function connectToServer(url: string, ctx: vscode.ExtensionContext, roomId?: string, token?: string) {
  socketClient?.disconnect();
  socketClient = new SocketClient(url, roomId, token);
  const client = socketClient;

  client.onConnect(() => {
    sidebar?.updateState({ connected: true, connecting: false, error: "" });
    // Share the tree once the socket is actually up. Firing it on a fixed
    // timer meant the emit was usually dropped before the connection existed,
    // and teammates saw a permanently empty file list.
    syncWorkspace();
  });

  client.onDisconnect(() => sidebar?.updateState({ connected: false, members: [] }));

  client.onConnectError((err: any) => {
    if (client.authFailed()) return;
    console.warn("HackPair: socket connect error:", err?.message || err);
  });

  client.onAuthOk((data) => {
    const canEdit = Boolean(data?.canEdit);
    canEditRemote = canEdit;
    ctx.globalState.update("hackpair.role", data?.role);
    ctx.globalState.update("hackpair.canEdit", canEdit);
    sidebar?.updateState({ memberId: data?.memberId, role: data?.role, canEdit, connected: true, connecting: false });
  });

  client.onAuthError(async () => {
    client.disconnect();
    await clearSession(ctx);
    sidebar?.reset();
    sidebar?.updateState({ connecting: false, error: "Your session expired. Please create or join a room again." });
  });

  client.onMemberJoin((data) => sidebar?.addMember(data));
  client.onMemberLeave((data) => {
    sidebar?.removeMember(data.memberId);
    cursorManager?.removeCursor(data.memberId);
  });

  client.onCodeEdit((data) => applyRemoteEdit(data.fileId, data.content));

  client.onCodeSync(() => {
    // Y.js state sync is not wired up yet; raw code:edit carries the content.
  });

  client.onCodeDelta(() => {
    // Y.js delta updates are not wired up yet.
  });

  client.onCursorUpdate((data) => {
    cursorManager?.updateCursor(data.memberId, data.displayName, data.colour, data.fileId, data.line, data.col);
  });

  client.onWorkspaceSync((data) => {
    sidebar?.updateFileTree(data.memberId, data.fileTree);
  });

  client.onFileContent((data) => {
    if (data.filePath === "__tree__") {
      try {
        sidebar?.updateFileTree(data.memberId, JSON.parse(data.content));
      } catch {}
      return;
    }
    openReadOnlyFile(data.filePath, data.content);
  });

  client.onFileRequest((data) => {
    if (!workspaceFolder) return;
    const content = data.filePath === "__tree__"
      ? JSON.stringify(scanWorkspace(workspaceFolder))
      : readFileContent(workspaceFolder, data.filePath);
    client.emitFileContent(data.fromSocketId, data.filePath, content);
  });

  client.onEditRequest(async (data) => {
    const choice = await vscode.window.showInformationMessage(
      `${data.fromDisplayName} is requesting edit access.`,
      "Grant",
      "Deny"
    );
    if (choice === "Grant") {
      client.emitEditGrant(data.fromSocketId, data.filePath || "*");
      vscode.window.showInformationMessage(`HackPair: Edit access granted to ${data.fromDisplayName}.`);
    } else {
      client.emitEditDeny(data.fromSocketId, data.filePath || "*");
    }
  });

  client.onEditGrant(() => {
    canEditRemote = true;
    ctx.globalState.update("hackpair.canEdit", true);
    sidebar?.updateState({ canEdit: true });
    vscode.window.showInformationMessage("HackPair: Edit access granted.");
  });

  client.onEditRevoke(() => {
    canEditRemote = false;
    ctx.globalState.update("hackpair.canEdit", false);
    sidebar?.updateState({ canEdit: false });
    vscode.window.showWarningMessage("HackPair: Edit access revoked.");
  });

  client.onEditDeny(() => {
    vscode.window.showWarningMessage("HackPair: Edit access denied.");
  });

  client.connect();
}

function applyRemoteEdit(fileId: string, content: string) {
  if (typeof fileId !== "string" || typeof content !== "string") return;

  for (const editor of vscode.window.visibleTextEditors) {
    if (documentPath(editor.document) !== fileId) continue;
    if (editor.document.getText() === content) return;

    const lastLine = editor.document.lineCount - 1;
    const fullRange = new vscode.Range(0, 0, lastLine, editor.document.lineAt(lastLine).text.length);

    // Mark the file so the resulting onDidChangeTextDocument is not broadcast
    // straight back to the sender, which ping-ponged the edit between peers.
    applyingRemoteEdit.add(fileId);
    editor.edit(
      (editBuilder) => { editBuilder.replace(fullRange, content); },
      { undoStopBefore: false, undoStopAfter: false }
    ).then(
      () => applyingRemoteEdit.delete(fileId),
      () => applyingRemoteEdit.delete(fileId)
    );
    return;
  }
}

function openReadOnlyFile(filePath: string, content: string) {
  const fileName = path.basename(filePath);
  vscode.workspace.openTextDocument({ content, language: getLanguageId(fileName) }).then((doc) => {
    vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  });
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
  cfTunnel?.stop();
  cfTunnel = null;
  socketClient?.disconnect();
  socketClient = null;
  cursorManager?.dispose();
  stopWorkspaceWatcher();
  stopServer();
}
