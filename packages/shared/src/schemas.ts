import { z } from "zod";

// ── Project ──────────────────────────────────────────────
export const FABRIC_TARGET_MINECRAFT_VERSION = "1.21.11" as const;

export const modelProviderSchema = z.enum([
  "openrouter",
  "google",
  "openai-compatible",
]);

export const modMetadataSchema = z.object({
  minecraftVersion: z.string(),
  modId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  modName: z.string().min(1),
  packageName: z.string().min(1),
  description: z.string().default(""),
});

export const createProjectMetadataSchema = z.object({
  modId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  modName: z.string().min(1),
  packageName: z.string().min(1),
  description: z.string().default(""),
});

export const createProjectSchema = z.object({
  metadata: createProjectMetadataSchema,
  provider: modelProviderSchema.default("openrouter"),
});

export const projectSchema = z.object({
  id: z.string(),
  sandboxId: z.string(),
  rootPath: z.string().default("/workspace"),
  provider: modelProviderSchema.default("openrouter"),
  metadata: modMetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── Messages ─────────────────────────────────────────────
export const fileChangeSchema = z.object({
  path: z.string(),
  purpose: z.string().optional(),
});

export const toolEventSchema = z.object({
  tool: z.string(),
  input: z.record(z.unknown()).optional(),
  output: z.unknown().optional(),
});

export const messageSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  reasoning: z.string().default(""),
  toolEvents: z.array(toolEventSchema).default([]),
  fileChanges: z.array(fileChangeSchema).default([]),
  createdAt: z.string(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1),
});

// ── Compilation ──────────────────────────────────────────
export const compilationStatusSchema = z.enum([
  "pending",
  "running",
  "success",
  "failure",
]);

export const compilationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: compilationStatusSchema,
  stdout: z.string().default(""),
  stderr: z.string().default(""),
  jarPath: z.string().nullable().default(null),
  createdAt: z.string(),
});

// ── Agent structured output ──────────────────────────────
export const agentFileWriteSchema = z.object({
  path: z.string(),
  purpose: z.string(),
});

export const agentResponseSchema = z.object({
  message: z.string(),
  reasoning: z.string().default(""),
  toolsUsed: z.array(z.string()).default([]),
  fileChanges: z.array(agentFileWriteSchema).default([]),
});
