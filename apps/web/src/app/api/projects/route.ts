import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb, ensureMigrated } from "@/lib/db";
import {
  createProjectSchema,
  FABRIC_TARGET_MINECRAFT_VERSION,
} from "@bytecode/shared";
import { SandboxManager } from "@bytecode/sandbox-runtime";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await ensureMigrated();
    const body = await request.json();
    const parsed = createProjectSchema.parse(body);
    const env = getEnv();

    if (!env.e2bTemplateId) {
      return NextResponse.json(
        { error: "E2B template ID not configured" },
        { status: 500 }
      );
    }

    const sandbox = await SandboxManager.create(env.e2bTemplateId);
    const id = nanoid();
    const db = getDb();

    await db.execute({
      sql: `INSERT INTO projects (id, sandbox_id, root_path, minecraft_version, mod_id, mod_name, package_name, description, provider)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        sandbox.sandboxId,
        "/workspace",
        FABRIC_TARGET_MINECRAFT_VERSION,
        parsed.metadata.modId,
        parsed.metadata.modName,
        parsed.metadata.packageName,
        parsed.metadata.description,
        parsed.provider,
      ],
    });

    const result = await db.execute({
      sql: "SELECT * FROM projects WHERE id = ?",
      args: [id],
    });

    return NextResponse.json(formatProject(result.rows[0]), { status: 201 });
  } catch (error) {
    console.error("POST /api/projects error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM projects ORDER BY created_at DESC"
  );
  return NextResponse.json(result.rows.map(formatProject));
}

function formatProject(row: Record<string, unknown>) {
  return {
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
  };
}
