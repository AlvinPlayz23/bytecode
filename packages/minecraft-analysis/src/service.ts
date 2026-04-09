import { FIXED_MINECRAFT_VERSION } from "./constants";
import { verifyJavaVersion } from "./java/java-process";
import { getDecompileService } from "./services/decompile-service";
import {
  getMappingService,
  type MappingLookupResult,
} from "./services/mapping-service";
import { getMixinService } from "./services/mixin-service";
import { getAccessWidenerService } from "./services/access-widener-service";
import type {
  AccessWidenerValidation,
  MappingType,
  MixinValidationResult,
} from "./types/minecraft";

export interface MinecraftSourceResult {
  version: string;
  mapping: "mojmap";
  className: string;
  content: string;
}

export interface ProjectMappingLookupResult extends MappingLookupResult {
  version: string;
  sourceMapping: MappingType;
  targetMapping: "mojmap";
}

export class MinecraftAnalysisService {
  private javaReady: Promise<void> | null = null;

  private ensureJava(): Promise<void> {
    if (!this.javaReady) {
      this.javaReady = verifyJavaVersion(21);
    }

    return this.javaReady;
  }

  async getMinecraftSource(className: string): Promise<MinecraftSourceResult> {
    await this.ensureJava();
    const content = await getDecompileService().getClassSource(
      FIXED_MINECRAFT_VERSION,
      className,
      "mojmap"
    );

    return {
      version: FIXED_MINECRAFT_VERSION,
      mapping: "mojmap",
      className,
      content,
    };
  }

  async findMapping(
    symbol: string,
    sourceMapping: MappingType = "official"
  ): Promise<ProjectMappingLookupResult> {
    const result = await getMappingService().lookupMapping(
      FIXED_MINECRAFT_VERSION,
      symbol,
      sourceMapping,
      "mojmap"
    );

    return {
      ...result,
      version: FIXED_MINECRAFT_VERSION,
      sourceMapping,
      targetMapping: "mojmap",
    };
  }

  async analyzeMixin(source: string): Promise<MixinValidationResult> {
    await this.ensureJava();
    const service = getMixinService();
    const mixin = service.parseMixinSource(source);

    if (!mixin) {
      return {
        mixin: {
          className: "unknown",
          targets: [],
          priority: 1000,
          injections: [],
          shadows: [],
          accessors: [],
        },
        isValid: false,
        errors: [
          {
            type: "target_not_found",
            message: "Could not parse a valid @Mixin class from the provided source.",
          },
        ],
        warnings: [],
        suggestions: [],
      };
    }

    return service.validateMixin(mixin, FIXED_MINECRAFT_VERSION, "mojmap");
  }

  async validateAccessWidener(content: string): Promise<AccessWidenerValidation> {
    await this.ensureJava();
    const service = getAccessWidenerService();
    const parsed = service.parseAccessWidener(content);
    return service.validateAccessWidener(parsed, FIXED_MINECRAFT_VERSION, "mojmap");
  }
}

let minecraftAnalysisServiceInstance: MinecraftAnalysisService | undefined;

export function getMinecraftAnalysisService(): MinecraftAnalysisService {
  if (!minecraftAnalysisServiceInstance) {
    minecraftAnalysisServiceInstance = new MinecraftAnalysisService();
  }

  return minecraftAnalysisServiceInstance;
}
