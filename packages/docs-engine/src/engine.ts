import fs from "node:fs";
import type {
  DocEntry,
  DocSearchOptions,
  DocSearchResult,
  DocumentSummary,
  GeneratedDocsIndex,
} from "./types";

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
] as const;

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_.:+-]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function countOccurrences(text: string, term: string): number {
  if (!term) return 0;
  return text.split(term).length - 1;
}

function normalizeVersionScope(version?: string): string {
  return version?.trim().toLowerCase() ?? "";
}

export class DocsEngine {
  private entries: DocEntry[] = [];
  private byId = new Map<string, DocEntry>();
  private byDocumentName = new Map<string, DocEntry[]>();

  loadEntries(entries: DocEntry[]): void {
    this.entries = entries;
    this.byId = new Map(entries.map((entry) => [entry.id, entry]));
    this.byDocumentName = new Map();

    for (const entry of entries) {
      const documentName = entry.relativePath.replace(/\.(md|mdx)$/i, "");
      const current = this.byDocumentName.get(documentName) ?? [];
      current.push(entry);
      this.byDocumentName.set(documentName, current);
    }
  }

  loadIndex(indexPath: string): void {
    const raw = fs.readFileSync(indexPath, "utf-8");
    const index = JSON.parse(raw) as GeneratedDocsIndex;
    this.loadEntries(index.entries);
  }

  listDocs(queryOrOptions?: string | DocSearchOptions): DocSearchResult[] {
    if (!queryOrOptions) {
      return this.entries.map((entry) => ({ entry, score: entry.trustRank }));
    }

    if (typeof queryOrOptions === "string") {
      return this.search(queryOrOptions);
    }

    return this.search(queryOrOptions.query ?? "", queryOrOptions);
  }

  readDoc(id: string): DocEntry | undefined {
    return this.byId.get(id);
  }

  listDocuments(): DocumentSummary[] {
    return [...this.byDocumentName.entries()]
      .map(([name, entries]) => {
        const first = entries[0];
        return {
          name,
          title: first.title,
          sourceName: first.sourceName,
          sourceKind: first.sourceKind,
          versionScope: first.versionScope,
          sectionCount: entries.length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  readDocument(reference: string): {
    name: string;
    title: string;
    content: string;
    sourceName: string;
    sourceKind: DocEntry["sourceKind"];
    versionScope?: string;
  } | undefined {
    const normalized = reference
      .trim()
      .replace(/\\/g, "/")
      .replace(/\.(md|mdx)$/i, "")
      .toLowerCase();

    const direct =
      this.byDocumentName.get(normalized) ??
      this.byDocumentName.get(normalized.replace(/^\/+/, ""));

    if (direct && direct.length > 0) {
      const sorted = [...direct].sort((a, b) => a.section.localeCompare(b.section));
      const first = sorted[0];
      return {
        name: normalized.replace(/^\/+/, ""),
        title: first.title,
        sourceName: first.sourceName,
        sourceKind: first.sourceKind,
        versionScope: first.versionScope,
        content: sorted.map((entry) => entry.content).join("\n\n"),
      };
    }

    const matchedName = [...this.byDocumentName.keys()].find((key) => {
      const leaf = key.split("/").pop() ?? key;
      return leaf.toLowerCase() === normalized;
    });

    if (!matchedName) return undefined;
    return this.readDocument(matchedName);
  }

  search(
    query: string,
    options: Omit<DocSearchOptions, "query"> = {}
  ): DocSearchResult[] {
    const limit = options.limit ?? 10;
    const queryTerms = tokenize(query);
    const filterTopics = (options.topics ?? []).map((topic) => topic.toLowerCase());
    const filterVersion = normalizeVersionScope(options.version);

    return this.entries
      .filter((entry) => {
        if (options.loader && entry.loader !== options.loader) return false;
        if (
          options.sourceKinds &&
          options.sourceKinds.length > 0 &&
          !options.sourceKinds.includes(entry.sourceKind)
        ) {
          return false;
        }
        if (
          filterTopics.length > 0 &&
          !filterTopics.some((topic) => entry.topics.includes(topic))
        ) {
          return false;
        }
        return true;
      })
      .map((entry) => ({
        entry,
        score: this.scoreEntry(entry, queryTerms, filterTopics, filterVersion),
      }))
      .filter((result) => result.score > 0 || queryTerms.length === 0)
      .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
      .slice(0, limit);
  }

  private scoreEntry(
    entry: DocEntry,
    queryTerms: string[],
    filterTopics: string[],
    filterVersion: string
  ): number {
    let score = entry.trustRank;

    const title = entry.title.toLowerCase();
    const section = entry.section.toLowerCase();
    const tags = entry.tags.join(" ").toLowerCase();
    const topics = entry.topics.join(" ").toLowerCase();
    const text = `${title} ${section} ${tags} ${topics} ${entry.content.toLowerCase()}`;

    for (const term of queryTerms) {
      score += countOccurrences(title, term) * 14;
      score += countOccurrences(section, term) * 10;
      score += countOccurrences(tags, term) * 8;
      score += countOccurrences(topics, term) * 12;
      score += Math.min(countOccurrences(text, term), 12) * 2;
    }

    for (const topic of filterTopics) {
      if (entry.topics.includes(topic)) score += 25;
    }

    if (filterVersion && normalizeVersionScope(entry.versionScope).includes(filterVersion)) {
      score += 20;
    }

    if (entry.sourceKind === "official-fabric") score += 12;
    if (entry.sourceKind === "bytecode-guide") score += 4;

    return score;
  }

  get size(): number {
    return this.entries.length;
  }
}

export function collectTopics(text: string, extraTopics: string[] = []): string[] {
  const lower = text.toLowerCase();
  const topics = new Set<string>(extraTopics.map((topic) => topic.toLowerCase()));

  for (const keyword of TOPIC_KEYWORDS) {
    if (lower.includes(keyword)) {
      topics.add(keyword);
    }
  }

  return [...topics];
}

export function collectMarkdownFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];

  const results: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = `${current}/${entry.name}`.replace(/\\/g, "/");

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
