import { DocsEngine } from "@bytecode/docs-engine";
import path from "node:path";

let _engine: DocsEngine | null = null;

export async function getDocsEngine(): Promise<DocsEngine> {
  if (!_engine) {
    _engine = new DocsEngine();
    const docsIndexPath = path.resolve(
      process.cwd(),
      "..",
      "..",
      "docs",
      ".generated",
      "index.json"
    );
    _engine.loadIndex(docsIndexPath);
  }
  return _engine;
}
