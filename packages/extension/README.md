<div align="center">

<img src="icon.png" width="120" />

# HackPair

### Real-Time Code Collaboration for Hackathon Teams

No cloud. No signup. No config. Just your IDE and your team.

[![Version](https://img.shields.io/badge/version-0.3.1-blue?style=flat-square)](https://github.com/Hussaincodes01/hackpair/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-purple?style=flat-square&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com)
[![Node](https://img.shields.io/badge/Node-18+-brightgreen?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

<br>

<img src="https://img.shields.io/badge/Real--Time-⚡-ffdd00?style=for-the-badge" />
<img src="https://img.shields.io/badge/Zero--Config-🎯-007acc?style=for-the-badge" />
<img src="https://img.shields.io/badge/Self--Hosted-🏠-ff4444?style=for-the-badge" />
<img src="https://img.shields.io/badge/No%20Cloud-☁️-888888?style=for-the-badge" />

</div>

---

## What is HackPair?

HackPair lets you and your teammates code together in real time. See each other's **cursors, code, and files** right in VS Code — with zero setup and zero accounts.

> **One extension. One link. Instant collaboration.**

---

## Features

| | |
|---|---|
| 🔴 **Live Cursors** | See where your teammates are working in your editor |
| 📝 **Real-Time Sync** | Code edits sync instantly across all members |
| 👥 **Team Awareness** | See who's online, click to view their file tree |
| 📂 **Shared Workspaces** | Browse any teammate's files from your sidebar |
| 🔒 **End-to-End Secure** | Your code stays on your machine; nothing leaves without permission |
| 🔄 **Auto-Reconnect** | Reopen VS Code → back in the room instantly |
| 🌐 **Public Tunnels** | Built-in Cloudflare tunnel — remote teammates connect automatically |
| 🛡️ **Edit Permissions** | Host controls who can edit; guests request access |

---

## Requirements

- **VS Code** 1.85 or later
- **Node.js** 18 or later (bundled with VS Code)

---

## Quick Start

### Install

Download the latest `.vsix` from [Releases](https://github.com/Hussaincodes01/hackpair/releases) and install:

```bash
code --install-extension hackpair-0.3.1.vsix
```

Or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/) (coming soon).

### Create a Room

1. Click the **HackPair** icon (<kbd>⇄</kbd>) in the VS Code sidebar
2. Enter your display name
3. Click **Create Room**
4. Select your workspace folder to share
5. **Copy the invite link** → share it with your team

### Join a Room

1. Click the **HackPair** icon in the VS Code sidebar
2. Enter your display name
3. Paste the invite link (or just the 6-character invite code)
4. Click **Join Room**
5. Select your workspace folder to share

---

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│  HackPair                                                 │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  My Room                                                  │
│  http://192.168.1.100:3001?room=ABC123                    │
│  [Copy Link]  [Copy Code]                                 │
│                                                           │
│  Team (3)                                                 │
│  ────────────────                                         │
│  🔵 Alice (you)                                           │
│  🟢 Bob                ← click to view their files        │
│  🟡 Charlie            ← click to view their files        │
│                                                           │
│  [Leave Room]                                             │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

1. **Host creates a room** → local server starts + Cloudflare tunnel (automatic)
2. **Host shares the link** → teammates paste it into their HackPair sidebar
3. **Everyone connects** → cursors, edits, and file trees sync in real-time
4. **Click any teammate** → browse their file tree → click a file → read their code

---

## Network & Security

| Scenario | How it Works |
|---|---|
| **Same WiFi / LAN** | Direct connection via local IP (`http://192.168.x.x:3001`) |
| **Remote Team** | Cloudflare Quick Tunnel — automatic, no account or token needed |
| **Custom Port** | Set `PORT` environment variable (defaults to 3001) |

### Security

- **No cloud — your code stays on your machine.** The server runs locally.
- **No accounts.** No usernames, passwords, or personal data collected.
- **Cryptographic tokens** (64-char random hex) authenticate each member.
- **Path traversal protection** — remote members cannot access files outside your shared workspace.
- **Edit permissions** — host controls who can edit files.
- **CORS** allows only localhost, LAN IPs, and `*.trycloudflare.com`.

---

## Commands & Contributing

| Command | Description |
|---|---|
| `npm run build` | Build all packages (shared, server, extension) |
| `npm run typecheck` | TypeScript type checking (all packages) |
| `npm run package` | Build + create `.vsix` for distribution (run in `packages/extension`) |

### Development Setup

```bash
git clone https://github.com/Hussaincodes01/hackpair.git
cd hackpair
npm install
npm run build
npm run package     # creates packages/extension/hackpair-0.3.1.vsix
```

### Tech Stack

| Layer | Technology |
|---|---|
| Server | [Fastify](https://fastify.io) |
| Real-time | [Socket.IO](https://socket.io) |
| Database | [sql.js](https://sql.js.org) (SQLite / WASM) |
| CRDT | [Y.js](https://yjs.dev) |
| Tunneling | [cloudflared](https://github.com/cloudflare/cloudflared) |
| Extension | [VS Code API](https://code.visualstudio.com/api) |

### Project Structure

```
hackpair/
├── packages/
│   ├── extension/         # VS Code extension
│   │   ├── src/           # TypeScript source
│   │   ├── dist/          # Bundled output
│   │   └── node_modules/  # cloudflared (bundled in vsix)
│   ├── server/            # Server source (bundled into extension/dist/)
│   ├── shared/            # Zod schemas & shared types
│   └── dashboard-tool/    # Standalone server + web dashboard
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built for hackathon teams everywhere**

[![GitHub](https://img.shields.io/badge/GitHub-Hussaincodes01-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Hussaincodes01)

</div>
