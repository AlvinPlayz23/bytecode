# Agent System Upgrade Plan

## Problem

The current agent is a single-shot `generateText` call with no tool loop.
It dumps all context into one prompt, hopes the model returns valid JSON, writes files blindly, and cannot self-correct.
There is no iteration, no verification, and no reasoning space.

## Goal

Replace the current agent with a proper agentic tool loop using AI SDK v6's `ToolLoopAgent`.
The agent should be able to read, write, search, verify, and iterate autonomously.

---

## Phase 1 — Dependency Upgrades

Upgrade across all packages that depend on the AI SDK.

| Package | Current | Target |
|---------|---------|--------|
| `ai` | `^4.0.0` | `^6.0.0` |
| `@ai-sdk/openai` | `^1.0.0` | latest v6-compatible |
| `@ai-sdk/google` | `^1.2.22` | latest v6-compatible |
| `@openrouter/ai-sdk-provider` | `^0.7.5` | `^2.5.0` |

### Affected packages

- `packages/agent-core/package.json`
- `apps/web/package.json` (also depends on `ai` and `@ai-sdk/openai`)

### Steps

1. Upgrade `ai` in both `@bytecode/agent-core` and `web`.
2. Upgrade `@ai-sdk/openai` in both.
3. Upgrade `@ai-sdk/google` in `@bytecode/agent-core`.
4. Upgrade `@openrouter/ai-sdk-provider` in `@bytecode/agent-core`.
5. Run `pnpm install` and resolve any peer dependency conflicts.
6. Fix any import/type breaking changes from v4 → v6.

---

## Phase 2 — Provider Updates

Check whether `createOpenAI`, `createGoogleGenerativeAI`, and `createOpenRouter` signatures changed between v4 and v6.

### Files to update

- `packages/agent-core/src/provider.ts`

### Expected changes

- Import paths or factory function signatures may have changed.
- `LanguageModelV1` type may now be `LanguageModelV2` or similar.
- Verify each provider still returns a model compatible with `ToolLoopAgent`.

---

## Phase 3 — Agent Rewrite

Replace the current single-shot agent with a `ToolLoopAgent`-based implementation.

### File: `packages/agent-core/src/agent.ts`

#### Current flow (delete)

1. Manually call `listDocs` and `collectFiles` upfront.
2. Build a giant system prompt with all context.
3. Single `generateText` call.
4. Parse JSON from raw text.
5. Blindly write files.

#### New flow

Instantiate a `ToolLoopAgent` with tools. Let the model decide what to read, write, and verify.

#### Tools to implement

| Tool | Description | Zod Schema |
|------|-------------|------------|
| `search_docs` | Search documentation by query | `{ query: string }` |
| `read_doc` | Read a specific doc entry by ID | `{ id: string }` |
| `list_files` | List files/dirs at a sandbox path | `{ path: string }` |
| `read_file` | Read a file from the sandbox | `{ path: string }` |
| `write_file` | Write a file to the sandbox | `{ path: string, content: string }` |

#### Agent configuration

```
ToolLoopAgent({
  model: <provider model>,
  instructions: <system prompt>,
  tools: { search_docs, read_doc, list_files, read_file, write_file },
  stopWhen: stepCountIs(30),
  onStepFinish: <log each step to console>,
})
```

#### System prompt updates (`prompt.ts`)

- Remove the JSON output format instructions (no longer needed).
- Keep mod context (modId, modName, packageName, minecraftVersion).
- Add tool usage guidance:
  - "Use list_files and read_file to understand the project before writing."
  - "Use search_docs and read_doc to find Fabric API patterns."
  - "Use write_file to create or update files."
  - "After writing, use read_file to verify your changes."
  - "Target Java 21. Do not use Java features above 21."
- Add Fabric-specific rules (yarn mappings, no Forge, etc.).

---

## Phase 4 — Result Extraction

The current `AgentRunResult` type needs updating.

### Current

```ts
interface AgentRunResult {
  response: AgentResponse;  // { message, files[] }
  toolsUsed: string[];
}
```

### New

Extract results from the `ToolLoopAgent` output:

- `result.text` — the agent's final message to the user.
- `result.steps` — all steps taken, including tool calls.
- Derive `toolsUsed` from `steps[].toolCalls`.
- Derive `fileChanges` from `write_file` tool calls across all steps.

The `agentResponseSchema` in `packages/shared` may no longer need `files[]` in the response body since file writes happen via tool calls during the loop, not in the final text output.

---

## Phase 5 — Route Integration

Update the message route to work with the new agent output shape.

### File: `apps/web/src/app/api/projects/[id]/message/route.ts`

- The route currently calls `agent.run()` and reads `result.response.message` and `result.response.files`.
- Update to read from the new `AgentRunResult` shape.
- File changes are now derived from tool call history, not from parsed JSON.

---

## Phase 6 — Logging & Transparency

Use `onStepFinish` on the `ToolLoopAgent` to log each step:

- Step number
- Tool called (if any)
- Tool input summary
- Tool result summary
- Token usage
- Finish reason

This replaces the manual `console.info("[agent] ...")` calls scattered through the current code.

---

## Phase 7 — Verification

1. `pnpm --filter web build` — type-check and compile.
2. Manual test: create project → send message → verify agent uses tools.
3. Manual test: compile → check for Java 21 compatibility.
4. Verify dev server logs show step-by-step agent activity.

---

## Risk & Rollback

- **Risk**: v6 may have breaking changes beyond what's documented.
- **Risk**: Provider packages may not all be v6-ready on the same day.
- **Mitigation**: Phase 1 (deps) is done first and verified before Phase 3 (rewrite).
- **Rollback**: Git revert if the upgrade fails at any phase.

---

## Files Changed (expected)

| File | Change |
|------|--------|
| `packages/agent-core/package.json` | Dependency versions |
| `apps/web/package.json` | Dependency versions |
| `packages/agent-core/src/agent.ts` | Full rewrite |
| `packages/agent-core/src/provider.ts` | Signature updates if needed |
| `packages/agent-core/src/prompt.ts` | Remove JSON format, add tool guidance |
| `packages/agent-core/src/tools.ts` | Convert to AI SDK `tool()` definitions |
| `packages/agent-core/src/index.ts` | Update exports |
| `packages/shared/src/schemas.ts` | Possibly simplify `agentResponseSchema` |
| `packages/shared/src/types.ts` | Update `AgentResponse` type |
| `apps/web/src/app/api/projects/[id]/message/route.ts` | Adapt to new result shape |
