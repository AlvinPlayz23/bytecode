function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getEnv() {
  return {
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    openrouterBaseUrl:
      process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    openrouterModel:
      process.env.OPENROUTER_MODEL ??
      "nvidia/nemotron-3-super-120b-a12b:free",
    googleApiKey:
      process.env.GOOGLE_API_KEY ??
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
      "",
    googleModel: process.env.GOOGLE_MODEL ?? "gemini-2.5-flash",
    openaiCompatibleApiKey: process.env.OPENAI_COMPATIBLE_API_KEY ?? "",
    openaiCompatibleBaseUrl:
      process.env.OPENAI_COMPATIBLE_BASE_URL ??
      "https://integrate.api.nvidia.com/v1",
    openaiCompatibleModel:
      process.env.OPENAI_COMPATIBLE_MODEL ?? "minimaxai/minimax-m2.5",
    e2bApiKey: process.env.E2B_API_KEY ?? "",
    e2bTemplateId: process.env.BYTECODE_E2B_TEMPLATE_ID ?? "",
    exaApiKey: process.env.EXA_API_KEY ?? "",
    agentMaxSteps: parsePositiveInt(process.env.BYTECODE_AGENT_MAX_STEPS, 500),
  };
}
