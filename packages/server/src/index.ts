import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { createDatabase, stmts } from "./database";
import { registerRoutes } from "./routes/api";
import { setupSocketIO } from "./socket/handler";
import os from "os";

const PORT = parseInt(process.env.PORT || "3001");
const HOST = process.env.HOST || "0.0.0.0";

function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

async function main() {
  await createDatabase();

  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  registerRoutes(app, stmts);

  const address = await app.listen({ port: PORT, host: HOST });

  const io = new SocketIOServer(app.server, {
    cors: { origin: true, methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  const { cleanupInterval } = setupSocketIO(io, stmts);

  const ips = getLocalIPs();
  const ipDisplay = ips.length > 0
    ? ips.map(ip => `  → http://${ip}:${PORT}`).join("\n")
    : `  → http://localhost:${PORT}`;

  console.log(`
  ╔══════════════════════════════════════╗
  ║         HackSync v0.1.0             ║
  ║   Real-time code collaboration      ║
  ╚══════════════════════════════════════╝

  Server running at:
${ipDisplay}

  Share this URL with your team.
  They connect via the VS Code extension.

  Data stored in: ${process.env.HACKSYNC_DATA_DIR || "./.hacksync"}
  Press Ctrl+C to stop.
`);

  const shutdown = async () => {
    clearInterval(cleanupInterval);
    io.close();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
