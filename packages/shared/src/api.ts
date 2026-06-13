import { z } from "zod";

// POST /api/rooms
export const CreateRoomRequestSchema = z.object({
  name: z.string().min(1).max(100),
});

export const CreateRoomResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  inviteCode: z.string().length(6),
});

// POST /api/rooms/:id/join
export const JoinRoomRequestSchema = z.object({
  inviteCode: z.string().length(6),
  displayName: z.string().min(1).max(50),
});

export const JoinRoomResponseSchema = z.object({
  memberId: z.string().uuid(),
  token: z.string(),
  serverUrl: z.string().url(),
  room: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
});

// GET /api/rooms/:id
export const GetRoomResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  inviteCode: z.string().length(6),
  createdAt: z.string().datetime(),
  members: z.array(
    z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      colour: z.string(),
      joinedAt: z.string().datetime(),
      lastSeenAt: z.string().datetime(),
    })
  ),
});

// GET /api/rooms/:id/activity
export const ActivityEventResponseSchema = z.object({
  events: z.array(
    z.object({
      id: z.string().uuid(),
      memberId: z.string().uuid(),
      memberName: z.string(),
      type: z.enum(["file_created", "file_modified", "file_deleted"]),
      filePath: z.string(),
      createdAt: z.string().datetime(),
    })
  ),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

// GET /api/rooms/:id/agents/reports
export const AgentReportsResponseSchema = z.object({
  reports: z.array(
    z.object({
      id: z.string().uuid(),
      agentType: z.enum(["structure", "progress"]),
      outputText: z.string(),
      createdAt: z.string().datetime(),
    })
  ),
});

// POST /api/rooms/:id/agents/trigger
export const TriggerAgentRequestSchema = z.object({
  agentType: z.enum(["structure", "progress"]),
});

// PATCH /api/rooms/:id/progress
export const UpdateProgressRequestSchema = z.object({
  percentage: z.number().min(0).max(100),
  tasks: z.string(),
});

// GET /api/health
export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  version: z.string(),
  uptime: z.number(),
});

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
export type JoinRoomResponse = z.infer<typeof JoinRoomResponseSchema>;
export type GetRoomResponse = z.infer<typeof GetRoomResponseSchema>;
export type ActivityEventResponse = z.infer<typeof ActivityEventResponseSchema>;
export type AgentReportsResponse = z.infer<typeof AgentReportsResponseSchema>;
export type TriggerAgentRequest = z.infer<typeof TriggerAgentRequestSchema>;
export type UpdateProgressRequest = z.infer<typeof UpdateProgressRequestSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
