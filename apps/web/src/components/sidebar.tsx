"use client";

import { useState } from "react";
import type {
  Compilation,
  CreateProjectInput,
  ModelProvider,
  Project,
} from "@bytecode/shared";
import { FABRIC_TARGET_MINECRAFT_VERSION as FIXED_MC_VERSION } from "@bytecode/shared";

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
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onCreateProject({
      provider: form.provider,
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
    });
  }

  return (
    <aside className="w-72 border-r border-[var(--border)] flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold">Bytecode</h1>
        <p className="text-xs text-[var(--muted)]">Fabric Mod Builder</p>
      </div>

      {/* Projects list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelectProject(p.id)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              activeProjectId === p.id
                ? "bg-[var(--accent)] text-white"
                : "hover:bg-[var(--border)]"
            }`}
          >
            <div className="font-medium">{p.metadata.modName}</div>
            <div className="text-xs text-[var(--muted)]">
              {p.metadata.modId} · {p.metadata.minecraftVersion} · {providerLabels[p.provider]}
            </div>
          </button>
        ))}
      </div>

      {/* Create project */}
      <div className="p-3 border-t border-[var(--border)]">
        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-2">
            <div>
              <select
                value={form.provider}
                onChange={(e) =>
                  setForm({
                    ...form,
                    provider: e.target.value as ModelProvider,
                  })
                }
                className="w-full bg-[var(--border)] rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
              >
                {providerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                {
                  providerOptions.find((option) => option.value === form.provider)
                    ?.hint
                }
              </p>
            </div>
            <input
              type="text"
              placeholder="Mod ID (e.g. mymod)"
              value={form.modId}
              onChange={(e) => setForm({ ...form, modId: e.target.value })}
              required
              className="w-full bg-[var(--border)] rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <input
              type="text"
              placeholder="Mod Name"
              value={form.modName}
              onChange={(e) => setForm({ ...form, modName: e.target.value })}
              required
              className="w-full bg-[var(--border)] rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <input
              type="text"
              placeholder="Package (e.g. com.example.mymod)"
              value={form.packageName}
              onChange={(e) =>
                setForm({ ...form, packageName: e.target.value })
              }
              required
              className="w-full bg-[var(--border)] rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <div className="rounded bg-[var(--border)] px-2 py-1.5 text-sm">
              Minecraft Version: {FIXED_MC_VERSION}
            </div>
            <input
              type="text"
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="w-full bg-[var(--border)] rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[var(--accent)] text-white rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-[var(--border)] hover:bg-[var(--accent)] text-sm rounded px-3 py-2 transition-colors"
          >
            + New Project
          </button>
        )}
      </div>

      {/* Build controls */}
      {activeProjectId && (
        <div className="p-3 border-t border-[var(--border)] space-y-2">
          <button
            onClick={onCompile}
            disabled={loading}
            className="w-full bg-[var(--success)] text-white rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Building..." : "⚡ Compile"}
          </button>

          {compilation?.status === "success" && compilation.jarPath && (
            <button
              onClick={onDownload}
              className="w-full bg-[var(--border)] hover:bg-[var(--accent)] text-sm rounded px-3 py-2 transition-colors"
            >
              ⬇ Download JAR
            </button>
          )}

          {compilation && (
            <div className="text-xs">
              <span
                className={
                  compilation.status === "success"
                    ? "text-[var(--success)]"
                    : compilation.status === "failure"
                    ? "text-[var(--error)]"
                    : "text-[var(--muted)]"
                }
              >
                Build: {compilation.status}
              </span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
