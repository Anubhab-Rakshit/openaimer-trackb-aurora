import { ZepMemoryAdapter } from "../memory/zepAdapter";
import { CAMAMemoryAdapter } from "../memory/camaAdapter";
import { MemoryProvider } from "../memory/memoryInterface";
import { buildSystemPrompt } from "../prompts/systemPrompt";
import { runEmoGuard, CRISIS_RESPONSES } from "../safety/emoguard";
import { runRouterLLM } from "../router/routerLlm";
import type { WellnessStateType } from "./state";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import Groq from "groq-sdk";
import { config } from "../config";

const zep = new ZepMemoryAdapter();
const cama = new CAMAMemoryAdapter();
const groq = new Groq({ apiKey: config.groqApiKey });

// Helper: fallback memory - Zep preferred, fallback to CAMA
async function withMemoryFallback<T>(fn: (provider: MemoryProvider) => Promise<T>): Promise<T | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)); // 5s timeout for local
  
  const operation = (async () => {
    // Try Local CAMA first now
    try {
      return await fn(cama);
    } catch {
      // Fallback to Zep if local fails (shouldn't happen)
      try {
        const zepHealth = await zep.health();
        if (zepHealth.healthy) {
          return await fn(zep);
        }
      } catch {}
    }
    return null;
  })();

  return Promise.race([operation, timeout]);
}

// Node: intake
export async function intakeNode(state: WellnessStateType) {
  return {
    messages: [new HumanMessage(state.currentMessage)]
  };
}

// Node: router
export async function routerNode(state: WellnessStateType) {
  // convert history to simple string array
  const historyString = state.messages.map(m => ({
    role: m._getType() === 'human' ? 'user' : 'model',
    content: m.content as string
  }));
  const routerOutput = await runRouterLLM(state.currentMessage, historyString);
  return { routerOutput };
}

// Edge: routeAfterRouter
export function routeAfterRouter(state: WellnessStateType) {
  // Determine if we need crisis intervention
  if (state.routerOutput && state.routerOutput.crisis_level >= 3) {
    return "crisis";
  }
  return "memory_fetch";
}

// Node: crisis
export async function crisisNode(state: WellnessStateType) {
  const level = state.routerOutput?.crisis_level ?? 5;
  const crisisFunc = CRISIS_RESPONSES[level] || CRISIS_RESPONSES[5];
  const finalResponse = crisisFunc(state.currentMessage);
  return {
    isCrisis: true,
    finalResponse
  };
}

// Node: fetch memory context (long-term facts/summaries + short-term CAMA)
export async function memoryFetchNode(state: WellnessStateType) {
  const userId = state.userId;

  // Fetch context w/ fallback
  const memoryContext = await withMemoryFallback(async (provider) => provider.fetchContext({ userId }));
  return {
    ...(memoryContext || {}),
  };
}

// Node: generation
export async function generationNode(state: WellnessStateType) {
  const promptCtx = {
    userName: state.userName,
    routerOutput: state.routerOutput!,
    camaNodes: state.camaNodes,
    camaConsole: state.camaConsole,
    zepFacts: state.zepFacts,
    zepSummary: state.zepSummary,
    emoguardInjection: state.refineCount > 0 && state.emoguardReport && state.emoguardReport.should_refine 
      ? state.emoguardReport.intervention_advice 
      : undefined
  };
  const systemInstruction = buildSystemPrompt(promptCtx);
  
  try {
    const result = await groq.chat.completions.create({
      model: config.groqModel || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: state.currentMessage }
      ],
      temperature: 0.6,
      max_tokens: 1024
    });

    const responseDraft = result.choices[0]?.message?.content || "I'm having trouble formulating a response right now.";
    return { responseDraft, refineCount: state.refineCount + 1 };
  } catch (err) {
    console.error("[GenerationNode] Groq failed:", err);
    return { responseDraft: "I'm listening, but my processing seems overwhelmed right now.", refineCount: state.refineCount + 1 };
  }
}

// Node: emoguard
export async function emoguardNode(state: WellnessStateType) {
  if (state.emoguardSensitivity === "LOW") {
    return { emoguardReport: { risk_score: 0, flags: ["none"], intervention_advice: "", should_refine: false, refined_draft: state.responseDraft } };
  }
  const historyString = state.messages.map(m => ({
    role: m._getType() === 'human' ? 'user' : 'model',
    content: m.content as string
  }));
  const report = await runEmoGuard(state.currentMessage, state.responseDraft, historyString);
  return { emoguardReport: report };
}

// Edge: routeAfterEmoguard
export function routeAfterEmoguard(state: WellnessStateType) {
  if (state.emoguardReport && state.emoguardReport.should_refine && state.refineCount < 3) {
    return "refine";
  }
  return "output";
}

// Node: output
export async function outputNode(state: WellnessStateType) {
  const finalResponse = state.emoguardReport?.refined_draft || state.responseDraft;
  return {
    finalResponse,
    messages: [new AIMessage(finalResponse)]
  };
}

// Node: update memory with latest turn
export async function memoryUpdateNode(state: WellnessStateType) {
  const userId = state.userId;
  const finalRes = state.finalResponse;
  
  if (finalRes) {
    const turn1 = { role: "user", content: state.currentMessage, timestamp: Date.now() };
    const turn2 = { role: "assistant", content: finalRes, timestamp: Date.now() };

    // Persist to both (CAMA as backup)
    try {
      await cama.addTurn({ userId, message: turn1 });
      await cama.addTurn({ userId, message: turn2 });
    } catch {}
    
    await withMemoryFallback(async (provider) => {
      await provider.addTurn({ userId, message: turn1 });
      await provider.addTurn({ userId, message: turn2 });
    });
  }

  return {};
}
