"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Message, Compilation } from "@bytecode/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import {
  Send,
  Square,
  BrainCircuit,
  ChevronDown,
  FileCode,
  CheckCircle,
  XCircle,
  Loader2,
  Terminal,
  X,
  Search,
  BookOpen,
  FileText,
  Globe,
  Code2,
  FolderOpen,
  Pencil,
  Wrench,
  Blocks,
  MessageSquare,
} from "lucide-react";

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

const TOOL_INFO: Record<string, { icon: typeof Search; label: string }> = {
  search_docs: { icon: Search, label: "Searching docs" },
  list_docs: { icon: BookOpen, label: "Listing docs" },
  read_doc: { icon: FileText, label: "Reading doc" },
  get_minecraft_source: { icon: FileCode, label: "Reading MC source" },
  find_mapping: { icon: Code2, label: "Resolving mappings" },
  analyze_mixin: { icon: Wrench, label: "Checking mixin" },
  validate_access_widener: { icon: Wrench, label: "Checking widener" },
  search_web: { icon: Globe, label: "Searching web" },
  search_code_web: { icon: Code2, label: "Searching code" },
  crawl_web_page: { icon: Globe, label: "Reading page" },
  list_files: { icon: FolderOpen, label: "Listing files" },
  read_file: { icon: FileText, label: "Reading file" },
  write_file: { icon: Pencil, label: "Writing file" },
  run_bash: { icon: Terminal, label: "Running bash" },
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

  const activeTools = stream?.tools.filter((t) => t.status === "running") ?? [];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                <Blocks className="size-7 text-primary" />
              </div>
              <div className="text-center space-y-1.5">
                <h2 className="font-heading text-lg font-semibold tracking-tight">
                  Build your mod
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Describe what you want to create and the AI will write the
                  Fabric mod code for you.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {/* Live streaming area */}
          {stream && (
            <div className="flex justify-start">
              <div className="max-w-[85%] space-y-3">
                {/* Live tool activity */}
                {stream.tools.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                    {stream.tools.map((t, i) => {
                      const info = TOOL_INFO[t.toolName] ?? {
                        icon: Wrench,
                        label: t.toolName,
                      };
                      const Icon = info.icon;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "flex items-center gap-2 text-xs py-0.5",
                            t.status === "running"
                              ? "text-primary"
                              : "text-muted-foreground"
                          )}
                        >
                          {t.status === "running" ? (
                            <Loader2 className="size-3 animate-spin shrink-0" />
                          ) : (
                            <CheckCircle className="size-3 shrink-0" />
                          )}
                          <Icon className="size-3 shrink-0" />
                          <span className="font-mono text-[11px]">
                            {info.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Live file changes */}
                {stream.fileChanges.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Files Modified
                    </span>
                    {stream.fileChanges.map((path, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-success"
                      >
                        <FileCode className="size-3 shrink-0" />
                        <span className="font-mono text-[11px]">{path}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reasoning */}
                {stream.reasoning && (
                  <ReasoningBlock reasoning={stream.reasoning} isStreaming />
                )}

                {/* Streaming text */}
                {stream.text && (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                    {stream.text}
                  </div>
                )}

                {/* Step counter while tools are active */}
                {activeTools.length > 0 && (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                    <span>step {stream.stepCount}</span>
                    <span className="text-border">·</span>
                    <span>
                      {activeTools.length} tool
                      {activeTools.length !== 1 ? "s" : ""} running
                    </span>
                  </div>
                )}

                {/* Thinking indicator */}
                {!stream.text &&
                  activeTools.length === 0 &&
                  stream.tools.length > 0 && (
                    <Shimmer duration={1.5}>Thinking...</Shimmer>
                  )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Compile logs panel */}
      {compilation && showLogs && (
        <div className="border-t border-border max-h-48 overflow-y-auto bg-card/80">
          <div className="max-w-3xl mx-auto p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Compile Output
                </span>
                <Badge
                  variant={
                    compilation.status === "success"
                      ? "secondary"
                      : compilation.status === "failure"
                      ? "destructive"
                      : "secondary"
                  }
                  className="text-[10px] h-4"
                >
                  {compilation.status}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowLogs(false)}
              >
                <X className="size-3" />
              </Button>
            </div>

            {compilation.stderr && (
              <div className="mb-3">
                <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-error">
                  stderr
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-error/80 bg-error/5 rounded-md p-2.5 border border-error/10">
                  {compilation.stderr}
                </pre>
              </div>
            )}

            {compilation.stdout && (
              <div>
                <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  stdout
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground bg-muted/30 rounded-md p-2.5 border border-border">
                  {compilation.stdout}
                </pre>
              </div>
            )}

            {!compilation.stdout && !compilation.stderr && (
              <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                No output
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Compile log toggle */}
      {compilation && !showLogs && (
        <button
          onClick={() => setShowLogs(true)}
          className="text-xs font-mono text-center py-1.5 text-muted-foreground hover:text-foreground border-t border-border transition-colors"
        >
          Show compile logs
        </button>
      )}

      {/* Composer */}
      <div className="border-t border-border bg-card/50">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto p-4"
        >
          <div className="relative rounded-xl border border-border bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/30 transition-all">
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
              className="w-full bg-transparent rounded-xl px-4 py-3 text-sm outline-none resize-none placeholder:text-muted-foreground/50"
            />
            <div className="flex items-center justify-end px-3 pb-2.5">
              <Button
                type="submit"
                disabled={!input.trim() || streaming}
                size="sm"
                className="h-7 px-3 text-xs font-mono gap-1.5"
              >
                {streaming ? (
                  <>
                    <Square className="size-3" />
                    Stop
                  </>
                ) : (
                  <>
                    <Send className="size-3" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] text-sm",
          isUser
            ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-3"
            : "space-y-3"
        )}
      >
        {/* Reasoning (assistant only) */}
        {!isUser && msg.reasoning && (
          <ReasoningBlock reasoning={msg.reasoning} />
        )}

        {/* Content */}
        <div className={cn("whitespace-pre-wrap leading-relaxed", !isUser && "text-foreground")}>
          {msg.content}
        </div>

        {/* Tool events */}
        {msg.toolEvents && msg.toolEvents.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap gap-1 pt-2",
              isUser
                ? "border-t border-primary-foreground/20"
                : "border-t border-border"
            )}
          >
            {msg.toolEvents.map((te, i) => {
              const info = TOOL_INFO[te.tool];
              const Icon = info?.icon ?? Wrench;
              return (
                <Badge
                  key={i}
                  variant="secondary"
                  className="gap-1 text-[10px] h-5 font-mono"
                >
                  <Icon className="size-2.5" />
                  {te.tool}
                </Badge>
              );
            })}
          </div>
        )}

        {/* File changes */}
        {msg.fileChanges && msg.fileChanges.length > 0 && (
          <div
            className={cn(
              "space-y-1 pt-2",
              isUser
                ? "border-t border-primary-foreground/20"
                : "border-t border-border"
            )}
          >
            {msg.fileChanges.map((fc, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs"
              >
                <FileCode
                  className={cn(
                    "size-3 mt-0.5 shrink-0",
                    isUser ? "text-primary-foreground/70" : "text-success"
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-[11px]",
                    isUser
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  )}
                >
                  {fc.path}
                  {fc.purpose && (
                    <span className="ml-1.5 text-muted-foreground/60">
                      — {fc.purpose}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReasoningBlock({
  reasoning,
  isStreaming = false,
}: {
  reasoning: string;
  isStreaming?: boolean;
}) {
  return (
    <Collapsible defaultOpen={isStreaming}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full group/reasoning">
        <BrainCircuit className="size-3.5" />
        {isStreaming ? (
          <Shimmer duration={1.5}>Reasoning...</Shimmer>
        ) : (
          <span>View reasoning</span>
        )}
        <ChevronDown className="size-3 ml-auto transition-transform group-data-[state=open]/reasoning:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground font-mono">
            {reasoning}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
