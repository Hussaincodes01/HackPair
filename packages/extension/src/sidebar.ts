import * as vscode from "vscode";

export class CollaborationSidebar implements vscode.WebviewViewProvider {
  public static readonly viewType = "hackpair.panel";
  private _view?: vscode.WebviewView;
  private _state: any = {
    members: [],
    roomName: null,
    selectedMember: null,
    fileTrees: {},
    viewingFile: null,
  };
  private _onMsg = new vscode.EventEmitter<any>();

  public readonly onMessage = this._onMsg.event;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _globalState: vscode.Memento
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };

    const savedName = this._globalState.get<string>("hackpair.displayName") || "";
    this._state.displayName = savedName;

    const savedRoom = this._globalState.get<string>("hackpair.roomName");
    const savedInvite = this._globalState.get<string>("hackpair.inviteCode");
    const savedInviteUrl = this._globalState.get<string>("hackpair.inviteUrl");
    if (savedRoom) {
      this._state.roomName = savedRoom;
      this._state.inviteCode = savedInvite;
      this._state.inviteUrl = savedInviteUrl;
      this._state.connected = true;
    }

    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage((msg) => this._onMsg.fire(msg));
  }

  updateState(partial: any) {
    Object.assign(this._state, partial);
    this._view?.webview.postMessage({ type: "state", state: this._state });
  }

  addMember(member: any) {
    if (!this._state.members.find((m: any) => m.memberId === member.memberId)) {
      this._state.members.push(member);
      this._view?.webview.postMessage({ type: "state", state: this._state });
    }
  }

  removeMember(memberId: string) {
    this._state.members = this._state.members.filter((m: any) => m.memberId !== memberId);
    if (this._state.selectedMember === memberId) {
      this._state.selectedMember = null;
    }
    this._view?.webview.postMessage({ type: "state", state: this._state });
  }

  updateFileTree(memberId: string, fileTree: any) {
    this._state.fileTrees[memberId] = fileTree;
    this._view?.webview.postMessage({ type: "state", state: this._state });
  }

  hasFileTree(memberId: string): boolean {
    return Boolean(this._state.fileTrees[memberId]);
  }

  getHostMember(): any | null {
    return this._state.members.find((m: any) => m.role === "host") || null;
  }

  reset() {
    this._state = { members: [], roomName: null, displayName: this._state.displayName, fileTrees: {}, selectedMember: null, viewingFile: null, canEdit: false };
    this._view?.webview.postMessage({ type: "state", state: this._state });
  }

  private getHtml(): string {
    return /*html*/ `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-sideBar-background);padding:0;line-height:1.4}
.section{padding:10px 12px}
.label{font-size:10px;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;font-weight:600}
.input{width:100%;padding:6px 8px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);border-radius:4px;font-size:12px;outline:none;margin-bottom:8px}
.input:focus{border-color:var(--vscode-focusBorder)}
.btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:4px;border:none;cursor:pointer;font-size:12px;font-weight:500;width:100%;margin-bottom:6px}
.btn:disabled{opacity:.5;cursor:not-allowed}
.bp{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.bp:hover{background:var(--vscode-button-hoverBackground)}
.bs{background:var(--vscode-secondaryButton-background);color:var(--vscode-secondaryButton-foreground)}
.bs:hover{background:var(--vscode-secondaryButton-hoverBackground)}
.bd{background:var(--vscode-errorForeground);color:white;opacity:.8}
.bd:hover{opacity:1}
.invite-url{font-family:'Courier New',monospace;font-size:11px;color:var(--vscode-terminal-ansiGreen);text-align:center;padding:8px;background:var(--vscode-editor-background);border-radius:6px;border:1px solid var(--vscode-panel-border);margin-bottom:8px;word-break:break-all;cursor:pointer;user-select:all}
.room-name{font-weight:600;font-size:13px;text-align:center;margin-bottom:10px}
.member{display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;border-left:3px solid transparent}
.member:hover{background:var(--vscode-list-hoverBackground)}
.member.selected{background:var(--vscode-list-activeSelectionBackground);border-left-color:var(--vscode-focusBorder)}
.dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.member-name{font-size:12px;flex:1}
.you{font-size:10px;color:var(--vscode-descriptionForeground);font-style:italic}
.status{font-size:11px;color:var(--vscode-descriptionForeground);text-align:center;padding:8px}
.copy-hint{font-size:10px;color:var(--vscode-descriptionForeground);text-align:center;margin-top:4px}
.divider{border:none;border-top:1px solid var(--vscode-panel-border);margin:0}
.or-divider{display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:11px;color:var(--vscode-descriptionForeground)}
.or-divider::before,.or-divider::after{content:'';flex:1;border-top:1px solid var(--vscode-panel-border)}
.file-tree{padding:0}
.tree-header{padding:8px 12px;font-size:11px;color:var(--vscode-descriptionForeground);font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;justify-content:space-between}
.tree-header .back{cursor:pointer;color:var(--vscode-textLink-foreground);font-size:11px}
.tree-header .back:hover{text-decoration:underline}
.tree-item{padding:4px 12px 4px 16px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px}
.tree-item:hover{background:var(--vscode-list-hoverBackground)}
.tree-item.dir{color:var(--vscode-descriptionForeground);font-weight:500}
.tree-item.file{color:var(--vscode-foreground)}
.tree-item .icon{font-size:12px;flex-shrink:0}
.tree-item .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tree-indent{padding-left:28px}
.copy-btn{padding:2px 8px;font-size:10px;border-radius:3px;border:1px solid var(--vscode-panel-border);background:transparent;color:var(--vscode-foreground);cursor:pointer}
.copy-btn:hover{background:var(--vscode-list-hoverBackground)}
.copy-btn.copied{color:var(--vscode-terminal-ansiGreen);border-color:var(--vscode-terminal-ansiGreen)}
</style>
</head><body>
<div id="app"></div>
<script>
const vscode = acquireVsCodeApi();
let state = ${JSON.stringify(this._state)};

function send(msg) { vscode.postMessage(msg); }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function render() {
  const app = document.getElementById('app');

  // STATE 1: In a room with file tree selected
  if (state.roomName && state.selectedMember) {
    const member = state.members.find(m => m.memberId === state.selectedMember);
    const isSelf = member && member.displayName === state.displayName;
    const fileTree = state.fileTrees[state.selectedMember] || [];
    const treeHtml = renderFileTree(fileTree, 0);

    app.innerHTML = \`
      <div class="tree-header">
        <span class="back" onclick="send({type:'deselectMember'})">\\u2190 Back</span>
        <span>\${esc(state.selectedMemberName || 'Unknown')}</span>
        <button class="copy-btn" id="copyTreeBtn" onclick="copyAllFiles()">Copy All</button>
      </div>
      <div class="file-tree">\${treeHtml || '<div class="status">No files shared yet</div>'}</div>
    \`;
    return;
  }

  // STATE 2: In a room — show invite + members
  if (state.roomName) {
    const inviteUrl = state.inviteUrl || '';
    app.innerHTML = \`
      <div class="section">
        <div class="room-name">\${esc(state.roomName)}</div>
        <div class="invite-url" id="inviteUrl" title="Click to copy invite link">\${esc(inviteUrl)}</div>
        <div style="display:flex;gap:4px;margin-top:6px">
          <button class="copy-btn" style="flex:1" onclick="copyInvite()">Copy Link</button>
          <button class="copy-btn" style="flex:1" onclick="copyCode()">Copy Code</button>
        </div>
        \${state.role !== 'host' && !state.canEdit ? '<button class="btn bs" style="margin-top:8px" onclick="send({type:\\'requestEditAccess\\'})">Request Edit Access</button><div class="copy-hint">Read-only until the host grants edits.</div>' : ''}
        \${state.role !== 'host' && state.canEdit ? '<div class="copy-hint">Edit access granted.</div>' : ''}
      </div>
      <hr class="divider">
      <div class="section" style="padding-bottom:4px">
        <div class="label">Team (\${state.members.length + 1})</div>
      </div>
      <div class="member selected" onclick="send({type:'selectMember', memberId:'self', name:'\${esc(state.displayName || 'You')}'})">
        <div class="dot" style="background:#3B82F6"></div>
        <div class="member-name">\${esc(state.displayName || 'You')}</div>
        <div class="you">you</div>
      </div>
      \${state.members.map(m => \`
        <div class="member" onclick="send({type:'selectMember', memberId:'\${esc(m.memberId)}', name:'\${esc(m.displayName)}'})">
          <div class="dot" style="background:\${esc(m.colour || '#666')}"></div>
          <div class="member-name">\${esc(m.displayName || 'Unknown')} \${m.role === 'host' ? '<span class="you">host</span>' : ''}</div>
        </div>
      \`).join('')}
      \${state.members.length === 0 ? '<div class="status">Waiting for teammates...</div>' : ''}
      <hr class="divider">
      <div class="section">
        <button class="btn bd" onclick="send({type:'leave'})">Leave Room</button>
      </div>
    \`;

    document.getElementById('inviteUrl')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(inviteUrl);
      vscode.postMessage({ type: 'copyInvite', url: inviteUrl });
      const el = document.getElementById('inviteUrl');
      el.style.borderColor = 'var(--vscode-terminal-ansiGreen)';
      setTimeout(() => el.style.borderColor = '', 1500);
    });
    return;
  }

  // STATE 3: Not in a room — show Create + Join
  const savedName = state.displayName || '';
  app.innerHTML = \`
    <div class="section">
      <div class="label">Your Name</div>
      <input class="input" id="name" placeholder="Enter your name" value="\${esc(savedName)}">
    </div>
    <div class="section">
      <button class="btn bp" id="createBtn">Create Room</button>
    </div>
    <div class="or-divider">or join existing</div>
    <div class="section">
      <div class="label">Paste Invite Link</div>
      <input class="input" id="link" placeholder="http://192.168.1.100:3001?room=ABC123">
      <button class="btn bs" id="joinBtn">Join Room</button>
    </div>
    \${state.connecting ? '<div class="status">Starting server...</div>' : ''}
    \${state.error ? '<div class="status" style="color:var(--vscode-errorForeground)">' + esc(state.error) + '</div>' : ''}
  \`;

  document.getElementById('createBtn')?.addEventListener('click', () => {
    const name = document.getElementById('name')?.value?.trim() || '';
    send({ type: 'create', displayName: name });
  });

  document.getElementById('joinBtn')?.addEventListener('click', () => {
    const name = document.getElementById('name')?.value?.trim() || '';
    const link = document.getElementById('link')?.value?.trim() || '';
    send({ type: 'join', inviteLink: link, displayName: name });
  });

  document.getElementById('link')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('joinBtn')?.click();
  });
}

function renderFileTree(items, depth) {
  if (!items || items.length === 0) return '';
  return items.map(item => {
    const indent = 'padding-left:' + (12 + depth * 16) + 'px';
    if (item.type === 'directory') {
      const children = renderFileTree(item.children, depth + 1);
      return '<div class="tree-item dir" style="' + indent + '"><span class="icon">\\uD83D\\uDCC1</span><span class="name">' + esc(item.name) + '</span></div>' + children;
    }
    return '<div class="tree-item file" style="' + indent + '" onclick="openFile(\\'' + esc(item.path) + '\\')"><span class="icon">\\uD83D\uDCC4</span><span class="name">' + esc(item.name) + '</span></div>';
  }).join('');
}

function openFile(path) {
  send({ type: 'openFile', path: path, memberId: state.selectedMember });
}

function copyInvite() {
  navigator.clipboard.writeText(state.inviteUrl || '');
  vscode.postMessage({ type: 'copyInvite', url: state.inviteUrl });
}

function copyCode() {
  const code = state.inviteCode || '';
  navigator.clipboard.writeText(code);
}

function copyAllFiles() {
  const tree = state.fileTrees[state.selectedMember] || [];
  const files = flattenFiles(tree);
  navigator.clipboard.writeText(files.map(f => f.path).join('\\n'));
}

function flattenFiles(items) {
  const result = [];
  for (const item of items || []) {
    if (item.type === 'file') result.push(item);
    else result.push(...flattenFiles(item.children));
  }
  return result;
}

window.addEventListener('message', (e) => {
  if (e.data.type === 'state') {
    state = e.data.state;
    render();
  }
});

render();
</script>
</body></html>`;
  }
}
