import { tool } from "ai";
import { z } from "zod";
import type { DocsEngine } from "@bytecode/docs-engine";
import type { SandboxManager } from "@bytecode/sandbox-runtime";
import { callExaMcp } from "./exa";

export interface ToolDeps {
  docsEngine: DocsEngine;
  sandbox: SandboxManager;
  exaApiKey?: string;
}

export function createAgentTools(deps: ToolDeps) {
  return {
    search_docs: tool({
      description:
        "Search the locally cloned official Fabric 1.21.11 docs by keyword query. Returns matching doc entries with titles, sections, and relevance scores.",
      inputSchema: z.object({
        query: z.string().describe("Search query for documentation"),
      }),
      execute: async ({ query }) => {
        const results = deps.docsEngine.listDocs({ query, loader: "fabric" });
        return results.slice(0, 10).map((r) => ({
          id: r.entry.id,
          title: r.entry.title,
          section: r.entry.section,
          sourceKind: r.entry.sourceKind,
          sourceName: r.entry.sourceName,
          topics: r.entry.topics,
          versionScope: r.entry.versionScope ?? null,
          tags: r.entry.tags,
          score: r.score,
        }));
      },
    }),

    list_docs: tool({
      description:
        "List the available official Fabric documentation names that can be opened with read_doc. Names do not need file extensions.",
      inputSchema: z.object({}),
      execute: async () => {
        return deps.docsEngine.listDocuments().map((doc) => ({
          name: doc.name,
          title: doc.title,
          sourceName: doc.sourceName,
          versionScope: doc.versionScope ?? null,
          sectionCount: doc.sectionCount,
        }));
      },
    }),

    read_doc: tool({
      description:
        "Read a specific official Fabric 1.21.11 document by name from list_docs, or by exact entry id from search_docs.",
      inputSchema: z.object({
        name: z
          .string()
          .describe("A document name from list_docs, or an exact entry id from search_docs"),
      }),
      execute: async ({ name }) => {
        const document = deps.docsEngine.readDocument(name);
        if (document) {
          return document;
        }

        const entry = deps.docsEngine.readDoc(name);
        if (!entry) return { error: `Doc not found: ${name}` };
        return {
          name: entry.relativePath.replace(/\.(md|mdx)$/i, ""),
          title: entry.title,
          sourceName: entry.sourceName,
          sourceKind: entry.sourceKind,
          versionScope: entry.versionScope,
          content: entry.content,
        };
      },
    }),

    search_web: tool({
      description:
        "Search the public web for technical explanations, release notes, documentation, and external references relevant to the user's request.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Web search query"),
      }),
      execute: async ({ query }) => {
        try {
          return await callExaMcp(
            "web_search_exa",
            { query },
            deps.exaApiKey
          );
        } catch (error) {
          return {
            query,
            error:
              error instanceof Error ? error.message : "Web search failed",
          };
        }
      },
    }),

    search_code_web: tool({
      description:
        "Search the web for code examples, implementation references, GitHub snippets, and documentation related to the task.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Code-focused web search query"),
      }),
      execute: async ({ query }) => {
        try {
          return await callExaMcp(
            "get_code_context_exa",
            { query },
            deps.exaApiKey
          );
        } catch (error) {
          return {
            query,
            error:
              error instanceof Error ? error.message : "Code web search failed",
          };
        }
      },
    }),

    crawl_web_page: tool({
      description:
        "Read the contents of a known webpage URL after discovering it through search.",
      inputSchema: z.object({
        url: z.string().url().describe("Webpage URL to crawl"),
      }),
      execute: async ({ url }) => {
        try {
          return await callExaMcp(
            "crawling_exa",
            { url },
            deps.exaApiKey
          );
        } catch (error) {
          return {
            url,
            error: error instanceof Error ? error.message : "Web crawl failed",
          };
        }
      },
    }),

    list_files: tool({
      description:
        "List files and directories at a path inside the sandbox. Defaults to /workspace.",
      inputSchema: z.object({
        path: z
          .string()
          .default("/workspace")
          .describe("Directory path to list"),
      }),
      execute: async ({ path }) => {
        try {
          const entries = await deps.sandbox.listFiles(path);
          return { path, entries };
        } catch {
          return { path, entries: [], error: `Cannot list: ${path}` };
        }
      },
    }),

    read_file: tool({
      description: "Read the contents of a file from the sandbox.",
      inputSchema: z.object({
        path: z.string().describe("File path to read"),
      }),
      execute: async ({ path }) => {
        try {
          const content = await deps.sandbox.readFile(path);
          return { path, content };
        } catch {
          return { path, content: null, error: `Cannot read: ${path}` };
        }
      },
    }),

    write_file: tool({
      description:
        "Write content to a file in the sandbox. Creates parent directories as needed.",
      inputSchema: z.object({
        path: z.string().describe("File path to write"),
        content: z.string().describe("Full file content to write"),
      }),
      execute: async ({ path, content }) => {
        await deps.sandbox.writeFile(path, content);
        return { path, success: true, bytesWritten: content.length };
      },
    }),
  };
}
