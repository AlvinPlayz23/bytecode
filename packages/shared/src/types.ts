import type { z } from "zod";
import type {
  modelProviderSchema,
  modMetadataSchema,
  createProjectSchema,
  projectSchema,
  messageSchema,
  sendMessageSchema,
  compilationSchema,
  compilationStatusSchema,
  fileChangeSchema,
  toolEventSchema,
  agentFileWriteSchema,
  agentResponseSchema,
} from "./schemas";

export type ModelProvider = z.infer<typeof modelProviderSchema>;
export type ModMetadata = z.infer<typeof modMetadataSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Message = z.infer<typeof messageSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type Compilation = z.infer<typeof compilationSchema>;
export type CompilationStatus = z.infer<typeof compilationStatusSchema>;
export type FileChange = z.infer<typeof fileChangeSchema>;
export type ToolEvent = z.infer<typeof toolEventSchema>;
export type AgentFileWrite = z.infer<typeof agentFileWriteSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
