import { getJavaResourceDownloader } from "../downloaders/java-resources";
import { logger } from "../utils/logger";
import { executeJavaProcess } from "./java-process";

export interface MappingIOOptions {
  onProgress?: (progress: string) => void;
}

export class MappingIOWrapper {
  async convert(
    proguardFile: string,
    intermediaryFile: string,
    outputFile: string,
    options: MappingIOOptions = {}
  ): Promise<string> {
    const jarPath = getJavaResourceDownloader().getMappingIOCliJar();
    const { onProgress } = options;

    logger.info("Converting mappings with mapping-io");
    logger.info(`  ProGuard: ${proguardFile}`);
    logger.info(`  Intermediary: ${intermediaryFile}`);
    logger.info(`  Output: ${outputFile}`);

    try {
      await executeJavaProcess(jarPath, [proguardFile, intermediaryFile, outputFile], {
        maxMemory: "2G",
        minMemory: "512M",
        timeout: 5 * 60 * 1000,
        onStdout: (data) => {
          const trimmed = data.trim();
          if (trimmed) {
            logger.debug(`MappingIO: ${trimmed}`);
            onProgress?.(trimmed);
          }
        },
        onStderr: (data) => {
          const trimmed = data.trim();
          if (trimmed) {
            logger.debug(`MappingIO: ${trimmed}`);
            onProgress?.(trimmed);
          }
        },
      });

      logger.info(`Mapping conversion complete: ${outputFile}`);
      return outputFile;
    } catch (error) {
      logger.error("MappingIO conversion failed", error);
      throw new Error(
        `MappingIO conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

let mappingIOInstance: MappingIOWrapper | undefined;

export function getMappingIO(): MappingIOWrapper {
  if (!mappingIOInstance) {
    mappingIOInstance = new MappingIOWrapper();
  }
  return mappingIOInstance;
}
