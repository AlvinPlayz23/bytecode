import { NextResponse } from "next/server";
import { getDb, ensureMigrated } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureMigrated();
  const { id } = await params;
  const db = getDb();

  const projectResult = await db.execute({
    sql: "SELECT * FROM projects WHERE id = ?",
    args: [id],
  });

  if (projectResult.rows.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const row = projectResult.rows[0];

  const messagesResult = await db.execute({
    sql: "SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC",
    args: [id],
  });

  const compilationResult = await db.execute({
    sql: "SELECT * FROM compilations WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [id],
  });

  const compilation =
    compilationResult.rows.length > 0 ? compilationResult.rows[0] : null;

  return NextResponse.json({
    project: {
      id: row.id,
      sandboxId: row.sandbox_id,
      rootPath: row.root_path,
      provider: row.provider ?? "openrouter",
      metadata: {
        minecraftVersion: row.minecraft_version,
        modId: row.mod_id,
        modName: row.mod_name,
        packageName: row.package_name,
        description: row.description,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    messages: messagesResult.rows.map((m) => ({
      id: m.id,
      projectId: m.project_id,
      role: m.role,
      content: m.content,
      reasoning: (m.reasoning as string) ?? "",
      toolEvents: JSON.parse(m.tool_events as string),
      fileChanges: JSON.parse(m.file_changes as string),
      createdAt: m.created_at,
    })),
    compilation: compilation
      ? {
          id: compilation.id,
          projectId: compilation.project_id,
          status: compilation.status,
          stdout: compilation.stdout,
          stderr: compilation.stderr,
          jarPath: compilation.jar_path,
          createdAt: compilation.created_at,
        }
      : null,
  });
}
