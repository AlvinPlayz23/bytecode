"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Message, Compilation } from "@bytecode/shared";

interface ToolActivity {
  toolName: string;
  stepNumber: number;
  status: "running" | "done";
  result?: unknown;
}

interface StreamingState {
  reasoning: string;
  text: string;
  tools: ToolActivity[];
  fileChanges: string[];
  stepCount: number;
}

interface ChatProps {
  projectId: string;
  messages: Message[];
  onMessageSaved: (userMsg: Message, assistantMsg: Message) => void;
  compilation: Compilation | null;
}

const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  search_docs: { icon: "🔍", label: "Searching docs" },
  list_docs: { icon: "📚", label: "Listing docs" },
  read_doc: { icon: "📖", label: "Reading doc" },
  search_web: { icon: "🌐", label: "Searching web" },
  search_code_web: { icon: "🧩", label: "Searching code" },
  crawl_web_page: { icon: "🕸️", label: "Reading page" },
  list_files: { icon: "📁", label: "Listing files" },
  read_file: { icon: "📄", label: "Reading file" },
  write_file: { icon: "✏️", label: "Writing file" },
};

export function Chat({
  projectId,
  messages,
  onMessageSaved,
  compilation,
}: ChatProps) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [stream, setStream] = useState<StreamingState | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stream?.reasoning, stream?.text, stream?.tools]);

  useEffect(() => {
    if (compilation?.status === "failure") {
      setShowLogs(true);
    }
  }, [compilation?.id, compilation?.status]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || streaming) return;
      setStreaming(true);
      setStream({
        reasoning: "",
        text: "",
        tools: [],
        fileChanges: [],
        stepCount: 0,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      let userMsgId = "";
      let assistantMsgId = "";
      let finalReasoning = "";
      let finalMessage = "";
      let finalToolsUsed: string[] = [];
      let finalFileChanges: Array<{ path: string; purpose: string }> = [];

      try {
        const res = await fetch(`/api/projects/${projectId}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Request failed");
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const chunk of lines) {
            if (!chunk.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(chunk.slice(6));

              switch (event.type) {
                case "meta":
                  userMsgId = event.userMessageId;
                  assistantMsgId = event.assistantMessageId;
                  break;

                case "text-delta":
                  setStream((prev) =>
                    prev ? { ...prev, text: prev.text + event.text } : prev
                  );
                  break;

                case "reasoning-delta":
                  setStream((prev) =>
                    prev
                      ? { ...prev, reasoning: prev.reasoning + event.text }
                      : prev
                  );
                  break;

                case "tool-call-start":
                  setStream((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      tools: [
                        ...prev.tools,
                        {
                          toolName: event.toolName,
                          stepNumber: event.stepNumber,
                          status: "running",
                        },
                      ],
                    };
                  });
                  break;

                case "tool-call-end":
                  setStream((prev) => {
                    if (!prev) return prev;
                    const tools = [...prev.tools];
                    // Mark the last matching running tool as done
                    for (let i = tools.length - 1; i >= 0; i--) {
                      if (
                        tools[i].toolName === event.toolName &&
                        tools[i].status === "running"
                      ) {
                        tools[i] = {
                          ...tools[i],
                          status: "done",
                          result: event.result,
                        };
                        break;
                      }
                    }
                    return { ...prev, tools };
                  });
                  break;

                case "file-change":
                  setStream((prev) =>
                    prev
                      ? {
                          ...prev,
                          fileChanges: [...prev.fileChanges, event.path],
                        }
                      : prev
                  );
                  break;

                case "step-finish":
                  setStream((prev) =>
                    prev
                      ? { ...prev, stepCount: event.stepNumber + 1 }
                      : prev
                  );
                  break;

                case "done":
                  finalReasoning = event.reasoning ?? "";
                  finalMessage = event.message;
                  finalToolsUsed = event.toolsUsed;
                  finalFileChanges = event.fileChanges;
                  break;

                case "error":
                  throw new Error(event.error);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }

        // Persist to local state
        const now = new Date().toISOString();
        onMessageSaved(
          {
            id: userMsgId,
            projectId,
            role: "user",
            content,
            reasoning: "",
            toolEvents: [],
            fileChanges: [],
            createdAt: now,
          },
          {
            id: assistantMsgId,
            projectId,
            role: "assistant",
            content: finalMessage,
            reasoning: finalReasoning,
            toolEvents: finalToolsUsed.map((t) => ({ tool: t })),
            fileChanges: finalFileChanges,
            createdAt: now,
          }
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Stream error:", error);
        }
      } finally {
        setStreaming(false);
        setStream(null);
        abortRef.current = null;
      }
    },
    [projectId, streaming, onMessageSaved]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    const msg = input;
    setInput("");
    sendMessage(msg);
  }

  // Active tools = currently running
  const activeTools = stream?.tools.filter((t) => t.status === "running") ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-full text-[var(--muted)]">
            <p>Send a message to start building your mod</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Live streaming area */}
        {stream && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-3 text-sm bg-[var(--border)] space-y-3">
              {/* Live tool activity */}
              {stream.tools.length > 0 && (
                <div className="space-y-1.5">
                  {stream.tools.map((t, i) => {
                    const info = TOOL_LABELS[t.toolName] ?? {
                      icon: "🔧",
                      label: t.toolName,
                    };
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-2 text-xs ${
                          t.status === "running"
                            ? "text-[var(--accent)]"
                            : "text-[var(--muted)]"
                        }`}
                      >
                        {t.status === "running" ? (
                          <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="inline-block w-3 text-center">
                            ✓
                          </span>
                        )}
                        <span>
                          {info.icon} {info.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Live file changes */}
              {stream.fileChanges.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-1">
                  {stream.fileChanges.map((path, i) => (
                    <div key={i} className="text-xs text-[var(--success)]">
                      📄 {path}
                    </div>
                  ))}
                </div>
              )}

              {stream.reasoning && <ReasoningBlock reasoning={stream.reasoning} />}

              {/* Streaming text */}
              {stream.text && (
                <div className="whitespace-pre-wrap">{stream.text}</div>
              )}

              {/* Step counter while tools are active */}
              {activeTools.length > 0 && (
                <div className="text-[10px] text-[var(--muted)]">
                  Step {stream.stepCount} · {activeTools.length} tool
                  {activeTools.length !== 1 ? "s" : ""} running
                </div>
              )}

              {/* Thinking indicator when no text yet and tools are done */}
              {!stream.text && activeTools.length === 0 && stream.tools.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="inline-block w-3 h-3 border-2 border-[var(--muted)] border-t-transparent rounded-full animate-spin" />
                  Thinking...
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Compile logs panel */}
      {compilation && showLogs && (
        <div className="border-t border-[var(--border)] max-h-48 overflow-y-auto p-3 bg-black/50">
          <div className="flex justify-between items-center mb-2">
            <div>
              <div className="text-xs font-medium text-[var(--muted)]">
                Compile Logs
              </div>
              <div
                className={`text-[10px] ${
                  compilation.status === "success"
                    ? "text-[var(--success)]"
                    : compilation.status === "failure"
                    ? "text-[var(--error)]"
                    : "text-[var(--muted)]"
                }`}
              >
                Status: {compilation.status}
              </div>
            </div>
            <button
              onClick={() => setShowLogs(false)}
              className="text-xs text-[var(--muted)] hover:text-[var(--fg)]"
            >
              ✕
            </button>
          </div>

          {compilation.stderr && (
            <div className="mb-3">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--error)]">
                stderr
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--error)]">
                {compilation.stderr}
              </pre>
            </div>
          )}

          {compilation.stdout && (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                stdout
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--muted)]">
                {compilation.stdout}
              </pre>
            </div>
          )}

          {!compilation.stdout && !compilation.stderr && (
            <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--muted)]">
              No output
            </pre>
          )}
        </div>
      )}

      {/* Compile log toggle */}
      {compilation && !showLogs && (
        <button
          onClick={() => setShowLogs(true)}
          className="text-xs text-center py-1 text-[var(--muted)] hover:text-[var(--fg)] border-t border-[var(--border)]"
        >
          Show compile logs
        </button>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-[var(--border)]"
      >
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Describe what you want to build..."
            rows={2}
            className="flex-1 bg-[var(--border)] rounded-lg px-4 py-3 text-sm outline-none resize-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="bg-[var(--accent)] text-white rounded-lg px-5 py-3 text-sm font-medium disabled:opacity-50 self-end"
          >
            {streaming ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  return (
    <div
      className={`flex ${
        msg.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
          msg.role === "user"
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--border)]"
        }`}
      >
        {msg.role === "assistant" && msg.reasoning && (
          <div className="mb-3">
            <ReasoningBlock reasoning={msg.reasoning} />
          </div>
        )}

        <div className="whitespace-pre-wrap">{msg.content}</div>

        {/* Tool events */}
        {msg.toolEvents && msg.toolEvents.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-1">
            {msg.toolEvents.map((te, i) => (
              <span
                key={i}
                className="inline-block bg-white/10 rounded px-1.5 py-0.5 text-xs"
              >
                🔧 {te.tool}
              </span>
            ))}
          </div>
        )}

        {/* File changes */}
        {msg.fileChanges && msg.fileChanges.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
            {msg.fileChanges.map((fc, i) => (
              <div key={i} className="text-xs opacity-80">
                📄 {fc.path}
                {fc.purpose && (
                  <span className="text-[var(--muted)]">
                    {" "}
                    — {fc.purpose}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReasoningBlock({ reasoning }: { reasoning: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/10 px-3 py-2">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
        Reasoning
      </div>
      <div className="whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">
        {reasoning}
      </div>
    </div>
  );
}
