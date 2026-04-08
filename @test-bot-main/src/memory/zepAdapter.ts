import {
  ensureSession as zepEnsureSession,
  addTurn as zepAddTurn,
  getContext as zepGetContext,
  getUserFacts as zepUserFacts,
} from "./zepClient";
import type { MemoryProvider } from "./memoryInterface";

export class ZepMemoryAdapter implements MemoryProvider {
  async fetchContext({ userId, sessionId, limit = 8 }: { userId: string; sessionId?: string; limit?: number }) {
    const { facts, summary } = await zepGetContext(userId, ""); // No query for generic context
    return { zepFacts: facts.slice(0, limit), zepSummary: summary };
  }

  async addTurn({ userId, message }: { userId: string; message: any }) {
    // The Zep logic expects userMessage and aiResponse; fallback if one is missing
    await zepAddTurn(userId, message.userMessage || message.content, message.aiResponse || "");
  }

  async ensureSession(userId: string): Promise<string> {
    await zepEnsureSession(userId);
    return userId;
  }

  async getUserFacts(userId: string) {
    return zepUserFacts(userId);
  }

  async health() {
    try {
      // Use a shorter specific check or just catch 404s
      await zepGetContext("health-check", ""); 
      return { healthy: true };
    } catch (err) {
      return { healthy: false, reason: "Zep connection failed" };
    }
  }
}
