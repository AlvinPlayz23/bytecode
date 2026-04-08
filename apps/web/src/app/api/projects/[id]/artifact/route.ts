import { NextResponse } from "next/server";
import { getDb, ensureMigrated } from "@/lib/db";
import { SandboxManager } from "@bytecode/sandbox-runtime";

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

  const project = projectResult.rows[0];

  const compilationResult = await db.execute({
    sql: "SELECT * FROM compilations WHERE project_id = ? AND status = 'success' ORDER BY created_at DESC LIMIT 1",
    args: [id],
  });

  if (compilationResult.rows.length === 0 || !compilationResult.rows[0].jar_path) {
    return NextResponse.json(
      { error: "No successful build found" },
      { status: 404 }
    );
  }

  const compilation = compilationResult.rows[0];

  try {
    const sandbox = await SandboxManager.connect(
      project.sandbox_id as string
    );

    const content = await sandbox.downloadFile(compilation.jar_path as string);
    const fileName =
      (compilation.jar_path as string).split("/").pop() ?? "mod.jar";

    return new Response(content, {
      headers: {
        "Content-Type": "application/java-archive",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
