import * as vscode from "vscode";

export class SocketClient {
  private socket: any = null;
  private serverUrl: string;
  private _onConnect = new vscode.EventEmitter<void>();
  private _onDisconnect = new vscode.EventEmitter<void>();
  private _onMemberJoin = new vscode.EventEmitter<any>();
  private _onMemberLeave = new vscode.EventEmitter<any>();
  private _onCursorUpdate = new vscode.EventEmitter<any>();
  private _onCodeEdit = new vscode.EventEmitter<any>();
  private _onWorkspaceSync = new vscode.EventEmitter<any>();
  private _onFileRequest = new vscode.EventEmitter<any>();
  private _onFileContent = new vscode.EventEmitter<any>();
  private _onEditRequest = new vscode.EventEmitter<any>();
  private _onEditGrant = new vscode.EventEmitter<any>();
  private _onEditRevoke = new vscode.EventEmitter<any>();
  private _onEditDeny = new vscode.EventEmitter<any>();

  public readonly onConnect = this._onConnect.event;
  public readonly onDisconnect = this._onDisconnect.event;
  public readonly onMemberJoin = this._onMemberJoin.event;
  public readonly onMemberLeave = this._onMemberLeave.event;
  public readonly onCursorUpdate = this._onCursorUpdate.event;
  public readonly onCodeEdit = this._onCodeEdit.event;
  public readonly onWorkspaceSync = this._onWorkspaceSync.event;
  public readonly onFileRequest = this._onFileRequest.event;
  public readonly onFileContent = this._onFileContent.event;
  public readonly onEditRequest = this._onEditRequest.event;
  public readonly onEditGrant = this._onEditGrant.event;
  public readonly onEditRevoke = this._onEditRevoke.event;
  public readonly onEditDeny = this._onEditDeny.event;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
  }

  async connect() {
    try {
      const { io } = require("socket.io-client");
      this.socket = io(this.serverUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });

      this.socket.on("connect", () => {
        this._onConnect.fire();
      });

      this.socket.on("disconnect", () => {
        this._onDisconnect.fire();
      });

      this.socket.on("presence:join", (data: any) => this._onMemberJoin.fire(data));
      this.socket.on("presence:leave", (data: any) => this._onMemberLeave.fire(data));
      this.socket.on("cursor:move", (data: any) => this._onCursorUpdate.fire(data));
      this.socket.on("code:edit", (data: any) => this._onCodeEdit.fire(data));
      this.socket.on("workspace:sync", (data: any) => this._onWorkspaceSync.fire(data));
      this.socket.on("file:request", (data: any) => this._onFileRequest.fire(data));
      this.socket.on("file:content", (data: any) => this._onFileContent.fire(data));
      this.socket.on("edit:request", (data: any) => this._onEditRequest.fire(data));
      this.socket.on("edit:grant", (data: any) => this._onEditGrant.fire(data));
      this.socket.on("edit:revoke", (data: any) => this._onEditRevoke.fire(data));
      this.socket.on("edit:deny", (data: any) => this._onEditDeny.fire(data));
    } catch (err) {
      console.error("HackPair: failed to connect", err);
    }
  }

  connectToRoom(roomId: string, token: string) {
    if (!this.socket) return;
    this.socket.disconnect();
    const { io } = require("socket.io-client");
    this.socket = io(this.serverUrl, {
      transports: ["websocket", "polling"],
      auth: { roomId, token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on("connect", () => this._onConnect.fire());
    this.socket.on("disconnect", () => this._onDisconnect.fire());
    this.socket.on("presence:join", (data: any) => this._onMemberJoin.fire(data));
    this.socket.on("presence:leave", (data: any) => this._onMemberLeave.fire(data));
    this.socket.on("cursor:move", (data: any) => this._onCursorUpdate.fire(data));
    this.socket.on("code:edit", (data: any) => this._onCodeEdit.fire(data));
    this.socket.on("workspace:sync", (data: any) => this._onWorkspaceSync.fire(data));
    this.socket.on("file:request", (data: any) => this._onFileRequest.fire(data));
    this.socket.on("file:content", (data: any) => this._onFileContent.fire(data));
    this.socket.on("edit:request", (data: any) => this._onEditRequest.fire(data));
    this.socket.on("edit:grant", (data: any) => this._onEditGrant.fire(data));
    this.socket.on("edit:revoke", (data: any) => this._onEditRevoke.fire(data));
    this.socket.on("edit:deny", (data: any) => this._onEditDeny.fire(data));
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  emitCursorMove(fileId: string, line: number, col: number) {
    this.socket?.emit("cursor:move", { fileId, line, col });
  }

  emitCodeEdit(fileId: string, content: string) {
    this.socket?.emit("code:edit", { fileId, content });
  }

  emitPresenceFile(fileId: string) {
    this.socket?.emit("presence:file", { fileId });
  }

  emitEvent(type: string, filePath: string) {
    this.socket?.emit("event:log", { type, filePath });
  }

  emitWorkspaceSync(fileTree: any[]) {
    this.socket?.emit("workspace:sync", { fileTree });
  }

  emitFileRequest(targetMemberId: string, filePath: string) {
    this.socket?.emit("file:request", { targetMemberId, filePath });
  }

  emitFileContent(targetSocketId: string, filePath: string, content: string) {
    this.socket?.emit("file:content", { targetSocketId, filePath, content });
  }

  emitEditRequest(targetMemberId: string, filePath: string) {
    this.socket?.emit("edit:request", { targetMemberId, filePath });
  }

  emitEditGrant(targetSocketId: string, filePath: string) {
    this.socket?.emit("edit:grant", { targetSocketId, filePath });
  }

  emitEditRevoke(targetSocketId: string, filePath: string) {
    this.socket?.emit("edit:revoke", { targetSocketId, filePath });
  }

  emitEditDeny(targetSocketId: string, filePath: string) {
    this.socket?.emit("edit:deny", { targetSocketId, filePath });
  }
}
