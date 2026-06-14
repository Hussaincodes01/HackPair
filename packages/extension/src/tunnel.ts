/**
 * Cloudflare Quick Tunnel — fully automatic, zero-config public tunnelling.
 *
 * Uses Cloudflare's `trycloudflare.com` quick tunnels, which require no account,
 * no authtoken, and no user interaction. The `cloudflared` binary ships with the
 * npm package (downloaded on install) and is launched as a child process.
 */
export class CloudflareTunnel {
  private tunnelUrl: string | null = null;
  private stopFn: (() => void) | null = null;

  static async start(port: number): Promise<CloudflareTunnel> {
    const tunnel = new CloudflareTunnel();
    await tunnel.init(port);
    return tunnel;
  }

  private async init(port: number, timeoutMs = 30000): Promise<void> {
    const { Tunnel, bin, install } = require("cloudflared");
    const fs = require("fs");

    // The binary normally ships with the package, but the bundled copy is
    // platform-specific. Fetch the correct one on demand if it's missing.
    if (!fs.existsSync(bin)) {
      await install(bin);
    }

    // `Tunnel.quick` runs `cloudflared tunnel --url ...` — a quick tunnel that
    // needs no Cloudflare account or token.
    const t = Tunnel.quick(`http://localhost:${port}`);
    this.stopFn = () => {
      try { t.stop(); } catch { /* ignore */ }
    };

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stopFn?.();
        reject(new Error("cloudflared tunnel timed out"));
      }, timeoutMs);

      t.once("url", (url: string) => {
        clearTimeout(timer);
        this.tunnelUrl = url;
        resolve();
      });
      t.once("error", (err: Error) => {
        clearTimeout(timer);
        this.stopFn?.();
        reject(err);
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
