import { existsSync, readdirSync } from "node:fs";
import type { MappingType } from "../types/minecraft";
import {
  getDecompiledPath,
  getDownloadedMappingJarPath,
  getMappingPath,
  getRemappedJarPath,
  getServerJarPath,
  getVersionJarPath,
  paths,
} from "../utils/paths";

export class CacheManager {
  hasVersionJar(version: string): boolean {
    return existsSync(getVersionJarPath(version));
  }

  getVersionJarPath(version: string): string | undefined {
    const filePath = getVersionJarPath(version);
    return existsSync(filePath) ? filePath : undefined;
  }

  cacheVersionJar(_version: string, _jarPath: string, _sha1: string): void {}

  hasServerJar(version: string): boolean {
    return existsSync(getServerJarPath(version));
  }

  getServerJarPath(version: string): string | undefined {
    const filePath = getServerJarPath(version);
    return existsSync(filePath) ? filePath : undefined;
  }

  hasMappings(version: string, mappingType: MappingType): boolean {
    if (mappingType !== "yarn" && mappingType !== "intermediary") {
      return false;
    }

    return existsSync(getMappingPath(version, mappingType));
  }

  getMappingPath(version: string, mappingType: MappingType): string | undefined {
    if (mappingType !== "yarn" && mappingType !== "intermediary") {
      return undefined;
    }

    const filePath = getMappingPath(version, mappingType);
    return existsSync(filePath) ? filePath : undefined;
  }

  getDownloadedMappingJarPath(
    version: string,
    mappingType: "yarn" | "intermediary"
  ): string | undefined {
    const filePath = getDownloadedMappingJarPath(version, mappingType);
    return existsSync(filePath) ? filePath : undefined;
  }

  cacheMapping(_version: string, _mappingType: MappingType, _filePath: string): void {}

  hasDecompiledSource(version: string, mapping: MappingType): boolean {
    return existsSync(getDecompiledPath(version, mapping));
  }

  hasRemappedJar(version: string, mapping: MappingType): boolean {
    return existsSync(getRemappedJarPath(version, mapping));
  }

  listCachedVersions(): string[] {
    if (!existsSync(paths.jars())) {
      return [];
    }

    return readdirSync(paths.jars())
      .map((entry) => entry.match(/^minecraft_client\.(.+)\.jar$/)?.[1] ?? null)
      .filter((entry): entry is string => entry !== null)
      .sort((a, b) => a.localeCompare(b));
  }

  getOrCreateJob(_version: string, _mapping: MappingType): number {
    return 1;
  }

  updateJobProgress(_jobId: number, _progress: number): void {}

  completeJob(_jobId: number): void {}

  failJob(_jobId: number, _error: string): void {}
}

let cacheManagerInstance: CacheManager | undefined;

export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager();
  }

  return cacheManagerInstance;
}
