<div align="center">

# ⚡ HackPair

### Real-Time Code Collaboration for Hackathon Teams

**No cloud. No dashboard. No Docker. Just your IDE and your team.**

<br>

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/Hussaincodes01/hackpair)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-extension-purple.svg)](https://code.visualstudio.com)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-orange.svg)]()

<br>

<img src="https://img.shields.io/badge/Real--Time-⚡-yellow" alt="realtime"/>
<img src="https://img.shields.io/badge/Zero--Config-🎯-blue" alt="zeroconfig"/>
<img src="https://img.shields.io/badge/Self--Hosted-🏠-red" alt="selfhosted"/>
<img src="https://img.shields.io/badge/No%20Cloud-☁️-gray" alt="nocloud"/>

</div>

---

## 🔥 What is HackPair?

HackPair is a **self-hosted, real-time code collaboration tool** built for hackathon teams. It lets you and your teammates code together from anywhere — seeing each other's **cursors, code, and file trees** in real-time.

**One extension to start. One link to share. That's it.**

---

## 🎯 Two Ways to Use HackPair

### Option 1: VS Code Extension (Recommended)

**Install once, use forever.** The extension starts its own server automatically.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   1. Install hackpair-0.2.0.vsix                        │
│   2. Click "Create Room" in sidebar                     │
│   3. Pick your workspace folder to share                │
│   4. Share the invite link with your team               │
│   5. Click any member → see their code & files          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Option 2: Standalone Server + Dashboard

**For team leads who want more control.** Run the server separately with a web dashboard.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   1. Download hackpair-server                            │
│   2. Run: npx hackpair-server                           │
│   3. Open dashboard: http://localhost:3001              │
│   4. Share invite link with your team                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## ✨ Features

<table>
<tr>
<td>

### 🔴 Live Cursors
See where your teammates are working with colored cursor labels in your editor

</td>
<td>

### 📝 Real-Time Sync
Code edits sync instantly across all connected team members

</td>
</tr>
<tr>
<td>

### 👥 Team Awareness
See who's online, click their name to view their code and files

</td>
<td>

### 📂 Shared Workspaces
Each member shares their workspace folder. Browse anyone's file tree.

</td>
</tr>
<tr>
<td>

### 🔒 100% Private
Your code never leaves your machine. No cloud. No telemetry. No tracking.

</td>
<td>

### 🔄 Auto-Reconnect
Extension remembers your room. Reopen VS Code → back in the team instantly.

</td>
</tr>
</table>

---

## 🚀 Quick Start — VS Code Extension

### Prerequisites
- **VS Code** installed on all team members

### Install
```bash
# Download hackpair-0.2.0.vsix from GitHub releases
code --install-extension hackpair-0.2.0.vsix
```

### Use

**Leader (creates room):**
1. Open VS Code
2. Click the **HackPair** icon in the sidebar
3. Enter your name → Click **"Create Room"**
4. Pick your workspace folder to share
5. Copy the invite link → Share with team

**Team members (join room):**
1. Open VS Code
2. Click the **HackPair** icon in the sidebar
3. Enter your name → Paste the invite link → Click **"Join Room"**
4. Pick your workspace folder to share

### What You'll See

```
┌─────────────────────────────┐
│  ⚡ HackPair                │
├─────────────────────────────┤
│  My Team                    │
│                             │
│  http://192.168.1.100:3001  │
│  ?room=ABC123               │
│  [Copy Link] [Copy Code]    │
│                             │
│  Team (3)                   │
│  ─────────────────          │
│  🔵 Alice (you)             │
│  🟢 Bob          ← click   │
│  🟡 Charlie      ← click   │
│                             │
│  [Leave Room]               │
└─────────────────────────────┘
```

**Click a member** → See their file tree:
```
┌─────────────────────────────┐
│  ← Back        Bob          │
├─────────────────────────────┤
│  📁 app                     │
│    📄 index.py              │
│  📄 requirements.txt        │
└─────────────────────────────┘
```

**Click a file** → Opens read-only tab with their code.

---

## 🌐 Network Options

### Same WiFi (Local Network)
Leader's machine IP is shown when server starts:
```
http://192.168.1.100:3001
```

### Over Internet (Remote Team)
Use [ngrok](https://ngrok.com) to expose your server:
```bash
npx ngrok http 3001
```
This gives you a public URL like:
```
https://abc123.ngrok.io
```

### Port Forwarding
Forward port 3001 on your router to your machine's local IP.

---

## 🛠️ Project Structure

```
hackpair/
├── packages/
│   ├── extension/          # VS Code extension
│   │   ├── src/
│   │   │   ├── extension.ts      # Main activation + server launcher
│   │   │   ├── socket-client.ts  # WebSocket client
│   │   │   ├── cursor-manager.ts # Remote cursor display
│   │   │   ├── sidebar.ts        # Webview sidebar panel
│   │   │   └── workspace.ts      # File tree scanner
│   │   ├── dist/
│   │   │   ├── extension.js      # Bundled extension
│   │   │   ├── server.js         # Bundled server
│   │   │   └── sql-wasm.wasm     # SQLite WASM
│   │   └── hackpair-0.2.0.vsix   # Installable extension
│   │
│   ├── dashboard-tool/     # Standalone server + dashboard
│   │   ├── src/index.ts    # Server with dashboard serving
│   │   ├── public/dashboard.html  # Web dashboard
│   │   └── dist/index.js   # Bundled server
│   │
│   ├── server/             # Server source code
│   │   └── src/
│   │       ├── index.ts           # Server entry point
│   │       ├── database.ts        # SQLite (sql.js, zero native deps)
│   │       ├── routes/api.ts      # REST API
│   │       └── socket/handler.ts  # Real-time WebSocket handler
│   │
│   └── shared/             # Shared types & schemas
│
└── package.json
```

---

## ⚙️ Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **Server** | [Fastify](https://fastify.io) | Fast, lightweight HTTP framework |
| **Real-time** | [Socket.io](https://socket.io) | Reliable WebSocket with auto-reconnect |
| **Database** | [sql.js](https://sql.js.org) | SQLite in pure WASM — zero native deps |
| **CRDT** | [Y.js](https://yjs.dev) | Conflict-free real-time collaboration |
| **Extension** | [VS Code API](https://code.visualstudio.com/api) | Native IDE integration |
| **Language** | TypeScript | End-to-end type safety |

---

## 📋 API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rooms` | Create a new room |
| `GET` | `/api/rooms/:id` | Get room details |
| `POST` | `/api/rooms/:id/join` | Join a room |
| `GET` | `/api/rooms/lookup?code=XXX` | Find room by invite code |
| `GET` | `/api/rooms/:id/activity` | Get room activity |
| `GET` | `/api/rooms/:id/progress` | Get team progress |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `code:edit` | Both | Code content changed |
| `cursor:move` | Both | Cursor position changed |
| `presence:file` | Both | Active file changed |
| `presence:join` | Server → Client | Teammate joined |
| `presence:leave` | Server → Client | Teammate left |
| `workspace:sync` | Both | File tree synced |
| `file:request` | Both | Request file content |
| `file:content` | Both | Send file content |
| `edit:request` | Both | Request edit access |
| `edit:grant` | Both | Grant edit access |
| `edit:deny` | Both | Deny edit access |

---

## 🔧 Development

```bash
# Clone the repo
git clone https://github.com/Hussaincodes01/hackpair.git
cd hackpair

# Install dependencies
npm install

# Build shared types
npm run build --workspace=packages/shared

# Build extension
npm run build --workspace=packages/extension

# Build dashboard tool
cd packages/dashboard-tool && node build.js

# Start server in dev mode
npm run dev --workspace=packages/server
```

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ for hackathon teams everywhere**

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Hussaincodes01)
[![VS Code](https://img.shields.io/badge/VS%20Code-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

</div>
