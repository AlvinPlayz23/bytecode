export type DocSourceKind =
  | "official-fabric"
  | "bytecode-guide"
  | "curated-addon";

export type DocSourceMode = "git-repo" | "local-dir";

export interface DocsSourceConfig {
  name: string;
  description: string;
  mode: DocSourceMode;
  sourceKind: DocSourceKind;
  trustRank: number;
  loader: "fabric";
  localPath: string;
  contentSubpath?: string;
  repoUrl?: string;
  branch?: string;
  versionScope?: string;
  topicHints?: string[];
  enabled?: boolean;
}

export interface DocEntry {
  id: string;
  title: string;
  section: string;
  headingPath: string[];
  tags: string[];
  topics: string[];
  sourceKind: DocSourceKind;
  sourceName: string;
  trustRank: number;
  loader: "fabric";
  versionScope?: string;
  content: string;
  filePath: string;
  relativePath: string;
}

export interface GeneratedDocsIndex {
  generatedAt: string;
  sources: DocsSourceConfig[];
  entries: DocEntry[];
}

export interface DocSearchOptions {
  query?: string;
  limit?: number;
  loader?: "fabric";
  sourceKinds?: DocSourceKind[];
  topics?: string[];
  version?: string;
}

export interface DocSearchResult {
  entry: DocEntry;
  score: number;
}

export interface DocumentSummary {
  name: string;
  title: string;
  sourceName: string;
  sourceKind: DocSourceKind;
  versionScope?: string;
  sectionCount: number;
}
