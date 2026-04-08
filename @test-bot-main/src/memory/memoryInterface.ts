export interface MemoryProvider {
  // Fetch context for a user
  fetchContext(options: {
    userId: string;
    sessionId?: string;
    limit?: number;
  }): Promise<any>; // Use appropriate types

  // Add a turn/message to session/user
  addTurn(options: {
    userId: string;
    sessionId?: string;
    message: any;
  }): Promise<void>;

  // Ensure session exists, return sessionId
  ensureSession(userId: string): Promise<string>;

  // Fetch user facts for retrieval augment
  getUserFacts(userId: string): Promise<any>;

  // Health check
  health(): Promise<{ healthy: boolean; reason?: string }>;
}
