import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import matter from "gray-matter";
import { collectMarkdownFiles, collectTopics } from "./engine";
import type {
  DocEntry,
  DocsSourceConfig,
  GeneratedDocsIndex,
} from "./types";

const DEFAULT_SOURCES_PATH = path.resolve(process.cwd(), "docs", "sources.json");
const DEFAULT_INDEX_PATH = path.resolve(
  process.cwd(),
  "docs",
  ".generated",
  "index.json"
);

const OFFICIAL_FABRIC_DOCS_KEEP_PATHS = new Set([
  ".git",
  "versions",
  "versions/1.21.11",
  "versions/1.21.11/develop",
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveProjectPath(projectRoot: string, relativePath: string): string {
  return path.resolve(projectRoot, relativePath);
}

function resolveContentRoot(
  projectRoot: string,
  source: DocsSourceConfig
): string {
  return resolveProjectPath(
    projectRoot,
    source.contentSubpath
      ? path.join(source.localPath, source.contentSubpath)
      : source.localPath
  );
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function shouldKeepOfficialFabricPath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return true;

  for (const keepPath of OFFICIAL_FABRIC_DOCS_KEEP_PATHS) {
    if (normalized === keepPath || keepPath.startsWith(`${normalized}/`)) {
      return true;
    }
  }

  return false;
}

function pruneOfficialFabricDocsRepo(repoRoot: string): void {
  if (!fs.existsSync(repoRoot)) return;

  const stack = [repoRoot];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(repoRoot, fullPath);

      if (shouldKeepOfficialFabricPath(relativePath)) {
        if (entry.isDirectory()) {
          stack.push(fullPath);
        }
        continue;
      }

      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
}

function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)/m);
  return match?.[1]?.trim() || fallback;
}

function buildHeadingChunks(
  source: DocsSourceConfig,
  sourceRoot: string,
  filePath: string,
  content: string,
  matterData: Record<string, unknown>
): DocEntry[] {
  const relativePath = path.relative(sourceRoot, filePath).replace(/\\/g, "/");
  const fallbackTitle = path.basename(filePath).replace(/\.(md|mdx)$/i, "");
  const title =
    typeof matterData.title === "string" && matterData.title.trim().length > 0
      ? matterData.title.trim()
      : extractTitle(content, fallbackTitle);

  const lines = content.split(/\r?\n/);
  const chunks: DocEntry[] = [];
  let currentHeadingPath = [title];
  let buffer: string[] = [];
  let chunkIndex = 0;

  function flushChunk() {
    const chunkContent = buffer.join("\n").trim();
    if (!chunkContent) return;

    const frontmatterTopics = Array.isArray(matterData.topics)
      ? matterData.topics.filter((value): value is string => typeof value === "string")
      : [];

    const topics = collectTopics(chunkContent, [
      ...(source.topicHints ?? []),
      ...frontmatterTopics,
    ]);

    const tags = Array.isArray(matterData.tags)
      ? matterData.tags.filter((value): value is string => typeof value === "string")
      : topics;

    chunks.push({
      id: `${source.name}:${slugify(relativePath)}:${slugify(
        currentHeadingPath.join(" ")
      ) || `chunk-${chunkIndex}`}`,
      title,
      section: currentHeadingPath[currentHeadingPath.length - 1] ?? title,
      headingPath: [...currentHeadingPath],
      tags,
      topics,
      sourceKind: source.sourceKind,
      sourceName: source.name,
      trustRank: source.trustRank,
      loader: source.loader,
      versionScope: source.versionScope,
      content: chunkContent,
      filePath,
      relativePath,
    });
    chunkIndex += 1;
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (!headingMatch) {
      buffer.push(line);
      continue;
    }

    flushChunk();
    buffer = [line];

    const level = headingMatch[1].length;
    const heading = headingMatch[2].trim();

    if (level === 1) {
      currentHeadingPath = [heading];
    } else if (level === 2) {
      currentHeadingPath = [currentHeadingPath[0] ?? title, heading];
    } else {
      currentHeadingPath = [
        currentHeadingPath[0] ?? title,
        currentHeadingPath[1] ?? currentHeadingPath[0] ?? title,
        heading,
      ];
    }
  }

  flushChunk();

  if (chunks.length === 0) {
    const topics = collectTopics(content, source.topicHints ?? []);
    chunks.push({
      id: `${source.name}:${slugify(relativePath)}:root`,
      title,
      section: title,
      headingPath: [title],
      tags: topics,
      topics,
      sourceKind: source.sourceKind,
      sourceName: source.name,
      trustRank: source.trustRank,
      loader: source.loader,
      versionScope: source.versionScope,
      content: content.trim(),
      filePath,
      relativePath,
    });
  }

  return chunks;
}

