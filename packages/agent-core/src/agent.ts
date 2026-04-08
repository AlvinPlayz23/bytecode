import { ToolLoopAgent, stepCountIs } from "ai";
import type { LanguageModel } from "ai";
import type { SandboxManager } from "@bytecode/sandbox-runtime";
import type { DocsEngine } from "@bytecode/docs-engine";
import { buildSystemPrompt } from "./prompt";
import { createAgentTools } from "./tools";

export interface AgentConfig {
  model: LanguageModel;
  sandbox: SandboxManager;
  docsEngine: DocsEngine;
  exaApiKey?: string;
  modId: string;
  modName: string;
  packageName: string;
  minecraftVersion: string;
  maxSteps?: number;
}

export interface AgentRunResult {
  message: string;
  reasoning: string;
  toolsUsed: string[];
  fileChanges: Array<{ path: string; purpose: string }>;
}

/** SSE event types sent during streaming */
export type AgentStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call-start"; toolName: string; stepNumber: number }
  | { type: "tool-call-end"; toolName: string; stepNumber: number; result: unknown }
  | { type: "step-finish"; stepNumber: number; finishReason: string; toolsCalled: string[] }
  | { type: "file-change"; path: string }
  | { type: "done"; message: string; reasoning: string; toolsUsed: string[]; fileChanges: Array<{ path: string; purpose: string }> }
  | { type: "error"; error: string };

export class AgentCore {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Stream the agent's work as SSE events.
   * The caller gets a ReadableStream of serialized AgentStreamEvent lines.
   */
  createStream(
    userMessage: string,
    chatHistory: Array<{ role: "user" | "assistant"; content: string }>
  ): ReadableStream<Uint8Array> {
    const config = this.config;
    const encoder = new TextEncoder();
    const maxSteps =
      typeof config.maxSteps === "number" && config.maxSteps > 0
        ? config.maxSteps
        : 500;

    return new ReadableStream({
      async start(controller) {
        function send(event: AgentStreamEvent) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        }

        try {
          const tools = createAgentTools({
            docsEngine: config.docsEngine,
            sandbox: config.sandbox,
            exaApiKey: config.exaApiKey,
          });

          const agent = new ToolLoopAgent({
            model: config.model,
            instructions: buildSystemPrompt({
              modId: config.modId,
              modName: config.modName,
              packageName: config.packageName,
              minecraftVersion: config.minecraftVersion,
            }),
            tools,
            stopWhen: stepCountIs(maxSteps),
            onStepFinish: async ({ stepNumber, finishReason, toolCalls }) => {
              const called = toolCalls?.map((tc) => tc.toolName) ?? [];
              send({ type: "step-finish", stepNumber, finishReason: finishReason ?? "unknown", toolsCalled: called });
              console.info("[agent] step", { stepNumber, finishReason, toolsCalled: called });
            },
          });

          const messages = chatHistory.map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }));

          console.info("[agent] stream start", {
            userMessageLength: userMessage.length,
            chatHistoryCount: chatHistory.length,
            modId: config.modId,
            maxSteps,
          });

          const result = await agent.stream({
            messages: [
              ...messages,
              { role: "user" as const, content: userMessage },
            ],
          });

          // Stream text deltas
          let currentStep = 0;
          let reasoning = "";
          const toolsSeen = new Set<string>();
          const fileChanges: Array<{ path: string; purpose: string }> = [];

          for await (const part of result.fullStream) {
            switch (part.type) {
              case "start-step":
                break;
              case "reasoning-start":
                break;
              case "reasoning-delta":
                reasoning += part.text;
                send({ type: "reasoning-delta", text: part.text });
                break;
              case "reasoning-end":
                break;
              case "text-delta":
                send({ type: "text-delta", text: part.text });
                break;
              case "tool-call": {
                const toolName = part.toolName;
                toolsSeen.add(toolName);
                send({ type: "tool-call-start", toolName, stepNumber: currentStep });

                if (toolName === "write_file" && "input" in part && part.input && typeof part.input === "object" && "path" in part.input) {
                  const p = (part.input as { path: string }).path;
                  fileChanges.push({ path: p, purpose: "Written by agent" });
                  send({ type: "file-change", path: p });
                }
                break;
              }
              case "tool-result": {
                send({ type: "tool-call-end", toolName: part.toolName, stepNumber: currentStep, result: part.output });
                break;
              }
              case "finish-step":
                currentStep++;
                break;
            }
          }

          // Final response
          const finalText = await result.text;
          const toolsUsed = [...toolsSeen];

          send({
            type: "done",
            message: finalText,
            reasoning,
            toolsUsed,
            fileChanges,
          });

          console.info("[agent] stream complete", {
            responseLength: finalText.length,
            reasoningLength: reasoning.length,
            stepCount: currentStep,
            toolsUsed,
            fileChanges: fileChanges.map((f) => f.path),
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          send({ type: "error", error: msg });
          console.error("[agent] stream error", { error: msg });
        } finally {
          controller.close();
        }
      },
    });
  }
}
