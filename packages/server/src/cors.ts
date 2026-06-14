/**
 * Shared CORS origin allow-list.
 *
 * Permits local development hosts, LAN IPv4 addresses, and Cloudflare quick
 * tunnel domains (`*.trycloudflare.com`). The Cloudflare tunnel is the public
 * link used to share a room with remote teammates, so its hostnames must be
 * allowed for both the HTTP API and the Socket.IO connection.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  // Same-origin / non-browser requests have no Origin header.
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      host.endsWith(".trycloudflare.com")
    );
  } catch {
    return false;
  }
}
