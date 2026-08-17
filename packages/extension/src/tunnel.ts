import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const EXECUTABLE = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";

export class CloudflareTunnel {
  private tunnelUrl: string | null = null;
  private stopFn: (() => void) | null = null;

  static async start(port: number, ctx: vscode.ExtensionContext): Promise<CloudflareTunnel> {
    const tunnel = new CloudflareTunnel();
    await tunnel.init(port, ctx);
    return tunnel;
  }

  /**
   * Locate the cloudflared executable, downloading it once if we have to.
   *
   * Windows builds ship the binary in `dist/bin` (see build.js). Other
   * platforms — and any build made on a different OS — fetch it into VS Code's
   * global storage, which unlike the extension directory is writable and
   * survives extension updates.
   */
  private async resolveBinary(Cloudflared: any, ctx: vscode.ExtensionContext): Promise<string> {
    const bundled = path.join(ctx.extensionPath, "dist", "bin", EXECUTABLE);
    if (fs.existsSync(bundled)) return bundled;

    const cached = path.join(ctx.globalStorageUri.fsPath, "bin", EXECUTABLE);
    if (fs.existsSync(cached)) return cached;

    vscode.window.showInformationMessage("HackPair: Downloading Cloudflare tunnel binary (one-time)...");
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    try {
      await Cloudflared.install(cached);
    } catch (err: any) {
      throw new Error(`Failed to download tunnel binary: ${err.message}`);
    }
    return cached;
  }

  private async init(port: number, ctx: vscode.ExtensionContext, timeoutMs = 30000): Promise<void> {
    // Bundled by esbuild rather than resolved from node_modules: the packaged
    // .vsix carries no node_modules, so requiring it from disk always failed
    // and the tunnel never started in a shipped build.
    const Cloudflared = require("cloudflared");

    const binary = await this.resolveBinary(Cloudflared, ctx);

    // A zip round-trip through the .vsix can drop the executable bit.
    if (process.platform !== "win32") {
      try { fs.chmodSync(binary, 0o755); } catch { /* best effort */ }
    }

    // Point the library at the binary we resolved instead of its own
    // node_modules-relative default, which does not exist once packaged.
    Cloudflared.use(binary);

    // 127.0.0.1 rather than localhost: the server binds 0.0.0.0 (IPv4 only), so
    // resolving localhost to ::1 first would make the origin unreachable.
    const t = Cloudflared.Tunnel.quick(`http://127.0.0.1:${port}`);
    this.stopFn = () => {
      try { t.stop(); } catch { /* ignore */ }
    };

    await new Promise<void>((resolve, reject) => {
      let url: string | null = null;
      let connected = false;
      let blockedPort = false;
      let settled = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          this.stopFn?.();
          reject(err);
        } else {
          resolve();
        }
      };

      const timer = setTimeout(() => {
        // cloudflared announces the public URL before it has finished dialling
        // the Cloudflare edge. Handing that URL out on a network that blocks
        // the tunnel gives every teammate an HTTP 530 page, so a URL alone is
        // not success — we need a registered connection too.
        if (url && !connected) {
          finish(new Error(
            blockedPort
              ? "Cloudflare tunnel could not connect — this network blocks outbound port 7844. Use the local network link instead."
              : "Cloudflare tunnel got a URL but never connected (30s). The link would not work, so it was discarded."
          ));
          return;
        }
        finish(new Error("cloudflared tunnel timed out (30s). Check your internet connection or firewall."));
      }, timeoutMs);

      // cloudflared's own preflight tells us exactly why it cannot connect.
      const watchDiagnostics = (line: string) => {
        if (typeof line === "string" && line.includes("7844")) blockedPort = true;
      };
      t.on("stdout", watchDiagnostics);
      t.on("stderr", watchDiagnostics);

      t.once("url", (u: string) => {
        url = u;
        if (connected) {
          this.tunnelUrl = u;
          finish();
        }
      });

      t.once("connected", () => {
        connected = true;
        if (url) {
          this.tunnelUrl = url;
          finish();
        }
      });

      t.once("error", (err: Error) => {
        finish(new Error(`Cloudflare tunnel error: ${err.message}`));
      });

      t.once("exit", (code: number | null) => {
        if (!this.tunnelUrl) {
          finish(new Error(`cloudflared exited (code ${code}) before providing a working URL`));
        }
      });
    });
  }

  getUrl(): string | null {
    return this.tunnelUrl;
  }

  async stop(): Promise<void> {
    this.stopFn?.();
    this.stopFn = null;
    this.tunnelUrl = null;
  }
}
