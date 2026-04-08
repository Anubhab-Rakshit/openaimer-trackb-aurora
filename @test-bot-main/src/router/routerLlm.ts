import Groq from "groq-sdk";
import { config } from "../config";
import type { RouterOutput } from "../types";

const groq = new Groq({ apiKey: config.groqApiKey });

// Fallback Groq-based router (no structured JSON schema, we parse manually)
// Using Groq because it's fast (<1s), reliable, and free tier works well
const ROUTER_SYSTEM_PROMPT = `You are an expert clinical psychologist performing real-time signal detection on a user message.

Analyze the message for:
1. Crisis signals (suicidality, self-harm, psychosis, abuse, severe dissociation)
2. Primary and secondary emotions — be specific, not just "sad" or "angry"
3. What the user actually needs (validation, advice, venting, problem-solving, connection) vs what they asked for
4. Sarcasm or masking (saying "fine" when they're not)
5. Volatility — how quickly the emotional state could shift

Be thorough. The implicit_need is the most important field — detect what is UNSTATED.
Respond ONLY with a valid JSON object with these exact fields:
{
  "crisis_level": 0,
  "crisis_flags": [],
  "emotion": { "primary": "string", "secondary": "string", "intensity": 0.0, "trajectory": "stable" },
  "implicit_need": "string",
  "sarcasm_detected": false,
  "volatility_score": 0.0,
  "semantic_memory_tags": [],
  "episodic_memory_extract": "string"
}`;

const SAFE_FALLBACK: RouterOutput = {
    crisis_level: 0,
    crisis_flags: [],
    emotion: { primary: "unknown", secondary: "unknown", intensity: 0.5, trajectory: "stable" },
    implicit_need: "unknown",
    sarcasm_detected: false,
    volatility_score: 0.3,
    semantic_memory_tags: [],
    episodic_memory_extract: "",
};

export async function runRouterLLM(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>
): Promise<RouterOutput> {
    const historyContext =
        conversationHistory.length > 0
            ? `\n\nConversation history:\n${conversationHistory
                .slice(-6)
                .map((t) => `${t.role}: ${t.content}`)
                .join("\n")}`
            : "";

    const prompt = `${historyContext}\n\nCurrent user message to analyze:\n"${userMessage}"`;

    try {
        const result = await groq.chat.completions.create({
            model: config.groqModel, // llama-3.1-8b-instant by default — very fast
            messages: [
                { role: "system", content: ROUTER_SYSTEM_PROMPT },
                { role: "user", content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 400,
            response_format: { type: "json_object" },
        });

        const text = result.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(text) as RouterOutput;

        // Validate and clamp
        parsed.crisis_level = Math.max(0, Math.min(5, parsed.crisis_level ?? 0)) as RouterOutput["crisis_level"];
        parsed.emotion ??= SAFE_FALLBACK.emotion;
        parsed.implicit_need ??= "unknown";
        parsed.crisis_flags ??= [];
        parsed.semantic_memory_tags ??= [];
        parsed.sarcasm_detected ??= false;
        parsed.volatility_score ??= 0.3;
        parsed.episodic_memory_extract ??= userMessage.slice(0, 100);

        return parsed;
    } catch (err) {
        console.error("[RouterLLM] Groq fallback failed:", err);
        return { ...SAFE_FALLBACK, episodic_memory_extract: userMessage.slice(0, 100) };
    }
}
