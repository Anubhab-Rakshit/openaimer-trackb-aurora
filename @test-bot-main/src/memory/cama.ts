import { MongoClient, Collection } from "mongodb";
import { config } from "../config";
import type { MemoryNode, CAMAConsole } from "../types";

const client = new MongoClient(config.mongodbUri, { 
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
});

let camaCollection: Collection | null = null;

async function getCollection(): Promise<Collection> {
    if (!camaCollection) {
        await client.connect();
        camaCollection = client.db().collection("cama_memory");
        console.log("[CAMA] Successfully connected to Local MongoDB.");
    }
    return camaCollection;
}

export class CAMAMemory {
    private userId: string;
    private ring: MemoryNode[] = [];
    private console: CAMAConsole = {
        total_turns: 0,
        average_distress: 0,
        primary_needs: [],
        last_updated: new Date().toISOString()
    };

    constructor(userId: string) {
        this.userId = userId;
    }

    async load(): Promise<void> {
        try {
            const col = await getCollection();
            const doc = await col.findOne({ userId: this.userId });
            if (doc) {
                this.ring = (doc.ring as MemoryNode[]) ?? [];
                this.console = (doc.console as CAMAConsole) ?? this.console;
            }
        } catch (err) {
            console.error("[CAMA] Load error:", err);
            throw err;
        }
    }

    async ingest(message: string, terms: string[], distress: number): Promise<void> {
        const newNode: MemoryNode = {
            id: Math.random().toString(36).substring(7),
            content: message,
            timestamp: Date.now(),
            terms,
            distress
        };

        this.ring.push(newNode);
        if (this.ring.length > 50) this.ring.shift();

        // Update console stats
        this.console.total_turns++;
        this.console.average_distress = (this.console.average_distress * (this.console.total_turns - 1) + distress) / this.console.total_turns;
        this.console.last_updated = new Date().toISOString();

        await this.persist();
    }

    getRing(): MemoryNode[] {
        return this.ring;
    }

    getConsole(): CAMAConsole {
        return this.console;
    }

    private async persist(): Promise<void> {
        try {
            const col = await getCollection();
            await col.updateOne(
                { userId: this.userId },
                { $set: { ring: this.ring, console: this.console, updatedAt: new Date() } },
                { upsert: true }
            );
        } catch (err) {
            console.error("[CAMA] Persist error:", err);
            throw err;
        }
    }
}
