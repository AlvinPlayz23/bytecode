import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, ensureMigrated } from "@/lib/db";
import { SandboxManager } from "@bytecode/sandbox-runtime";

export const runtime = "nodejs";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let stage = "initialize";

  console.info("POST /api/projects/[id]/compile start", { projectId: id });

  await ensureMigrated();
  const db = getDb();

  stage = "load_project";
  const projectResult = await db.execute({
    sql: "SELECT * FROM projects WHERE id = ?",
    args: [id],
  });

  if (projectResult.rows.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project = projectResult.rows[0];
  const compileId = nanoid();

  stage = "create_compile_record";
  await db.execute({
    sql: "INSERT INTO compilations (id, project_id, status) VALUES (?, ?, ?)",
    args: [compileId, id, "running"],
  });

  try {
    stage = "connect_sandbox";
    console.info("POST /api/projects/[id]/compile connect_sandbox", {
      projectId: id,
      compileId,
      sandboxId: project.sandbox_id,
    });

    const sandbox = await SandboxManager.connect(
      project.sandbox_id as string
    );

    stage = "run_compile";
    console.info("POST /api/projects/[id]/compile run_compile", {
      projectId: id,
      compileId,
      command: "./gradlew build --stacktrace",
    });

    const result = await sandbox.compile();
    const status = result.success ? "success" : "failure";

    console.info("POST /api/projects/[id]/compile result", {
      projectId: id,
      compileId,
      status,
      stdoutLength: result.stdout.length,
      stderrLength: result.stderr.length,
      jarPath: result.jarPath,
    });

    if (!result.success) {
      console.error("POST /api/projects/[id]/compile build failure logs", {
        projectId: id,
        compileId,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }

    stage = "save_compile_result";
    await db.execute({
      sql: "UPDATE compilations SET status = ?, stdout = ?, stderr = ?, jar_path = ? WHERE id = ?",
      args: [status, result.stdout, result.stderr, result.jarPath, compileId],
    });

    return NextResponse.json({
      id: compileId,
      projectId: id,
      status,
      stdout: result.stdout,
      stderr: result.stderr,
      jarPath: result.jarPath,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error("POST /api/projects/[id]/compile error", {
      projectId: id,
      compileId,
      stage,
      message,
      error,
    });

    await db.execute({
      sql: "UPDATE compilations SET status = ?, stderr = ? WHERE id = ?",
      args: ["failure", message, compileId],
    });

    return NextResponse.json(
      {
        id: compileId,
        projectId: id,
        status: "failure",
        stdout: "",
        stderr: `Failed at ${stage}: ${message}`,
        jarPath: null,
        createdAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
