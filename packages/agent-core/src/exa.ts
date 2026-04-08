const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const EXA_ENABLED_TOOLS = [
  "web_search_exa",
  "get_code_context_exa",
  "crawling_exa",
] as const;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface JsonRpcSuccess {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
}

interface ExaToolResult {
  structuredContent?: unknown;
  content?: Array<Record<string, unknown>>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface ExaCallResult {
  toolName: string;
  structuredContent: unknown | null;
  text: string | null;
  content: Array<Record<string, unknown>>;
  rawResult: unknown;
}

function buildExaMcpUrl(exaApiKey?: string): string {
  const url = new URL(EXA_MCP_URL);
  url.searchParams.set("tools", EXA_ENABLED_TOOLS.join(","));

  const trimmedKey = exaApiKey?.trim();
  if (trimmedKey) {
    url.searchParams.set("exaApiKey", trimmedKey);
  }

  return url.toString();
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractJsonRpcMessage(payload: string): unknown {
  const direct = tryParseJson(payload);
  if (direct) return direct;

  const events = payload
    .split(/\r?\n\r?\n/)
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n")
    )
    .filter(Boolean);

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const parsed = tryParseJson(events[i]);
    if (parsed) return parsed;
  }

  throw new Error("Exa MCP returned an unreadable response.");
}

function pickJsonRpcResult(message: unknown): unknown {
  if (Array.isArray(message)) {
    for (let i = message.length - 1; i >= 0; i -= 1) {
      const item = message[i] as JsonRpcSuccess | undefined;
      if (item && "result" in item) {
        return item.result;
      }
    }
    throw new Error("Exa MCP returned a batch response without a result.");
  }

  if (!message || typeof message !== "object") {
    throw new Error("Exa MCP returned a non-object JSON-RPC payload.");
  }

  if ("error" in message) {
    const error = (message as { error?: unknown }).error;
    throw new Error(
      `Exa MCP returned an error: ${JSON.stringify(error ?? "Unknown error")}`
    );
  }

  if (!("result" in message)) {
    throw new Error("Exa MCP response did not include a result.");
  }

  return (message as JsonRpcSuccess).result;
}

function normalizeToolContent(
  content: unknown
): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return [];
  return content.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item)
  );
}

function extractTextContent(content: Array<Record<string, unknown>>): string | null {
  const textParts = content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .filter(Boolean);

  return textParts.length > 0 ? textParts.join("\n\n") : null;
}

export async function callExaMcp(
  toolName: (typeof EXA_ENABLED_TOOLS)[number],
  args: Record<string, JsonValue>,
  exaApiKey?: string
): Promise<ExaCallResult> {
  const url = buildExaMcpUrl(exaApiKey);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Exa MCP error (${response.status}): ${text}`);
  }

  const payload = await response.text();
  const message = extractJsonRpcMessage(payload);
  const rawResult = pickJsonRpcResult(message);

  if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) {
    return {
      toolName,
      structuredContent: null,
      text: typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult),
      content: [],
      rawResult,
    };
  }

  const result = rawResult as ExaToolResult;
  if (result.isError) {
    throw new Error(
      `Exa MCP tool ${toolName} reported an error: ${JSON.stringify(result)}`
    );
  }

  const content = normalizeToolContent(result.content);
  const text = extractTextContent(content);

  return {
    toolName,
    structuredContent: result.structuredContent ?? null,
    text,
    content,
    rawResult,
  };
}
