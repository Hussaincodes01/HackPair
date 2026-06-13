import { z } from "zod";

// Room
export const RoomSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  inviteCode: z.string().length(6),
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type Room = z.infer<typeof RoomSchema>;

// Member
export const MemberSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  displayName: z.string().min(1).max(50),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  joinedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});

export type Member = z.infer<typeof MemberSchema>;

// File Snapshot
export const SnapshotSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  memberId: z.string().uuid(),
  filePath: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

// Activity Event
export const EventTypeEnum = z.enum([
  "file_created",
  "file_modified",
  "file_deleted",
]);

export const EventSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  memberId: z.string().uuid(),
  type: EventTypeEnum,
  filePath: z.string(),
  createdAt: z.string().datetime(),
});

export type ActivityEvent = z.infer<typeof EventSchema>;

// Agent Report
export const AgentTypeEnum = z.enum(["structure", "progress"]);

export const AgentReportSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  agentType: AgentTypeEnum,
  outputText: z.string(),
  createdAt: z.string().datetime(),
});

export type AgentReport = z.infer<typeof AgentReportSchema>;

// Progress
export const ProgressSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  memberId: z.string().uuid(),
  percentage: z.number().min(0).max(100),
  tasksJson: z.string(),
  updatedAt: z.string().datetime(),
});

export type Progress = z.infer<typeof ProgressSchema>;

// File Tree Node
export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "directory"]),
  children: z.lazy(() => FileTreeNodeSchema.array()).optional(),
});
