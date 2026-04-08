import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, ensureMigrated } from "@/lib/db";
import { getDocsEngine } from "@/lib/docs-loader";
import { sendMessageSchema, type ModelProvider } from "@bytecode/shared";
import { SandboxManager } from "@bytecode/sandbox-runtime";
import { AgentCore, createProvider } from "@bytecode/agent-core";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let stage = "initialize";

  try {
    stage = "migrate_db";
    await ensureMigrated();

    stage = "parse_request";
    const body = await request.json();
    const parsed = sendMessageSchema.parse(body);
    const db = getDb();
    const env = getEnv();

    stage = "load_project";
    const projectResult = await db.execute({
      sql: "SELECT * FROM projects WHERE id = ?",
      args: [id],
    });

    if (projectResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const project = projectResult.rows[0];
    console.info("POST /api/projects/[id]/message project_loaded", {
      projectId: id,
      provider: project.provider ?? "openrouter",
      sandboxId: project.sandbox_id,
    });

    // Save user message
    stage = "save_user_message";
    const userMsgId = nanoid();
    await db.execute({
      sql: "INSERT INTO messages (id, project_id, role, content) VALUES (?, ?, ?, ?)",
      args: [userMsgId, id, "user", parsed.content],
    });

    // Connect to sandbox
    stage = "connect_sandbox";
    const sandbox = await SandboxManager.connect(
      project.sandbox_id as string
    );

    // Load docs
    stage = "load_docs";
    const docsEngine = await getDocsEngine();

    // Get chat history
    stage = "load_chat_history";
    const historyResult = await db.execute({
      sql: "SELECT role, content FROM messages WHERE project_id = ? ORDER BY created_at ASC",
      args: [id],
    });

    const chatHistory = historyResult.rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content as string,
    }));

    // Create agent
    stage = "create_provider";
    const provider = ((project.provider as string | null) ??
      "openrouter") as ModelProvider;
    const model = createProvider({
      provider,
      openrouterApiKey: env.openrouterApiKey,
      openrouterBaseUrl: env.openrouterBaseUrl,
      openrouterModel: env.openrouterModel,
      googleApiKey: env.googleApiKey,
      googleModel: env.googleModel,
      openaiCompatibleApiKey: env.openaiCompatibleApiKey,
      openaiCompatibleBaseUrl: env.openaiCompatibleBaseUrl,
      openaiCompatibleModel: env.openaiCompatibleModel,
    });

    stage = "create_agent";
    const agent = new AgentCore({
      model,
      sandbox,
      docsEngine,
      exaApiKey: env.exaApiKey,
      modId: project.mod_id as string,
      modName: project.mod_name as string,
      packageName: project.package_name as string,
      minecraftVersion: project.minecraft_version as string,
      maxSteps: env.agentMaxSteps,
    });

    // Stream the agent — we wrap with a TransformStream to persist DB on completion
    stage = "stream_agent";
    const agentStream = agent.createStream(
      parsed.content,
      chatHistory.slice(0, -1)
    );

    // We need to save the assistant message after the stream finishes.
    // Use a TransformStream to intercept the "done" event.
    const assistantMsgId = nanoid();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const reader = agentStream.getReader();
    const decoder = new TextDecoder();

    // Pipe in background, intercept done event for DB persistence
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);

          // Parse to check for "done" event
          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "done") {
                const toolEvents = (event.toolsUsed ?? []).map((t: string) => ({ tool: t }));
                const fileChanges = event.fileChanges ?? [];
                const reasoning = event.reasoning ?? "";
                await db.execute({
                  sql: "INSERT INTO messages (id, project_id, role, content, reasoning, tool_events, file_changes) VALUES (?, ?, ?, ?, ?, ?, ?)",
                  args: [
                    assistantMsgId,
                    id,
                    "assistant",
                    event.message,
                    reasoning,
                    JSON.stringify(toolEvents),
                    JSON.stringify(fileChanges),
                  ],
                });
              }
            } catch {
              // parse error on partial chunks, ignore
            }
          }
        }
      } catch (err) {
        console.error("Stream pipe error:", err);
      } finally {
        await writer.close();
      }
    })();

    // Send the SSE metadata header + user message id as first event
    const encoder = new TextEncoder();
    const metaEvent = `data: ${JSON.stringify({
      type: "meta",
      userMessageId: userMsgId,
      assistantMessageId: assistantMsgId,
    })}\n\n`;

    const metaStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(metaEvent));
        controller.close();
      },
    });

    // Concatenate meta + agent streams
    const combinedStream = concatStreams(metaStream, readable);

    return new Response(combinedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("POST /api/projects/[id]/message error:", {
      projectId: id,
      stage,
      message,
      error,
    });
    return NextResponse.json(
      { error: `Failed at ${stage}: ${message}` },
      { status: 500 }
    );
  }
}

function concatStreams(
  ...streams: ReadableStream<Uint8Array>[]
): ReadableStream<Uint8Array> {
  let index = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (index < streams.length) {
        if (!reader) {
          reader = streams[index].getReader();
        }
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }
        reader.releaseLock();
        reader = null;
        index++;
      }
      controller.close();
    },
  });
}
