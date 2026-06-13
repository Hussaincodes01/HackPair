import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { createDatabase, stmts } from "../../server/src/database";
import { registerRoutes } from "../../server/src/routes/api";
import { setupSocketIO } from "../../server/src/socket/handler";
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

  // Serve dashboard
  app.get("/", async (req, reply) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const htmlPath = path.join(__dirname, "..", "public", "dashboard.html");
      const html = fs.readFileSync(htmlPath, "utf8");
      return reply.type("text/html").send(html);
    } catch {
      return reply.type("text/html").send("<h1>HackPair Server</h1><p>Dashboard not found. Use the VS Code extension to connect.</p>");
    }
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
  ║       HackPair Server v0.1.0        ║
  ║   Real-time code collaboration      ║
  ╚══════════════════════════════════════╝

  Server running at:
${ipDisplay}

  Dashboard: http://localhost:${PORT}

  Share the URL with your team.
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
