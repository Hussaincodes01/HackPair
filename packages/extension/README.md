# HackPair

Real-time code collaboration for hackathon teams. See each other's **cursors, code, and files** live in VS Code.

## Features

- **Live Cursors** — See where your teammates are working in your editor
- **Real-Time Sync** — Code edits sync instantly across all members
- **Team Awareness** — See who's online, click to view their code
- **Shared Workspaces** — Browse anyone's file tree from your sidebar
- **100% Private** — Your code never leaves your machine
- **Auto-Reconnect** — Reopen VS Code, back in the team instantly
- **Remote Tunneling** — Built-in Telebit tunnel for remote teams (no setup needed)

## Quick Start

1. Click the **HackPair** icon in the VS Code sidebar
2. Enter your name, click **Create Room**
3. Pick your workspace folder to share
4. Copy the invite link and send it to your team

## Join a Room

1. Click the **HackPair** icon in the VS Code sidebar
2. Enter your name, paste the invite link
3. Click **Join Room** and pick your workspace folder

## Remote Access (Telebit)

When you create a room, HackPair automatically starts a **Telebit tunnel** and gives you a public `*.telebit.cloud` URL. Share this URL with teammates anywhere — no port forwarding, no VPN, no manual setup.

**First time only**: You'll be asked for your email (for certificate recovery) and to agree to the Telebit/Let's Encrypt TOS. After that, it's fully automatic.

If you already have Telebit installed globally, it uses that. If not, `npx` handles the download automatically.

## Security

- **CORS protection** — Only accepts requests from localhost, LAN IPs, and Telebit domains
- **Uniform invite codes** — Cryptographically random, no bias
- **Sandboxed server** — Extension process doesn't leak environment variables
- **Auto-reconnect** — Tokens stored securely in VS Code globalState

## Requirements

- VS Code 1.85+
- Node.js 18+

## What's New in 0.2.2

- **Telebit tunneling** — Automatic public URLs for remote teams
- **CORS hardened** — Blocked cross-origin abuse
- **Invite codes fixed** — Uniform random distribution
- **Memory leak fixed** — Socket event listeners properly cleaned up
- **Env leak fixed** — Server child process sandboxed

## License

MIT
