import { Router, Request, Response } from "express";
import { wellnessGraph } from "../graph/graph";
import { v4 as uuidv4 } from "uuid";

export const chatRouter = Router();

interface ChatRequest {
    session_id: string;
    message: string;
    userId?: string;
    userName?: string;
}

chatRouter.post("/", async (req: Request, res: Response) => {
    try {
        const { session_id, message, userId, userName } = req.body as ChatRequest;

        if (!message?.trim()) {
            return res.status(400).json({ error: "Message is required" });
        }

        const userIdentifier = userId || session_id || uuidv4();

        const result = await wellnessGraph.invoke({
            currentMessage: message.trim(),
            userId: userIdentifier,
            userName: userName || "there",
        });

        const response = result.finalResponse as string;
        const routerOutput = result.routerOutput;
        const isCrisis = result.isCrisis as boolean;

        return res.json({
            response,
            isCrisis,
            sessionId: userIdentifier,
            debug: {
                emotion_profile: routerOutput ? {
                    primary_emotion: routerOutput.emotion.primary,
                    secondary_emotion: routerOutput.emotion.secondary,
                    intensity: routerOutput.emotion.intensity,
                    trajectory: routerOutput.emotion.trajectory,
                    implicit_need: routerOutput.implicit_need,
                    sarcasm_detected: routerOutput.sarcasm_detected,
                    volatility_score: routerOutput.volatility_score,
                    crisis_level: routerOutput.crisis_level,
                    crisis_flags: routerOutput.crisis_flags,
                } : null,
            },
        });
    } catch (err) {
        console.error("[Chat REST] Error:", err);
        return res.status(500).json({
            response: "I'm having trouble processing your message right now. Please try again.",
            error: "Internal server error",
        });
    }
});

chatRouter.get("/health", (_req: Request, res: Response) => {
    res.json({
        status: "healthy",
        service: "OpenAimer Emotional Support Engine",
        version: "1.0.0",
        features: [
            "Cognitive Router (Gemini 2.5 Flash)",
            "CAMA Memory (MongoDB)",
            "Zep Long-term Memory",
            "EmoGuard Safety System",
            "Multi-region Crisis Support"
        ]
    });
});
