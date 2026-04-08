import { ZepClient } from "@getzep/zep-cloud";
import { config } from "../config";
import type { ZepFact } from "../types";

const zep = new ZepClient({ apiKey: config.zepApiKey });

let isZepGloballyDisabled = false;

/**
 * Helper to wrap Zep calls. If it fails once (especially with a 404),
 * we disable Zep globally for this session to stop log spam and slowness.
 */
async function wrapZep<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    if (isZepGloballyDisabled) return fallback;
    try {
        return await operation();
    } catch (err: any) {
        // If it's a 404 or connection error, disable globally
        const isNotFoundError = err.message?.includes("404") || err.statusCode === 404;
        if (isNotFoundError || err.message?.includes("fetch")) {
            isZepGloballyDisabled = true;
        }
        return fallback;
    }
}

export async function ensureSession(userId: string): Promise<void> {
    await wrapZep(async () => {
        try {
            await zep.user.add({ userId });
        } catch {}

        try {
            await zep.memory.getSession(userId);
        } catch {
            await zep.memory.addSession({
                sessionId: userId,
                userId: userId,
                metadata: { created_at: new Date().toISOString() },
            });
        }
    }, undefined);
}

export async function addTurn(
    userId: string,
    userMessage: string,
    aiResponse: string
): Promise<void> {
    await wrapZep(async () => {
        await zep.memory.add(userId, {
            messages: [
                { role: "user", roleType: "user", content: userMessage },
                { role: "assistant", roleType: "assistant", content: aiResponse },
            ],
        });
    }, undefined);
}

export async function getContext(
    userId: string,
    query: string
): Promise<{ facts: ZepFact[]; summary: string }> {
    return wrapZep(async () => {
        const results = await zep.memory.searchSessions({
            userId,
            text: query,
            limit: 8,
        });

        const facts: ZepFact[] = (results.results ?? []).map((r: any) => ({
            fact: r.fact ?? r.summary ?? "",
            entity: r.name,
            valid_at: r.valid_at,
            invalid_at: r.invalid_at,
        }));

        let summary = "";
        try {
            const mem = await zep.memory.get(userId);
            summary = mem.summary?.content ?? "";
        } catch {}

        return { facts, summary };
    }, { facts: [], summary: "" });
}

export async function getUserFacts(userId: string): Promise<ZepFact[]> {
    return wrapZep(async () => {
        const facts = await zep.user.getFacts(userId);
        return (facts.facts ?? []).map((f: any) => ({
            fact: f.fact,
            entity: f.name,
            valid_at: f.valid_at,
            invalid_at: f.invalid_at,
        }));
    }, []);
}
