import { z } from "zod";

// WebSocket events: client -> server
export const CodeDeltaSchema = z.object({
  fileId: z.string(),
  update: z.string(), // base64 encoded Y.js binary delta
  memberId: z.string().uuid(),
});

export const CursorMoveSchema = z.object({
  fileId: z.string(),
  line: z.number(),
  col: z.number(),
  memberId: z.string().uuid(),
});

export const PresenceFileSchema = z.object({
  memberId: z.string().uuid(),
  fileId: z.string(),
});

export const ProgressUpdateSchema = z.object({
  memberId: z.string().uuid(),
  percentage: z.number().min(0).max(100),
  tasks: z.string(),
});

// WebSocket events: server -> client
export const PresenceJoinSchema = z.object({
  memberId: z.string().uuid(),
  displayName: z.string(),
  colour: z.string(),
});

export const PresenceLeaveSchema = z.object({
  memberId: z.string().uuid(),
});

export const AgentReportEventSchema = z.object({
  agentType: z.enum(["structure", "progress"]),
  summary: z.string(),
  suggestions: z.array(z.string()),
  timestamp: z.string().datetime(),
});

export const EventLogSchema = z.object({
  type: z.enum(["file_created", "file_modified", "file_deleted"]),
  fileId: z.string(),
  memberId: z.string().uuid(),
  timestamp: z.string().datetime(),
});

export type CodeDelta = z.infer<typeof CodeDeltaSchema>;
export type CursorMove = z.infer<typeof CursorMoveSchema>;
export type PresenceFile = z.infer<typeof PresenceFileSchema>;
export type ProgressUpdate = z.infer<typeof ProgressUpdateSchema>;
export type PresenceJoin = z.infer<typeof PresenceJoinSchema>;
export type PresenceLeave = z.infer<typeof PresenceLeaveSchema>;
export type AgentReportEvent = z.infer<typeof AgentReportEventSchema>;
export type EventLog = z.infer<typeof EventLogSchema>;