function loadSourcesConfig(configPath: string): DocsSourceConfig[] {
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as DocsSourceConfig[];
}

function syncGitSource(projectRoot: string, source: DocsSourceConfig): void {
  if (source.mode !== "git-repo" || !source.repoUrl) return;

  const targetDir = resolveProjectPath(projectRoot, source.localPath);
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  if (!fs.existsSync(path.join(targetDir, ".git"))) {
    const args = ["clone", "--depth", "1"];
    if (source.branch?.trim()) {
      args.push("--branch", source.branch.trim());
    }
    args.push(source.repoUrl, targetDir);

    const clone = spawnSync("git", args, {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });

    if (clone.status !== 0) {
      throw new Error(
        `Failed to clone ${source.name}: ${clone.stderr || clone.stdout}`
      );
    }

    if (source.name === "official-fabric-docs") {
      pruneOfficialFabricDocsRepo(targetDir);
    }
    return;
  }

  const fetch = spawnSync(
    "git",
    ["-C", targetDir, "fetch", "--depth", "1", "origin", source.branch || "HEAD"],
    {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    }
  );

  if (fetch.status !== 0) {
    throw new Error(
      `Failed to fetch ${source.name}: ${fetch.stderr || fetch.stdout}`
    );
  }

  const checkout = spawnSync(
    "git",
    ["-C", targetDir, "checkout", "--force", "FETCH_HEAD"],
    {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    }
  );

  if (checkout.status !== 0) {
    throw new Error(
      `Failed to checkout ${source.name}: ${checkout.stderr || checkout.stdout}`
    );
  }

  if (source.name === "official-fabric-docs") {
    pruneOfficialFabricDocsRepo(targetDir);
  }
}

export function buildGeneratedIndex(
  projectRoot: string,
  sources: DocsSourceConfig[]
): GeneratedDocsIndex {
  const entries: DocEntry[] = [];

  for (const source of sources) {
    if (source.enabled === false) continue;

    const sourceRoot = resolveContentRoot(projectRoot, source);
    const markdownFiles = collectMarkdownFiles(sourceRoot);

    for (const filePath of markdownFiles) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      entries.push(
        ...buildHeadingChunks(
          source,
          sourceRoot,
          filePath,
          parsed.content,
          parsed.data
        )
      );
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sources,
    entries,
  };
}

export function writeGeneratedIndex(indexPath: string, index: GeneratedDocsIndex): void {
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

export async function syncKnowledgeBase(options?: {
  projectRoot?: string;
  sourcesPath?: string;
  indexPath?: string;
  skipRemoteSync?: boolean;
}): Promise<GeneratedDocsIndex> {
  const projectRoot = options?.projectRoot ?? process.cwd();
  const sourcesPath = options?.sourcesPath ?? DEFAULT_SOURCES_PATH;
  const indexPath = options?.indexPath ?? DEFAULT_INDEX_PATH;
  const skipRemoteSync = options?.skipRemoteSync ?? false;

  const sources = loadSourcesConfig(sourcesPath);

  if (!skipRemoteSync) {
    for (const source of sources) {
      if (source.enabled === false) continue;
      if (source.mode === "git-repo") {
        syncGitSource(projectRoot, source);
      }
    }
  }

  const index = buildGeneratedIndex(projectRoot, sources);
  writeGeneratedIndex(indexPath, index);
  return index;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const skipRemoteSync = process.argv.includes("--skip-sync");

  syncKnowledgeBase({ skipRemoteSync })
    .then((index) => {
      console.info(
        `[docs-sync] generated ${index.entries.length} entries from ${index.sources.length} sources`
      );
    })
    .catch((error) => {
      console.error("[docs-sync] failed", error);
      process.exitCode = 1;
    });
}
