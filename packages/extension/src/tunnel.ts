import * as vscode from "vscode";

export class CloudflareTunnel {
  private tunnelUrl: string | null = null;
  private stopFn: (() => void) | null = null;

  static async start(port: number): Promise<CloudflareTunnel> {
    const tunnel = new CloudflareTunnel();
    await tunnel.init(port);
    return tunnel;
  }

  private async init(port: number, timeoutMs = 30000): Promise<void> {
    let Cloudflared: any;
    try {
      Cloudflared = require("cloudflared");
    } catch {
      throw new Error("cloudflared package not found. Reinstall the extension.");
    }

    const fs = require("fs");

    if (!fs.existsSync(Cloudflared.bin)) {
      vscode.window.showInformationMessage("HackPair: Downloading Cloudflare tunnel binary (one-time)...");
      try {
        await Cloudflared.install(Cloudflared.bin);
      } catch (err: any) {
        throw new Error(`Failed to download tunnel binary: ${err.message}`);
      }
    }

    const t = Cloudflared.Tunnel.quick(`http://localhost:${port}`);
    this.stopFn = () => {
      try { t.stop(); } catch { /* ignore */ }
    };

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stopFn?.();
        reject(new Error("cloudflared tunnel timed out (30s). Check your internet connection or firewall."));
      }, timeoutMs);

      t.once("url", (url: string) => {
        clearTimeout(timer);
        this.tunnelUrl = url;
        resolve();
      });
      t.once("error", (err: Error) => {
        clearTimeout(timer);
        this.stopFn?.();
        reject(new Error(`Cloudflare tunnel error: ${err.message}`));
      });
      t.once("exit", (code: number | null) => {
        clearTimeout(timer);
        if (!this.tunnelUrl) {
          reject(new Error(`cloudflared exited (code ${code}) before providing a URL`));
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
