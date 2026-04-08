import { ZepMemoryAdapter } from "../memory/zepAdapter";
import { CAMAMemoryAdapter } from "../memory/camaAdapter";
import { buildSystemPrompt } from "../prompts/systemPrompt";
import { runEmoGuard, CRISIS_RESPONSES } from "../safety/emoguard";
import { runRouterLLM } from "../router/routerLlm";
import type { WellnessStateType } from "./state";

const zep = new ZepMemoryAdapter();
const cama = new CAMAMemoryAdapter();

// Helper: fallback memory - Zep preferred, fallback to CAMA
async function withMemoryFallback<T>(fn: (provider: typeof zep) => Promise<T>): Promise<T> {
  const zepHealth = await zep.health();
  if (zepHealth.healthy) {
    try {
      return await fn(zep);
    } catch {}
  }
  return fn(cama);
}

// Node: fetch memory context (long-term facts/summaries + short-term CAMA)
export async function memoryFetchNode(state: WellnessStateType) {
  const userId = state.userId;

  // Fetch context w/ fallback
  const memoryContext = await withMemoryFallback(async (provider) => provider.fetchContext({ userId }));
  return {
    ...state,
    ...(memoryContext || {}),
  };
}

// Node: update memory with latest turn
export async function memoryUpdateNode(state: WellnessStateType) {
  const userId = state.userId;
  const turn = { role: "user", content: state.currentMessage, timestamp: Date.now() };

  // Persist to both (CAMA as backup)
  await cama.addTurn({ userId, message: turn });
  await withMemoryFallback(async (provider) => provider.addTurn({ userId, message: turn }));

  return state;
}

// Node: intake, emoguard, router, crisis, generation, output would use similar logic
// ...these can be filled in as needed for restoration
