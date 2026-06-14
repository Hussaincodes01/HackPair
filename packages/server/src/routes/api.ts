import { FastifyInstance } from "fastify";
import { randomUUID, randomBytes } from "crypto";

const MEMBER_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
  "#F97316", "#14B8A6",
];

function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const maxValid = 252; // 256 - (256 % 36) = 252, ensures uniform distribution
  const bytes = randomBytes(12); // fetch extra for rejection sampling
  let code = "";
  let i = 0;
  while (code.length < 6) {
    if (i >= bytes.length) break;
    if (bytes[i] < maxValid) {
      code += chars[bytes[i] % chars.length];
    }
    i++;
  }
  return code;
}

function requireRoom(stmts: any, roomId: string, reply: any): any | null {
  const room = stmts.getRoom(roomId);
  if (!room) {
    reply.status(404).send({ error: "Room not found" });
    return null;
  }
  return room;
}

export function registerRoutes(app: FastifyInstance, stmts: any) {
  // Health check
  app.get("/api/health", async () => {
    return { status: "ok", version: "0.1.0", uptime: process.uptime() };
  });

  // Create room
  app.post("/api/rooms", async (request, reply) => {
    const { name } = (request.body || {}) as { name?: string };
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return reply.status(400).send({ error: "Name is required" });
    }
    if (name.trim().length > 100) {
      return reply.status(400).send({ error: "Name must be 100 characters or less" });
    }

    const id = randomUUID();
    const inviteCode = generateInviteCode();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    stmts.insertRoom(id, name.trim(), inviteCode, expiresAt);

    return { id, name: name.trim(), inviteCode };
  });

  // List rooms
  app.get("/api/rooms", async () => {
    return stmts.listRooms();
  });

  // Lookup room by invite code
  app.get("/api/rooms/lookup", async (request, reply) => {
    const { code } = (request.query || {}) as { code?: string };
    if (!code || typeof code !== "string") {
      return reply.status(400).send({ error: "Code is required" });
    }

    const room = stmts.getRoomByInviteCode(code.toUpperCase());
    if (!room) {
      return reply.status(404).send({ error: "Room not found" });
    }

    return { id: room.id, name: room.name };
  });

  // Get room details
  app.get("/api/rooms/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const room = requireRoom(stmts, id, reply);
    if (!room) return;

    const members = stmts.getRoomMembers(id);
    stmts.updateRoomActivity(id);

    return {
      id: room.id,
      name: room.name,
      inviteCode: room.invite_code,
      createdAt: room.created_at,
      expiresAt: room.expires_at,
      members: members.map((m: any) => ({
        id: m.id,
        roomId: m.room_id,
        displayName: m.display_name,
        colour: m.colour,
        joinedAt: m.joined_at,
        lastSeenAt: m.last_seen_at,
      })),
      fileTree: [
        {
          name: "src", path: "src", type: "directory",
          children: [
            { name: "components", path: "src/components", type: "directory", children: [
              { name: "Button.tsx", path: "src/components/Button.tsx", type: "file" },
            ]},
            { name: "index.ts", path: "src/index.ts", type: "file" },
            { name: "utils.ts", path: "src/utils.ts", type: "file" },
          ],
        },
        { name: "package.json", path: "package.json", type: "file" },
        { name: "README.md", path: "README.md", type: "file" },
        { name: "tsconfig.json", path: "tsconfig.json", type: "file" },
      ],
    };
  });

  // Join room
  app.post("/api/rooms/:id/join", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { displayName } = (request.body || {}) as { displayName?: string };

    if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
      return reply.status(400).send({ error: "Display name is required" });
    }
    if (displayName.trim().length > 50) {
      return reply.status(400).send({ error: "Display name must be 50 characters or less" });
    }

    const room = requireRoom(stmts, id, reply);
    if (!room) return;

    const memberId = randomUUID();
    const existingMembers = stmts.getRoomMembers(id);
    const colorIndex = existingMembers.length % MEMBER_COLORS.length;
    const colour = MEMBER_COLORS[colorIndex];

    stmts.insertMember(memberId, id, displayName.trim(), colour);
    stmts.updateRoomActivity(id);

    const token = `tok_${memberId}`;

    return {
      memberId,
      token,
      serverUrl: process.env.SERVER_URL || "http://localhost:3001",
      room: { id: room.id, name: room.name },
    };
  });

  // Get activity events
  app.get("/api/rooms/:id/activity", async (request, reply) => {
    const { id } = request.params as { id: string };
    const room = requireRoom(stmts, id, reply);
    if (!room) return;

    const { page = "1", pageSize = "20" } = (request.query || {}) as any;
    const limit = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
    const pageNum = Math.max(1, parseInt(page) || 1);
    const offset = (pageNum - 1) * limit;

    const events = stmts.getRoomEvents(id, limit, offset);
    const total = stmts.countRoomEvents(id);

    return {
      events: events.map((e: any) => ({
        id: e.id,
        memberId: e.member_id,
        memberName: e.member_name || "Unknown",
        type: e.type,
        filePath: e.file_path,
        createdAt: e.created_at,
      })),
      total,
      page: pageNum,
      pageSize: limit,
    };
  });

  // Get agent reports
  app.get("/api/rooms/:id/agents/reports", async (request, reply) => {
    const { id } = request.params as { id: string };
    const room = requireRoom(stmts, id, reply);
    if (!room) return;

    const reports = stmts.getRoomAgentReports(id, 10);
    return {
      reports: reports.map((r: any) => ({
        id: r.id,
        agentType: r.agent_type,
        outputText: r.output_text,
        createdAt: r.created_at,
      })),
    };
  });

  // Trigger agent
  app.post("/api/rooms/:id/agents/trigger", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { agentType } = (request.body || {}) as { agentType?: string };

    if (!agentType || !["structure", "progress"].includes(agentType)) {
      return reply.status(400).send({ error: "Valid agentType (structure|progress) required" });
    }

    const room = requireRoom(stmts, id, reply);
    if (!room) return;

    const members = stmts.getRoomMembers(id);
    const events = stmts.getRoomEvents(id, 50, 0);

    let outputText = "";
    if (agentType === "structure") {
      outputText = `Project Structure Analysis\n${"=".repeat(30)}\n\n`;
      outputText += `Files tracked: ${events.length}\n`;
      outputText += `Team members: ${members.length}\n\n`;
      outputText += `Recommendations:\n`;
      outputText += `- README.md present\n`;
      outputText += `- Consider adding tests/ directory\n`;
      outputText += `- Consider adding .gitignore\n`;
    } else {
      outputText = `Team Progress Summary\n${"=".repeat(30)}\n\n`;
      members.forEach((m: any) => {
        const memberEvents = events.filter((e: any) => e.member_id === m.id);
        outputText += `${m.display_name}: ${memberEvents.length} file operations\n`;
      });
    }

    const reportId = randomUUID();
    stmts.insertAgentReport(reportId, id, agentType, outputText);

    return { id: reportId, agentType, outputText, createdAt: new Date().toISOString() };
  });

  // Update progress
  app.patch("/api/rooms/:id/progress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { memberId, percentage, tasks } = (request.body || {}) as {
      memberId?: string;
      percentage?: number;
      tasks?: string;
    };

    if (!memberId || typeof percentage !== "number") {
      return reply.status(400).send({ error: "memberId and numeric percentage required" });
    }

    const room = requireRoom(stmts, id, reply);
    if (!room) return;

    const pct = Math.max(0, Math.min(100, Math.floor(percentage)));
    const progressId = `${id}_${memberId}`;
    stmts.upsertProgress(progressId, id, memberId, pct, tasks || "[]");

    return { success: true };
  });

  // Get room progress
  app.get("/api/rooms/:id/progress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const room = requireRoom(stmts, id, reply);
    if (!room) return;

    const progress = stmts.getRoomProgress(id);
    return {
      progress: progress.map((p: any) => ({
        memberId: p.member_id,
        displayName: p.display_name,
        percentage: p.percentage,
        tasks: p.tasks_json,
        updatedAt: p.updated_at,
      })),
    };
  });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    console.error("Unhandled error:", error);
    reply.status(500).send({ error: "Internal server error" });
  });
}
