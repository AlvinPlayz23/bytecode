import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { ModelProvider } from "@bytecode/shared";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

export function createProvider(config: {
  provider: ModelProvider;
  openrouterApiKey: string;
  openrouterBaseUrl?: string;
  openrouterModel?: string;
  googleApiKey: string;
  googleModel?: string;
  openaiCompatibleApiKey: string;
  openaiCompatibleBaseUrl?: string;
  openaiCompatibleModel?: string;
}): LanguageModel {
  switch (config.provider) {
    case "openrouter": {
      const apiKey = requireEnv(config.openrouterApiKey, "OPENROUTER_API_KEY");
      const baseURL =
        config.openrouterBaseUrl?.trim() || "https://openrouter.ai/api/v1";
      const model =
        config.openrouterModel?.trim() ||
        "nvidia/nemotron-3-super-120b-a12b:free";

      return createOpenRouter({ apiKey, baseURL })(model);
    }

    case "google": {
      const apiKey = requireEnv(config.googleApiKey, "GOOGLE_API_KEY");
      const model = config.googleModel?.trim() || "gemini-2.5-flash";

      return createGoogleGenerativeAI({ apiKey })(model);
    }

    case "openai-compatible": {
      const apiKey = requireEnv(
        config.openaiCompatibleApiKey,
        "OPENAI_COMPATIBLE_API_KEY"
      );
      const baseURL =
        config.openaiCompatibleBaseUrl?.trim() ||
        "https://integrate.api.nvidia.com/v1";
      const model =
        config.openaiCompatibleModel?.trim() || "minimaxai/minimax-m2.5";

      return createOpenAI({ apiKey, baseURL }).chat(model);
    }
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
}

function requireEnv(value: string, name: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is not configured`);
  }
  return trimmed;
}
