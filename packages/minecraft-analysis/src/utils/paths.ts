import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(CURRENT_DIR, "..", "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const DEFAULT_CACHE_DIR = join(REPO_ROOT, ".bytecode-cache", "minecraft-analysis");

export function getRepoRoot(): string {
  return REPO_ROOT;
}

export function getPackageRoot(): string {
  return PACKAGE_ROOT;
}

export function getCacheDir(): string {
  return process.env.BYTECODE_MINECRAFT_CACHE_DIR?.trim() || DEFAULT_CACHE_DIR;
}

export function ensureCacheRoot(): string {
  const cacheDir = getCacheDir();
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

export const paths = {
  cache: () => ensureCacheRoot(),
  jars: () => join(ensureCacheRoot(), "jars"),
  mappings: () => join(ensureCacheRoot(), "mappings"),
  remapped: () => join(ensureCacheRoot(), "remapped"),
  decompiled: () => join(ensureCacheRoot(), "decompiled"),
  resources: () => join(ensureCacheRoot(), "resources"),
  logs: () => join(ensureCacheRoot(), "logs"),
};

export function getVersionJarPath(version: string): string {
  return join(paths.jars(), `minecraft_client.${version}.jar`);
}

export function getServerJarPath(version: string): string {
  return join(paths.jars(), `minecraft_server.${version}.jar`);
}

export function getDownloadedMappingJarPath(
  version: string,
  mappingType: "yarn" | "intermediary"
): string {
  return join(paths.mappings(), `${mappingType}-${version}.jar`);
}

export function getMappingPath(
  version: string,
  mappingType: "yarn" | "intermediary"
): string {
  return join(paths.mappings(), `${mappingType}-${version}.tiny`);
}

export function getRemappedJarPath(version: string, mapping: string): string {
  return join(paths.remapped(), `${version}-${mapping}.jar`);
}

export function getMojmapRawPath(version: string): string {
  return join(paths.mappings(), `mojmap-raw-${version}.txt`);
}

export function getMojmapTinyPath(version: string): string {
  return join(paths.mappings(), `mojmap-tiny-${version}.tiny`);
}

export function getDecompiledPath(version: string, mapping: string): string {
  return join(paths.decompiled(), version, mapping);
}

export function getResourceLogPath(): string {
  return join(paths.logs(), "minecraft-analysis.log");
}

export function classNameToPath(className: string): string {
  return `${className.replace(/\./g, "/")}.java`;
}
