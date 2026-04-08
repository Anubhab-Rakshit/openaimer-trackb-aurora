import { CAMAMemory } from "./cama";
import type { MemoryProvider } from "./memoryInterface";

export class CAMAMemoryAdapter implements MemoryProvider {
  async fetchContext({ userId, limit = 5 }: { userId: string; limit?: number }) {
    const cama = new CAMAMemory(userId);
    await cama.load();
    const ring = cama.recall([], limit); // fetch all (no emotion filter)
    const consoleFacts = cama.getConsole();
    return { camaNodes: ring, camaConsole: consoleFacts };
  }

  async addTurn({ userId, message }: { userId: string; message: any }) {
    const cama = new CAMAMemory(userId);
    await cama.load();
    let emotionTags = message.emotion_tags || [];
    let salience = message.salience || 0.5;
    await cama.ingest(message.content, emotionTags, salience);
  }

  async ensureSession(userId: string): Promise<string> {
    // For CAMA, userId acts as sessionId; no session logic needed
    return userId;
  }

  async getUserFacts(userId: string) {
    const cama = new CAMAMemory(userId);
    await cama.load();
    return cama.getConsole();
  }

  async health() {
    try {
      const cama = new CAMAMemory("test-health");
      await cama.load();
      return { healthy: true };
    } catch (err) {
      return { healthy: false, reason: String(err) };
    }
  }
}
