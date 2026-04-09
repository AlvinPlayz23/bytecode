"use client";

import { useState } from "react";
import type {
  Compilation,
  CreateProjectInput,
  ModelProvider,
  Project,
} from "@bytecode/shared";
import {
  DEFAULT_SANDBOX_TIMEOUT_MINUTES,
  FABRIC_TARGET_MINECRAFT_VERSION as FIXED_MC_VERSION,
} from "@bytecode/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Plus,
  Hammer,
  Download,
  Package,
  X,
  ChevronRight,
  CheckCircle,
  XCircle,
  Loader2,
  Blocks,
} from "lucide-react";

const providerOptions: Array<{
  value: ModelProvider;
  label: string;
  hint: string;
}> = [
  {
    value: "openrouter",
    label: "OpenRouter",
    hint: "nvidia/nemotron-3-super-120b-a12b:free",
  },
  {
    value: "google",
    label: "Google Gemini",
    hint: "gemini-2.5-flash by default",
  },
  {
    value: "openai-compatible",
    label: "OpenAI-compatible",
    hint: "NVIDIA NIM / minimaxai/minimax-m2.5",
  },
];

const providerLabels: Record<ModelProvider, string> = {
  openrouter: "OpenRouter",
  google: "Gemini",
  "openai-compatible": "OpenAI-comp",
};

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: (input: CreateProjectInput) => void;
  onCompile: () => void;
  onDownload: () => void;
  compilation: Compilation | null;
  loading: boolean;
}

export function Sidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onCompile,
  onDownload,
  compilation,
  loading,
}: SidebarProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    provider: "openrouter" as ModelProvider,
    modId: "",
    modName: "",
    packageName: "",
    description: "",
    sandboxTimeoutMinutes: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onCreateProject({
      provider: form.provider,
      sandboxTimeoutMinutes:
        form.sandboxTimeoutMinutes.trim() === ""
          ? undefined
          : Number(form.sandboxTimeoutMinutes),
      metadata: {
        modId: form.modId,
        modName: form.modName,
        packageName: form.packageName,
        description: form.description,
      },
    });
    setShowForm(false);
    setForm({
      provider: "openrouter",
      modId: "",
      modName: "",
      packageName: "",
      description: "",
      sandboxTimeoutMinutes: "",
    });
  }

  return (
    <aside className="w-72 border-r border-border bg-card flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Blocks className="size-4 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-sm font-bold tracking-tight">BYTECODE</h1>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Fabric Mod Builder
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Projects list */}
      <div className="flex-1 min-h-0">
        <div className="px-4 pt-3 pb-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
            Projects
          </span>
        </div>
        <ScrollArea className="h-[calc(100%-2rem)] px-2">
          <div className="space-y-0.5 pb-2">
            {projects.length === 0 && (
              <div className="px-2 py-6 text-center">
                <Package className="mx-auto mb-2 size-5 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground/60">No projects yet</p>
              </div>
            )}
            {projects.map((p) => {
              const isActive = activeProjectId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all group/project",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <ChevronRight className="size-3 text-primary shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[13px] truncate">
                        {p.metadata.modName}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {p.metadata.modId}
                        </span>
                        <span className="text-border">·</span>
                        <Badge variant="secondary" className="h-4 text-[9px] px-1.5">
                          {providerLabels[p.provider]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Create project */}
      <div className="p-3 border-t border-border">
        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                New Project
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowForm(false)}
              >
                <X className="size-3" />
              </Button>
            </div>

            <Select
              value={form.provider}
              onValueChange={(val) =>
                setForm({ ...form, provider: val as ModelProvider })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div className="text-xs">{option.label}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground -mt-1.5 px-0.5">
              {providerOptions.find((o) => o.value === form.provider)?.hint}
            </p>

            <Input
              type="text"
              placeholder="Mod ID (e.g. mymod)"
              value={form.modId}
              onChange={(e) => setForm({ ...form, modId: e.target.value })}
              required
              className="h-8 text-xs"
            />
            <Input
              type="text"
              placeholder="Mod Name"
              value={form.modName}
              onChange={(e) => setForm({ ...form, modName: e.target.value })}
              required
              className="h-8 text-xs"
            />
            <Input
              type="text"
              placeholder="Package (e.g. com.example.mymod)"
              value={form.packageName}
              onChange={(e) => setForm({ ...form, packageName: e.target.value })}
              required
              className="h-8 text-xs"
            />
            <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground">
              <Blocks className="size-3 text-primary" />
              <span className="font-mono">MC {FIXED_MC_VERSION}</span>
            </div>
            <Input
              type="text"
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="h-8 text-xs"
            />
            <div className="space-y-1">
              <Input
                type="number"
                min={1}
                max={1440}
                step={1}
                inputMode="numeric"
                placeholder={`Sandbox Timeout Minutes (optional, default ${DEFAULT_SANDBOX_TIMEOUT_MINUTES})`}
                value={form.sandboxTimeoutMinutes}
                onChange={(e) =>
                  setForm({ ...form, sandboxTimeoutMinutes: e.target.value })
                }
                className="h-8 text-xs"
              />
              <p className="px-0.5 text-[10px] text-muted-foreground">
                Optional. Enter minutes only. Leave blank to use the default timeout of{" "}
                {DEFAULT_SANDBOX_TIMEOUT_MINUTES} minutes.
              </p>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-8 text-xs font-mono uppercase tracking-wider"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </Button>
          </form>
        ) : (
          <Button
            onClick={() => setShowForm(true)}
            variant="outline"
            className="w-full h-8 text-xs gap-1.5"
          >
            <Plus className="size-3.5" />
            New Project
          </Button>
        )}
      </div>

      {/* Build controls */}
      {activeProjectId && (
        <>
          <Separator />
          <div className="p-3 space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
              Build
            </span>

            <Button
              onClick={onCompile}
              disabled={loading}
              className="w-full h-9 text-xs font-mono uppercase tracking-wider gap-2"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Hammer className="size-3.5" />
              )}
              {loading ? "Building..." : "Compile"}
            </Button>

            {compilation?.status === "success" && compilation.jarPath && (
              <Button
                onClick={onDownload}
                variant="outline"
                className="w-full h-8 text-xs gap-1.5"
              >
                <Download className="size-3.5" />
                Download JAR
              </Button>
            )}

            {compilation && (
              <div className="flex items-center gap-2 px-1">
                {compilation.status === "success" ? (
                  <CheckCircle className="size-3.5 text-success" />
                ) : compilation.status === "failure" ? (
                  <XCircle className="size-3.5 text-error" />
                ) : (
                  <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
                )}
                <span
                  className={cn(
                    "text-xs font-mono",
                    compilation.status === "success" && "text-success",
                    compilation.status === "failure" && "text-error",
                    compilation.status !== "success" &&
                      compilation.status !== "failure" &&
                      "text-muted-foreground"
                  )}
                >
                  {compilation.status}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
