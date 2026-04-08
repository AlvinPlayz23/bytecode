import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import matter from "gray-matter";

const TOPIC_KEYWORDS = [
  "block",
  "item",
  "entity",
  "block entity",
  "machine",
  "mixin",
  "fabric",
  "recipe",
  "command",
  "screen",
  "gui",
  "datagen",
  "networking",
  "payload",
  "event",
  "registry",
  "texture",
  "model",
  "loot",
  "tag",
  "armor",
  "tool",
  "food",
  "dimension",
  "biome",
  "worldgen",
  "loom",
  "client",
  "server",
];

const projectRoot = process.cwd();
const sourcesPath = path.resolve(projectRoot, "docs", "sources.json");
const indexPath = path.resolve(projectRoot, "docs", ".generated", "index.json");
const skipRemoteSync = process.argv.includes("--skip-sync");
const OFFICIAL_FABRIC_DOCS_KEEP_PATHS = new Set([
  ".git",
  "versions",
  "versions/1.21.11",
  "versions/1.21.11/develop",
]);

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function collectTopics(text, extraTopics = []) {
  const lower = text.toLowerCase();
  const topics = new Set(extraTopics.map((topic) => topic.toLowerCase()));

  for (const keyword of TOPIC_KEYWORDS) {
    if (lower.includes(keyword)) topics.add(keyword);
  }

  return [...topics];
}

function collectMarkdownFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const results = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function extractTitle(content, fallback) {
  const match = content.match(/^#\s+(.+)/m);
  return match?.[1]?.trim() || fallback;
}

function resolveContentRoot(source) {
  return path.resolve(
    projectRoot,
    source.contentSubpath
      ? path.join(source.localPath, source.contentSubpath)
      : source.localPath
  );
}

function normalizeRelativePath(relativePath) {
  return relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function shouldKeepOfficialFabricPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return true;

  for (const keepPath of OFFICIAL_FABRIC_DOCS_KEEP_PATHS) {
    if (normalized === keepPath || keepPath.startsWith(`${normalized}/`)) {
      return true;
    }
  }

  return false;
}

function pruneOfficialFabricDocsRepo(repoRoot) {
  if (!fs.existsSync(repoRoot)) return;

  const stack = [repoRoot];

  while (stack.length > 0) {
    const current = stack.pop();
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

function buildHeadingChunks(source, sourceRoot, filePath, content, matterData) {
  const relativePath = path.relative(sourceRoot, filePath).replace(/\\/g, "/");
  const fallbackTitle = path.basename(filePath).replace(/\.(md|mdx)$/i, "");
  const title =
    typeof matterData.title === "string" && matterData.title.trim().length > 0
      ? matterData.title.trim()
      : extractTitle(content, fallbackTitle);

  const lines = content.split(/\r?\n/);
  const chunks = [];
  let currentHeadingPath = [title];
  let buffer = [];
  let chunkIndex = 0;

  function flushChunk() {
    const chunkContent = buffer.join("\n").trim();
    if (!chunkContent) return;

    const frontmatterTopics = Array.isArray(matterData.topics)
      ? matterData.topics.filter((value) => typeof value === "string")
      : [];

    const topics = collectTopics(chunkContent, [
      ...(source.topicHints ?? []),
      ...frontmatterTopics,
    ]);

    const tags = Array.isArray(matterData.tags)
      ? matterData.tags.filter((value) => typeof value === "string")
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

function syncGitSource(source) {
  if (source.mode !== "git-repo" || !source.repoUrl) return;

  const targetDir = path.resolve(projectRoot, source.localPath);
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
      throw new Error(`Failed to clone ${source.name}: ${clone.stderr || clone.stdout}`);
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
    throw new Error(`Failed to fetch ${source.name}: ${fetch.stderr || fetch.stdout}`);
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
    throw new Error(`Failed to checkout ${source.name}: ${checkout.stderr || checkout.stdout}`);
  }

  if (source.name === "official-fabric-docs") {
    pruneOfficialFabricDocsRepo(targetDir);
  }
}

const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf-8"));

if (!skipRemoteSync) {
  for (const source of sources) {
    if (source.enabled === false) continue;
    if (source.mode === "git-repo") {
      syncGitSource(source);
    }
  }
}

const entries = [];
for (const source of sources) {
  if (source.enabled === false) continue;
  const sourceRoot = resolveContentRoot(source);
  const markdownFiles = collectMarkdownFiles(sourceRoot);

  for (const filePath of markdownFiles) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);
    entries.push(
      ...buildHeadingChunks(source, sourceRoot, filePath, parsed.content, parsed.data)
    );
  }
}

fs.mkdirSync(path.dirname(indexPath), { recursive: true });
fs.writeFileSync(
  indexPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sources,
      entries,
    },
    null,
    2
  ),
  "utf-8"
);

console.info(
  `[docs-sync] generated ${entries.length} entries from ${sources.length} sources`
);
