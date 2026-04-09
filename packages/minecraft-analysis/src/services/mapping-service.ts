import { existsSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import AdmZip from "adm-zip";
import { getCacheManager } from "../cache/cache-manager";
import { getFabricMaven } from "../downloaders/fabric-maven";
import { getMojangDownloader } from "../downloaders/mojang-downloader";
import { getMappingIO } from "../java/mapping-io";
import { parseTinyV2 } from "../parsers/tiny-v2";
import type { MappingType } from "../types/minecraft";
import { MappingNotFoundError } from "../utils/errors";
import { ensureDir } from "../utils/file-utils";
import { logger } from "../utils/logger";
import { getMojmapTinyPath } from "../utils/paths";
import { getVersionManager } from "./version-manager";

export class MappingService {
  private mojangDownloader = getMojangDownloader();
  private fabricMaven = getFabricMaven();
  private cache = getCacheManager();
  private versionManager = getVersionManager();
  private downloadLocks = new Map<string, Promise<string>>();

  async getMappings(version: string, mappingType: MappingType): Promise<string> {
    const lockKey = `${version}-${mappingType}`;
    const cachedPath = this.getCachedMapping(version, mappingType);
    if (cachedPath) {
      logger.info(`Using cached ${mappingType} mappings for ${version}: ${cachedPath}`);
      return cachedPath;
    }

    const existingDownload = this.downloadLocks.get(lockKey);
    if (existingDownload) {
      logger.info(`Waiting for existing ${mappingType} download of ${version} to complete`);
      return existingDownload;
    }

    await this.throwIfUnobfuscated(version, mappingType);

    const postCheckDownload = this.downloadLocks.get(lockKey);
    if (postCheckDownload) {
      return postCheckDownload;
    }

    logger.info(`Downloading ${mappingType} mappings for ${version}`);
    const downloadPromise = this.startDownload(version, mappingType);
    this.downloadLocks.set(lockKey, downloadPromise);
    try {
      return await downloadPromise;
    } finally {
      this.downloadLocks.delete(lockKey);
    }
  }

  private getCachedMapping(version: string, mappingType: MappingType): string | null {
    if (mappingType === "mojmap") {
      const convertedPath = getMojmapTinyPath(version);
      return existsSync(convertedPath) ? convertedPath : null;
    }
    return this.cache.getMappingPath(version, mappingType) ?? null;
  }

  private async startDownload(version: string, mappingType: MappingType): Promise<string> {
    switch (mappingType) {
      case "mojmap":
        return this.downloadAndConvertMojmap(version);
      case "yarn": {
        const path = await this.downloadAndExtractYarn(version);
        this.cache.cacheMapping(version, mappingType, path);
        return path;
      }
      case "intermediary": {
        const path = await this.downloadAndExtractIntermediary(version);
        this.cache.cacheMapping(version, mappingType, path);
        return path;
      }
      default:
        throw new MappingNotFoundError(
          version,
          mappingType,
          `Unsupported mapping type: ${mappingType}`
        );
    }
  }

  private async downloadAndExtractYarn(version: string): Promise<string> {
    const jarPath = await this.fabricMaven.downloadYarnMappings(version);
    const zip = new AdmZip(jarPath);
    const mappingEntry = zip.getEntry("mappings/mappings.tiny");

    if (!mappingEntry) {
      throw new MappingNotFoundError(version, "yarn", "mappings.tiny not found in Yarn JAR");
    }

    const extractedPath = jarPath.replace(".jar", ".tiny");
    const content = mappingEntry.getData();
    ensureDir(dirname(extractedPath));
    writeFileSync(extractedPath, content);

    logger.info(`Extracted Yarn mappings to ${extractedPath}`);
    return extractedPath;
  }

  private async downloadAndExtractIntermediary(version: string): Promise<string> {
    const jarPath = await this.fabricMaven.downloadIntermediaryMappings(version);
    const zip = new AdmZip(jarPath);
    const mappingEntry = zip.getEntry("mappings/mappings.tiny");

    if (!mappingEntry) {
      throw new MappingNotFoundError(
        version,
        "intermediary",
        "mappings.tiny not found in Intermediary JAR"
      );
    }

    const extractedPath = jarPath.replace(".jar", ".tiny");
    const content = mappingEntry.getData();
    ensureDir(dirname(extractedPath));
    writeFileSync(extractedPath, content);

    logger.info(`Extracted Intermediary mappings to ${extractedPath}`);
    return extractedPath;
  }

  private async downloadAndConvertMojmap(version: string): Promise<string> {
    logger.info(`Converting Mojmap for ${version} using mapping-io`);

    const proguardPath = await this.mojangDownloader.downloadMojangMappings(version);
    const intermediaryPath = await this.downloadAndExtractIntermediary(version);

    const outputPath = getMojmapTinyPath(version);
    ensureDir(dirname(outputPath));

    const mappingIO = getMappingIO();
    await mappingIO.convert(proguardPath, intermediaryPath, outputPath, {
      onProgress: (msg) => logger.debug(`MappingIO: ${msg}`),
    });

    const parsed = parseTinyV2(outputPath);
    if (
      !parsed.header.namespaces.includes("intermediary") ||
      !parsed.header.namespaces.includes("named")
    ) {
      throw new Error(
        `Invalid mapping-io output: expected namespaces 'intermediary' and 'named', got ${parsed.header.namespaces.join(", ")}`
      );
    }

    logger.info(`Mojmap converted and saved to ${outputPath}`);
    this.cache.cacheMapping(version, "mojmap", outputPath);
    return outputPath;
  }

  hasMappings(version: string, mappingType: MappingType): boolean {
    return this.cache.hasMappings(version, mappingType);
  }

  async verifyMappingsAvailable(version: string, mappingType: MappingType): Promise<void> {
    if (mappingType === "yarn") {
      const exists = await this.fabricMaven.yarnMappingsExist(version);
      if (!exists) {
        throw new MappingNotFoundError(version, mappingType);
      }
    }
  }

  private async throwIfUnobfuscated(version: string, mappingType: MappingType): Promise<void> {
    const isUnobfuscated = await this.versionManager.isVersionUnobfuscated(version);
    if (!isUnobfuscated) return;

    if (mappingType === "mojmap") {
      throw new MappingNotFoundError(
        version,
        mappingType,
        `Mojmap mapping files are not available for unobfuscated version ${version}. The JAR is already in Mojang's human-readable names.`
      );
    }

    throw new MappingNotFoundError(
      version,
      mappingType,
      `${mappingType} mappings are not available for unobfuscated version ${version}. Use 'mojmap' mapping instead.`
    );
  }

  private createLookupResult(
    found: boolean,
    source: string,
    target?: string,
    type?: "class" | "method" | "field",
    className?: string
  ): MappingLookupResult {
    return { found, source, target, type, className };
  }

  async lookupMapping(
    version: string,
    symbol: string,
    sourceMapping: MappingType,
    targetMapping: MappingType
  ): Promise<MappingLookupResult> {
    logger.info(`Looking up mapping: ${symbol} (${sourceMapping} -> ${targetMapping})`);

    if (sourceMapping === targetMapping) {
      return this.createLookupResult(true, symbol, symbol);
    }

    const singleFile = this.getSingleFileLookup(sourceMapping, targetMapping);
    if (singleFile) {
      return this.lookupInSingleFile(version, symbol, sourceMapping, targetMapping, singleFile);
    }

    return this.lookupViaBridge(version, symbol, sourceMapping, targetMapping);
  }

  private getSingleFileLookup(
    source: MappingType,
    target: MappingType
  ): "intermediary" | "yarn" | "mojmap" | null {
    if (
      (source === "official" && target === "intermediary") ||
      (source === "intermediary" && target === "official")
    ) {
      return "intermediary";
    }

    if (
      (source === "intermediary" && target === "yarn") ||
      (source === "yarn" && target === "intermediary")
    ) {
      return "yarn";
    }

    if (
      (source === "intermediary" && target === "mojmap") ||
      (source === "mojmap" && target === "intermediary")
    ) {
      return "mojmap";
    }

    return null;
  }

  private getNamespaceForType(
    mappingType: MappingType,
    _fileType: "intermediary" | "yarn" | "mojmap"
  ): string {
    if (mappingType === "official") {
      return "official";
    }

    if (mappingType === "intermediary") {
      return "intermediary";
    }

    if (mappingType === "yarn" || mappingType === "mojmap") {
      return "named";
    }

    return "intermediary";
  }

  private async lookupInSingleFile(
    version: string,
    symbol: string,
    sourceMapping: MappingType,
    targetMapping: MappingType,
    fileType: "intermediary" | "yarn" | "mojmap"
  ): Promise<MappingLookupResult> {
    const mappingPath = await this.getMappings(version, fileType);
    const mappingData = parseTinyV2(mappingPath);

    const sourceNamespace = this.getNamespaceForType(sourceMapping, fileType);
    const targetNamespace = this.getNamespaceForType(targetMapping, fileType);

    const sourceIndex = mappingData.header.namespaces.indexOf(sourceNamespace);
    const targetIndex = mappingData.header.namespaces.indexOf(targetNamespace);

    if (sourceIndex === -1 || targetIndex === -1) {
      logger.warn(
        `Namespace not found in ${fileType} file: source=${sourceNamespace}(${sourceIndex}), target=${targetNamespace}(${targetIndex}). Available: ${mappingData.header.namespaces.join(", ")}`
      );
      return this.createLookupResult(false, symbol);
    }

    return this.searchInMappingData(mappingData, symbol, sourceIndex, targetIndex);
  }

  private async lookupViaBridge(
    version: string,
    symbol: string,
    sourceMapping: MappingType,
    targetMapping: MappingType
  ): Promise<MappingLookupResult> {
    logger.info(`Two-step lookup: ${sourceMapping} -> intermediary -> ${targetMapping}`);

    const step1File = this.getFileForMapping(sourceMapping);
    const step1Path = await this.getMappings(version, step1File);
    const step1Data = parseTinyV2(step1Path);

    const sourceNamespace = this.getNamespaceForType(sourceMapping, step1File);
    const intermediaryNamespace = "intermediary";

    const sourceIndex = step1Data.header.namespaces.indexOf(sourceNamespace);
    const intermediaryIndex = step1Data.header.namespaces.indexOf(intermediaryNamespace);

    if (sourceIndex === -1 || intermediaryIndex === -1) {
      logger.warn(
        `Step 1 namespace not found: source=${sourceNamespace}(${sourceIndex}), intermediary(${intermediaryIndex})`
      );
      return this.createLookupResult(false, symbol);
    }

    const step1Result = this.searchInMappingData(step1Data, symbol, sourceIndex, intermediaryIndex);
    if (!step1Result.found || !step1Result.target) {
      return this.createLookupResult(false, symbol);
    }

    const intermediarySymbol = step1Result.target;
    const symbolType = step1Result.type;
    const step1ClassName = step1Result.className;

    const step2File = this.getFileForMapping(targetMapping);
    const step2Path = await this.getMappings(version, step2File);
    const step2Data = parseTinyV2(step2Path);

    const targetNamespace = this.getNamespaceForType(targetMapping, step2File);
    const step2IntermediaryIndex = step2Data.header.namespaces.indexOf(intermediaryNamespace);
    const targetIndex = step2Data.header.namespaces.indexOf(targetNamespace);

    if (step2IntermediaryIndex === -1 || targetIndex === -1) {
      logger.warn(
        `Step 2 namespace not found: intermediary(${step2IntermediaryIndex}), target=${targetNamespace}(${targetIndex})`
      );
      return this.createLookupResult(false, symbol);
    }

    if (symbolType === "method" || symbolType === "field") {
      let intermediaryClassName = step1ClassName;
      if (step1ClassName && sourceIndex !== intermediaryIndex) {
        for (const cls of step1Data.classes) {
          if (cls.names[sourceIndex] === step1ClassName) {
            intermediaryClassName = cls.names[intermediaryIndex];
            break;
          }
        }
      }

      const step2Result = this.searchMemberInClass(
        step2Data,
        intermediarySymbol,
        intermediaryClassName,
        symbolType,
        step2IntermediaryIndex,
        targetIndex
      );

      if (step2Result.found) {
        return this.createLookupResult(
          true,
          symbol,
          step2Result.target,
          symbolType,
          step2Result.className
        );
      }

      return this.createLookupResult(false, symbol);
    }

    const step2Result = this.searchInMappingData(
      step2Data,
      intermediarySymbol,
      step2IntermediaryIndex,
      targetIndex
    );

    if (step2Result.found) {
      return this.createLookupResult(true, symbol, step2Result.target, step2Result.type);
    }

    return this.createLookupResult(false, symbol);
  }

  private getFileForMapping(mappingType: MappingType): "intermediary" | "yarn" | "mojmap" {
    switch (mappingType) {
      case "official":
      case "intermediary":
        return "intermediary";
      case "yarn":
        return "yarn";
      case "mojmap":
        return "mojmap";
    }
  }

  private searchInMappingData(
    mappingData: ReturnType<typeof parseTinyV2>,
    symbol: string,
    sourceIndex: number,
    targetIndex: number
  ): MappingLookupResult {
    const normalizedSymbol = symbol.replace(/\./g, "/");

    for (const cls of mappingData.classes) {
      const sourceName = cls.names[sourceIndex];
      const targetName = cls.names[targetIndex];

      if (
        sourceName === symbol ||
        sourceName === normalizedSymbol ||
        sourceName.endsWith(`/${symbol}`) ||
        sourceName.replace(/\//g, ".") === symbol
      ) {
        return this.createLookupResult(true, sourceName, targetName, "class");
      }

      for (const method of cls.methods) {
        const sourceMethodName = method.names[sourceIndex];
        if (sourceMethodName === symbol) {
          const targetMethodName = method.names[targetIndex];
          return this.createLookupResult(
            true,
            sourceMethodName,
            targetMethodName,
            "method",
            sourceName
          );
        }
      }

      for (const field of cls.fields) {
        const sourceFieldName = field.names[sourceIndex];
        if (sourceFieldName === symbol) {
          const targetFieldName = field.names[targetIndex];
          return this.createLookupResult(
            true,
            sourceFieldName,
            targetFieldName,
            "field",
            sourceName
          );
        }
      }
    }

    return this.createLookupResult(false, symbol);
  }

  private searchMemberInClass(
    mappingData: ReturnType<typeof parseTinyV2>,
    memberName: string,
    className: string | undefined,
    memberType: "method" | "field",
    sourceIndex: number,
    targetIndex: number
  ): MappingLookupResult {
    for (const cls of mappingData.classes) {
      const classSourceName = cls.names[sourceIndex];
      const classTargetName = cls.names[targetIndex];

      if (className && classSourceName !== className) {
        continue;
      }

      if (memberType === "method") {
        for (const method of cls.methods) {
          const sourceMethodName = method.names[sourceIndex];
          if (sourceMethodName === memberName) {
            const targetMethodName = method.names[targetIndex];
            return this.createLookupResult(
              true,
              sourceMethodName,
              targetMethodName,
              "method",
              classTargetName
            );
          }
        }
      } else {
        for (const field of cls.fields) {
          const sourceFieldName = field.names[sourceIndex];
          if (sourceFieldName === memberName) {
            const targetFieldName = field.names[targetIndex];
            return this.createLookupResult(
              true,
              sourceFieldName,
              targetFieldName,
              "field",
              classTargetName
            );
          }
        }
      }
    }

    return this.createLookupResult(false, memberName);
  }
}

export interface MappingLookupResult {
  found: boolean;
  type?: "class" | "method" | "field";
  source: string;
  target?: string;
  className?: string;
}

let mappingServiceInstance: MappingService | undefined;

export function getMappingService(): MappingService {
  if (!mappingServiceInstance) {
    mappingServiceInstance = new MappingService();
  }
  return mappingServiceInstance;
}
