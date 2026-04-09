"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { Chat } from "@/components/chat";
import type {
  Compilation,
  CreateProjectInput,
  Message,
  Project,
} from "@bytecode/shared";

interface ProjectState {
  project: Project;
  messages: Message[];
  compilation: Compilation | null;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectState | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data);
  }

  async function selectProject(id: string) {
    setLoading(true);
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    setActiveProject(data);
    setLoading(false);
  }

  async function createProject(input: CreateProjectInput) {
    setLoading(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (res.ok) {
      await fetchProjects();
      await selectProject(data.id);
    }
    setLoading(false);
  }

  function handleMessageSaved(userMsg: Message, assistantMsg: Message) {
    setActiveProject((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, userMsg, assistantMsg],
          }
        : null
    );
  }

  async function compile() {
    if (!activeProject) return;
    setLoading(true);
    const res = await fetch(
      `/api/projects/${activeProject.project.id}/compile`,
      { method: "POST" }
    );
    const data = await res.json();
    setActiveProject((prev) =>
      prev ? { ...prev, compilation: data } : null
    );
    setLoading(false);
  }

  async function downloadArtifact() {
    if (!activeProject) return;
    window.open(
      `/api/projects/${activeProject.project.id}/artifact`,
      "_blank"
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        projects={projects}
        activeProjectId={activeProject?.project.id ?? null}
        onSelectProject={selectProject}
        onCreateProject={createProject}
        onCompile={compile}
        onDownload={downloadArtifact}
        compilation={activeProject?.compilation ?? null}
        loading={loading}
      />
      <main className="flex-1 flex flex-col min-w-0">
        {activeProject ? (
          <Chat
            projectId={activeProject.project.id}
            messages={activeProject.messages}
            onMessageSaved={handleMessageSaved}
            compilation={activeProject.compilation}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="size-10 rounded-xl bg-muted/50 flex items-center justify-center">
              <span className="font-mono text-lg text-muted-foreground/50">{">"}_</span>
            </div>
            <p className="text-sm">Select or create a project to get started</p>
          </div>
        )}
      </main>
    </div>
  );
}
