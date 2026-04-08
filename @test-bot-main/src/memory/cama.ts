import { MongoClient, Collection } from "mongodb";
import { config } from "../config";
import type { MemoryNode, CAMAConsole } from "../types";

const client = new MongoClient(config.mongodbUri);
let camaCollection: Collection | null = null;

async function getCollection(): Promise<Collection> {
    if (!camaCollection) {
        await client.connect();
        camaCollection = client.db("wellness_db").collection("cama_memory");
    }
    return camaCollection;
}

function cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return magA && magB ? dot / (magA * magB) : 0;
}

function emotionOverlap(tags1: string[], tags2: string[]): number {
    const set1 = new Set(tags1.map((t) => t.toLowerCase()));
    const intersection = tags2.filter((t) => set1.has(t.toLowerCase()));
    return intersection.length / Math.max(tags1.length, tags2.length, 1);
}

function sanitizeMessage(message: string): string {
    return message
        .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "[DATE]")
        .replace(/\b\d{1,2}-\d{1,2}-\d{2,4}\b/g, "[DATE]")
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\b/g, "[TIME]");
}

function semanticSimilarity(emo1: string, emo2: string): number {
    const base1 = emo1.split('_')[0].toLowerCase();
    const base2 = emo2.split('_')[0].toLowerCase();
    if (base1 === base2) return 1.0;
    const emotionGroups: Record<string, string[]> = {
        sad: ['sad', 'depressed', 'melancholy', 'grief', 'sorrow'],
        happy: ['happy', 'joy', 'excited', 'pleased', 'glad'],
        angry: ['angry', 'frustrated', 'irritated', 'annoyed', 'rage'],
        fear: ['fear', 'anxious', 'worried', 'scared', 'panic'],
        empty: ['empty', 'numb', 'hollow', 'void', 'apathetic'],
    };
    for (const group of Object.values(emotionGroups)) {
        if (group.includes(base1) && group.includes(base2)) return 0.8;
    }
    return 0.0;
}

export class CAMAMemory {
    private ring: MemoryNode[] = [];
    private readonly maxRingSize = 50;
    private console: CAMAConsole = {
        core_beliefs: [],
        recurring_patterns: [],
        identity_facts: [],
    };
    private readonly userId: string;
    private readonly decayFactor = 0.9;

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
        }
    }

    async ingest(
        content: string,
        emotionTags: string[],
        salience: number
    ): Promise<void> {
        const cleanContent = sanitizeMessage(content);
        
        const node: MemoryNode = {
            content: cleanContent,
            emotion_tags: emotionTags,
            timestamp: Date.now(),
            salience,
        };

        if (salience > 0.6) {
            this.ring.push(node);
            if (this.ring.length > this.maxRingSize) {
                const minIdx = this.ring.reduce(
                    (minI, n, i, arr) => (n.salience < arr[minI].salience ? i : minI),
                    0
                );
                this.ring.splice(minIdx, 1);
            }
        }

        this.updateConsole(cleanContent);
        await this.persist();
    }

    recall(queryEmotionTags: string[], topK = 5): MemoryNode[] {
        if (this.ring.length === 0) return [];

        const scored = this.ring.map((node) => {
            let emotionScore = emotionOverlap(node.emotion_tags, queryEmotionTags);
            
            for (const tag of queryEmotionTags) {
                for (const nodeTag of node.emotion_tags) {
                    emotionScore = Math.max(emotionScore, semanticSimilarity(tag, nodeTag));
                }
            }

            const ageMs = Date.now() - node.timestamp;
            const recencyScore = Math.exp(-ageMs / (7 * 24 * 3600 * 1000));
            
            const temporalDecay = Math.pow(this.decayFactor, Math.floor(ageMs / (24 * 3600 * 1000)));
            const temporalScore = recencyScore * temporalDecay;

            const finalScore = 0.4 * emotionScore + 0.35 * node.salience + 0.25 * temporalScore;
            return { node, score: finalScore };
        });

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map((s) => s.node);
    }

    getConsole(): CAMAConsole {
        return this.console;
    }

    formatForPrompt(nodes: MemoryNode[]): string {
        if (nodes.length === 0) return "No prior emotional context.";
        return nodes
            .map((n) => {
                const when = new Date(n.timestamp).toLocaleDateString();
                const age = Math.floor((Date.now() - n.timestamp) / (24 * 3600 * 1000));
                const relevancy = Math.pow(this.decayFactor, age).toFixed(2);
                return `[${when}] ${n.content} (emotion: ${n.emotion_tags.join(", ")}) [relevancy: ${relevancy}]`;
            })
            .join("\n");
    }

    private updateConsole(content: string): void {
        const patternKeywords = ["always", "never", "every time", "keeps happening", "can't stop", "repeatedly", "again and again"];
        for (const kw of patternKeywords) {
            if (content.toLowerCase().includes(kw) && !this.console.recurring_patterns.includes(content.slice(0, 100))) {
                if (!this.console.recurring_patterns.includes(content.slice(0, 100))) {
                    this.console.recurring_patterns.push(content.slice(0, 100));
                }
            }
        }

        const identityKeywords = ["i am", "i'm ", "i was", "i used to", "my name"];
        for (const kw of identityKeywords) {
            if (content.toLowerCase().includes(kw)) {
                const facts = content.match(/[^.!?]+/g) || [];
                for (const fact of facts.slice(0, 2)) {
                    const trimmed = fact.trim().slice(0, 80);
                    if (trimmed.length > 10 && !this.console.identity_facts.includes(trimmed)) {
                        this.console.identity_facts.push(trimmed);
                    }
                }
            }
        }

        if (this.console.recurring_patterns.length > 10) {
            this.console.recurring_patterns = this.console.recurring_patterns.slice(-10);
        }
        if (this.console.identity_facts.length > 20) {
            this.console.identity_facts = this.console.identity_facts.slice(-20);
        }
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
        }
    }
}
