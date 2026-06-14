import { Server as SocketIOServer, Socket } from "socket.io";
import * as Y from "yjs";
import { randomUUID } from "crypto";

interface MemberState {
  memberId: string;
  displayName: string;
  colour: string;
  activeFile: string;
  fileTree: any[];
  role: "host" | "viewer";
}

interface RoomState {
  ydoc: Y.Doc;
  members: Map<string, MemberState>;
  socketToMember: Map<string, string>;
  memberSockets: Map<string, string>;
  hostMemberId: string | null;
  editPermissions: Set<string>;
}

export function setupSocketIO(io: SocketIOServer, stmts: any) {
  const rooms = new Map<string, RoomState>();

  function getOrCreateRoomState(roomId: string): RoomState {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        ydoc: new Y.Doc(),
        members: new Map(),
        socketToMember: new Map(),
        memberSockets: new Map(),
        hostMemberId: null,
        editPermissions: new Set(),
      });
    }
    return rooms.get(roomId)!;
  }

  function cleanupRoomIfEmpty(roomId: string) {
    const state = rooms.get(roomId);
    if (state && state.members.size === 0) {
      state.ydoc.destroy();
      rooms.delete(roomId);
    }
  }

  io.on("connection", (socket: Socket) => {
    const { token, roomId } = socket.handshake.auth;
    console.log(`Socket connected: ${socket.id} (room: ${roomId}, token: ${token ? "yes" : "no"})`);

    if (!roomId) {
      socket.disconnect();
      return;
    }

    socket.join(roomId);
    const state = getOrCreateRoomState(roomId);

    let member: any = null;
    let isDashboard = false;

    if (token && token.startsWith("tok_")) {
      const members = stmts.getRoomMembers(roomId);
      const memberId = token.replace("tok_", "");
      member = members.find((m: any) => m.id === memberId);
    }

    if (!member) {
      isDashboard = true;
      const dashboardId = `dashboard_${socket.id}`;
      member = { id: dashboardId, display_name: "Dashboard Viewer", colour: "#6c7086" };
    }

    if (!isDashboard && state.members.has(member.id)) {
      const oldSocketId = Array.from(state.socketToMember.entries())
        .find(([, mid]) => mid === member.id)?.[0];
      if (oldSocketId) state.socketToMember.delete(oldSocketId);
    }

    if (!isDashboard) {
      if (!state.hostMemberId || state.members.size === 0) {
        state.hostMemberId = member.id;
        state.editPermissions.add(member.id);
      }

      const role = member.id === state.hostMemberId ? "host" : "viewer";
      state.members.set(member.id, {
        memberId: member.id,
        displayName: member.display_name,
        colour: member.colour,
        activeFile: "",
        fileTree: [],
        role,
      });
      if (role === "host") state.editPermissions.add(member.id);
    }
    state.socketToMember.set(socket.id, member.id);
    if (!isDashboard) state.memberSockets.set(member.id, socket.id);

    // Send existing members to newly connected client
    state.members.forEach((m) => {
      if (m.memberId !== member.id) {
        socket.emit("presence:join", {
          memberId: m.memberId,
          displayName: m.displayName,
          colour: m.colour,
          role: m.role,
        });
        // Send their file tree
        if (m.fileTree.length > 0) {
          socket.emit("workspace:sync", {
            memberId: m.memberId,
            displayName: m.displayName,
            fileTree: m.fileTree,
          });
        }
      }
    });

    // Broadcast join
    socket.to(roomId).emit("presence:join", {
      memberId: member.id,
      displayName: member.display_name,
      colour: member.colour,
      role: state.members.get(member.id)?.role || "viewer",
    });

    // Send current Y.js state
    const ystate = Y.encodeStateAsUpdate(state.ydoc);
    socket.emit("code:sync", { update: Buffer.from(ystate).toString("base64") });

    // Handle cursor movement
    socket.on("cursor:move", (data: { fileId: string; line: number; col: number }) => {
      if (typeof data.line !== "number" || typeof data.col !== "number") return;
      if (typeof data.fileId !== "string") return;

      socket.to(roomId).emit("cursor:move", {
        memberId: member.id,
        displayName: member.display_name,
        colour: member.colour,
        fileId: data.fileId,
        line: data.line,
        col: data.col,
      });
    });

    // Handle raw text edit
    socket.on("code:edit", (data: { fileId: string; content: string }) => {
      if (typeof data.fileId !== "string" || typeof data.content !== "string") return;
      if (!state.editPermissions.has(member.id)) {
        socket.emit("edit:deny", { filePath: data.fileId, deniedBy: "Host" });
        return;
      }

      socket.to(roomId).emit("code:edit", {
        fileId: data.fileId,
        content: data.content,
        memberId: member.id,
      });
    });

    // Handle Y.js code delta
    socket.on("code:delta", (data: { fileId: string; update: string }) => {
      if (typeof data.fileId !== "string" || typeof data.update !== "string") return;
      if (!state.editPermissions.has(member.id)) {
        socket.emit("edit:deny", { filePath: data.fileId, deniedBy: "Host" });
        return;
      }
      try {
        const update = Buffer.from(data.update, "base64");
        Y.applyUpdate(state.ydoc, update);
        socket.to(roomId).emit("code:delta", {
          fileId: data.fileId,
          update: data.update,
          memberId: member.id,
        });
        stmts.updateRoomActivity(roomId);
      } catch (err) {
        console.error("Failed to apply Y.js update:", err);
      }
    });

    // Handle workspace sync — member shares their file tree
    socket.on("workspace:sync", (data: { fileTree: any[] }) => {
      if (!Array.isArray(data.fileTree)) return;

      const memberState = state.members.get(member.id);
      if (memberState) {
        memberState.fileTree = data.fileTree;
      }

      socket.to(roomId).emit("workspace:sync", {
        memberId: member.id,
        displayName: member.display_name,
        fileTree: data.fileTree,
      });
    });

    // Handle file request — someone wants to view a file
    socket.on("file:request", (data: { targetMemberId: string; filePath: string }) => {
      if (typeof data.targetMemberId !== "string" || typeof data.filePath !== "string") return;

      const targetSocketId = state.memberSockets.get(data.targetMemberId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("file:request", {
          requestId: randomUUID(),
          fromSocketId: socket.id,
          fromMemberId: member.id,
          fromDisplayName: member.display_name,
          filePath: data.filePath,
        });
      }
    });

    // Handle file content — response to file request
    socket.on("file:content", (data: { targetSocketId: string; filePath: string; content: string }) => {
      if (typeof data.targetSocketId !== "string") return;

      io.to(data.targetSocketId).emit("file:content", {
        filePath: data.filePath,
        content: data.content,
        memberId: member.id,
        displayName: member.display_name,
      });
    });

    // Handle edit request — someone wants write access
    socket.on("edit:request", (data: { targetMemberId: string; filePath: string }) => {
      if (typeof data.filePath !== "string") return;

      const targetMemberId = typeof data.targetMemberId === "string"
        ? data.targetMemberId
        : state.hostMemberId;
      if (!targetMemberId) return;

      const targetSocketId = state.memberSockets.get(targetMemberId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("edit:request", {
          fromSocketId: socket.id,
          fromMemberId: member.id,
          fromDisplayName: member.display_name,
          filePath: data.filePath,
        });
      }
    });

    // Handle edit grant
    socket.on("edit:grant", (data: { targetSocketId: string; filePath: string }) => {
      if (typeof data.targetSocketId !== "string") return;
      if (member.id !== state.hostMemberId) return;
      const targetMemberId = state.socketToMember.get(data.targetSocketId);
      if (targetMemberId) state.editPermissions.add(targetMemberId);
      io.to(data.targetSocketId).emit("edit:grant", {
        filePath: data.filePath,
        grantedBy: member.display_name,
      });
    });

    // Handle edit revoke
    socket.on("edit:revoke", (data: { targetSocketId: string; filePath: string }) => {
      if (typeof data.targetSocketId !== "string") return;
      if (member.id !== state.hostMemberId) return;
      const targetMemberId = state.socketToMember.get(data.targetSocketId);
      if (targetMemberId && targetMemberId !== state.hostMemberId) {
        state.editPermissions.delete(targetMemberId);
      }
      io.to(data.targetSocketId).emit("edit:revoke", {
        filePath: data.filePath,
      });
    });

    // Handle edit deny
    socket.on("edit:deny", (data: { targetSocketId: string; filePath: string }) => {
      if (typeof data.targetSocketId !== "string") return;
      io.to(data.targetSocketId).emit("edit:deny", {
        filePath: data.filePath,
        deniedBy: member.display_name,
      });
    });

    // Handle file presence
    socket.on("presence:file", (data: { fileId: string }) => {
      if (typeof data.fileId !== "string") return;
      const memberState = state.members.get(member.id);
      if (memberState && memberState.activeFile !== data.fileId) {
        memberState.activeFile = data.fileId;
        socket.to(roomId).emit("presence:file", {
          memberId: member.id,
          fileId: data.fileId,
        });
      }
    });

    // Handle file events
    socket.on("event:log", (data: { type: string; filePath: string }) => {
      if (data.type !== "file_created" && data.type !== "file_deleted") return;
      if (typeof data.filePath !== "string") return;
      const eventId = randomUUID();
      stmts.insertEvent(eventId, roomId, member.id, data.type, data.filePath);
      socket.to(roomId).emit("event:log", {
        type: data.type,
        fileId: data.filePath,
        memberId: member.id,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
      const memberId = state.socketToMember.get(socket.id);
      state.socketToMember.delete(socket.id);
      if (memberId) {
        state.memberSockets.delete(memberId);
        if (!isDashboard) {
          state.members.delete(memberId);
          if (memberId !== state.hostMemberId) {
            state.editPermissions.delete(memberId);
          } else {
            const nextHost = state.members.values().next().value as MemberState | undefined;
            state.hostMemberId = nextHost?.memberId || null;
            if (nextHost) {
              nextHost.role = "host";
              state.editPermissions.add(nextHost.memberId);
              io.to(roomId).emit("presence:join", {
                memberId: nextHost.memberId,
                displayName: nextHost.displayName,
                colour: nextHost.colour,
                role: "host",
              });
            }
          }
          socket.to(roomId).emit("presence:leave", { memberId });
        }
      }
      cleanupRoomIfEmpty(roomId);
    });
  });

  const cleanupInterval = setInterval(() => {
    stmts.deleteExpiredRooms();
  }, 60 * 60 * 1000);

  return { cleanupInterval };
}
