import { existsSync } from "node:fs";
import { getCacheManager } from "../cache/cache-manager";
import { getTinyRemapper } from "../java/tiny-remapper";
import type { MappingType } from "../types/minecraft";
import { logger } from "../utils/logger";
import { getRemappedJarPath } from "../utils/paths";
import { getMappingService } from "./mapping-service";
import { getVersionManager } from "./version-manager";

export class RemapService {
  private tinyRemapper = getTinyRemapper();
  private cache = getCacheManager();
  private mappingService = getMappingService();
  private versionManager = getVersionManager();
  private remapLocks = new Map<string, Promise<string>>();

  async getRemappedJar(
    version: string,
    mapping: MappingType,
    onProgress?: (progress: string) => void
  ): Promise<string> {
    const lockKey = `${version}-${mapping}`;
    const outputPath = getRemappedJarPath(version, mapping);
    if (existsSync(outputPath)) {
      logger.info(`Using cached remapped JAR: ${outputPath}`);
      return outputPath;
    }

    const existingRemap = this.remapLocks.get(lockKey);
    if (existingRemap) {
      logger.info(`Waiting for existing remapping of ${version} (${mapping}) to complete`);
      return existingRemap;
    }

    const remapPromise = this.doGetRemappedJar(version, mapping, outputPath, onProgress);
    this.remapLocks.set(lockKey, remapPromise);

    try {
      return await remapPromise;
    } finally {
      this.remapLocks.delete(lockKey);
    }
  }

  private async doGetRemappedJar(
    version: string,
    mapping: MappingType,
    outputPath: string,
    onProgress?: (progress: string) => void
  ): Promise<string> {
    const getInputJar = async (): Promise<string> => {
      return this.versionManager.getVersionJar(version, (downloaded, total) => {
        if (onProgress) {
          const percent = ((downloaded / total) * 100).toFixed(1);
          onProgress(`Downloading Minecraft ${version}: ${percent}%`);
        }
      });
    };

    const isUnobfuscated = await this.versionManager.isVersionUnobfuscated(version);
    if (isUnobfuscated) {
      if (mapping !== "mojmap") {
        throw new Error(
          `${mapping} mappings are not supported for unobfuscated Minecraft versions. Version ${version} ships without obfuscation - use 'mojmap' mapping instead.`
        );
      }
      const inputJar = await getInputJar();
      logger.info(`Version ${version} is unobfuscated - skipping remapping (mojmap)`);
      return inputJar;
    }

    const inputJar = await getInputJar();

    if (mapping === "yarn") {
      return this.remapYarn(version, inputJar, outputPath, onProgress);
    }

    if (mapping === "mojmap") {
      return this.remapMojmap(version, inputJar, outputPath, onProgress);
    }

    if (mapping !== "intermediary") {
      throw new Error(`Unsupported mapping type: ${mapping}`);
    }

    const mappingsFile = await this.mappingService.getMappings(version, mapping);
    await this.tinyRemapper.remap(inputJar, outputPath, mappingsFile, {
      fromNamespace: "official",
      toNamespace: "intermediary",
      threads: 4,
      rebuildSourceFilenames: true,
      onProgress,
    });

    logger.info(`Remapped JAR created: ${outputPath}`);
    return outputPath;
  }

  private async remapYarn(
    version: string,
    inputJar: string,
    outputPath: string,
    onProgress?: (progress: string) => void
  ): Promise<string> {
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { mkdtempSync } = await import("node:fs");

    const tempDir = mkdtempSync(join(tmpdir(), "mc-remap-"));
    const intermediaryJar = join(tempDir, `${version}-intermediary.jar`);

    try {
      logger.info(`Step 1/2: Remapping ${version} from official to intermediary`);
      const intermediaryMappings = await this.mappingService.getMappings(version, "intermediary");

      await this.tinyRemapper.remap(inputJar, intermediaryJar, intermediaryMappings, {
        fromNamespace: "official",
        toNamespace: "intermediary",
        threads: 4,
        rebuildSourceFilenames: false,
        onProgress: (msg) => onProgress?.(`[1/2] ${msg}`),
      });

      logger.info(`Step 2/2: Remapping ${version} from intermediary to named`);
      const yarnMappings = await this.mappingService.getMappings(version, "yarn");

      await this.tinyRemapper.remap(intermediaryJar, outputPath, yarnMappings, {
        fromNamespace: "intermediary",
        toNamespace: "named",
        threads: 4,
        rebuildSourceFilenames: true,
        onProgress: (msg) => onProgress?.(`[2/2] ${msg}`),
      });

      logger.info(`Yarn remapping complete: ${outputPath}`);
      return outputPath;
    } finally {
      try {
        const { unlinkSync, rmdirSync } = await import("node:fs");
        if (existsSync(intermediaryJar)) {
          unlinkSync(intermediaryJar);
        }
        rmdirSync(tempDir);
      } catch {
        logger.warn(`Failed to clean up temp directory: ${tempDir}`);
      }
    }
  }

  private async remapMojmap(
    version: string,
    inputJar: string,
    outputPath: string,
    onProgress?: (progress: string) => void
  ): Promise<string> {
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { mkdtempSync } = await import("node:fs");

    const tempDir = mkdtempSync(join(tmpdir(), "mc-remap-mojmap-"));
    const intermediaryJar = join(tempDir, `${version}-intermediary.jar`);

    try {
      logger.info(`Step 1/2: Remapping ${version} from official to intermediary (Mojmap)`);
      const intermediaryMappings = await this.mappingService.getMappings(version, "intermediary");

      await this.tinyRemapper.remap(inputJar, intermediaryJar, intermediaryMappings, {
        fromNamespace: "official",
        toNamespace: "intermediary",
        threads: 4,
        rebuildSourceFilenames: false,
        onProgress: (msg) => onProgress?.(`[1/2] ${msg}`),
      });

      logger.info(`Step 2/2: Remapping ${version} from intermediary to named (Mojmap)`);
      const mojmapMappings = await this.mappingService.getMappings(version, "mojmap");

      await this.tinyRemapper.remap(intermediaryJar, outputPath, mojmapMappings, {
        fromNamespace: "intermediary",
        toNamespace: "named",
        threads: 4,
        rebuildSourceFilenames: true,
        ignoreConflicts: true,
        onProgress: (msg) => onProgress?.(`[2/2] ${msg}`),
      });

      logger.info(`Mojmap remapping complete: ${outputPath}`);
      return outputPath;
    } finally {
      try {
        const { unlinkSync, rmdirSync } = await import("node:fs");
        if (existsSync(intermediaryJar)) {
          unlinkSync(intermediaryJar);
        }
        rmdirSync(tempDir);
      } catch {
        logger.warn(`Failed to clean up temp directory: ${tempDir}`);
      }
    }
  }

  hasRemappedJar(version: string, mapping: MappingType): boolean {
    return this.cache.hasRemappedJar(version, mapping);
  }
}

let remapServiceInstance: RemapService | undefined;

export function getRemapService(): RemapService {
  if (!remapServiceInstance) {
    remapServiceInstance = new RemapService();
  }
  return remapServiceInstance;
}
