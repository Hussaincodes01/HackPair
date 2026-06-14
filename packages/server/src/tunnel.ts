import { existsSync } from "fs";

export interface ActiveTunnel {
  url: string;
  stop: () => void;
}

/**
 * Start a Cloudflare Quick Tunnel (`trycloudflare.com`) pointing at the given
 * local port. Fully automatic: no Cloudflare account, no authtoken, no prompts.
 *
 * Returns the public `https://*.trycloudflare.com` URL. Rejects if the tunnel
 * can't be established within the timeout — callers should fall back to the
 * local network URL.
 */
export async function startTunnel(port: number, timeoutMs = 30000): Promise<ActiveTunnel> {
  const { Tunnel, bin, install } = require("cloudflared");

  // The platform binary ships with the package, but fetch it on demand if the
  // bundled copy is missing (e.g. installed on a different OS).
  if (!existsSync(bin)) {
    await install(bin);
  }

  // `Tunnel.quick` runs `cloudflared tunnel --url ...` — a quick tunnel that
  // needs no Cloudflare account or token.
  const t = Tunnel.quick(`http://localhost:${port}`);
  const stop = () => {
    try { t.stop(); } catch { /* ignore */ }
  };

  return new Promise<ActiveTunnel>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error("cloudflared tunnel timed out"));
    }, timeoutMs);

    let resolved = false;
    t.once("url", (url: string) => {
      clearTimeout(timer);
      resolved = true;
      resolve({ url, stop });
    });
    t.once("error", (err: Error) => {
      clearTimeout(timer);
      stop();
      reject(err);
    });
    t.once("exit", (code: number | null) => {
      clearTimeout(timer);
      if (!resolved) reject(new Error(`cloudflared exited (code ${code}) before providing a URL`));
    });
  });
}
