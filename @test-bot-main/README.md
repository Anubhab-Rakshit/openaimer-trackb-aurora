# OpenAimer Track B - AI Mental Health & Emotional Support

A conversational AI that detects underlying emotional needs and responds with hyper-personalized, non-generic support.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MESSAGE INTAKE                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    COGNITIVE ROUTER (Gemini 2.5 Flash)                  │
│  • Emotion Detection (primary/secondary/intensity/trajectory)           │
│  • Implicit Need Analysis                                                 │
│  • Sarcasm/Masking Detection                                             │
│  • Crisis Signal Detection (0-5 scale)                                  │
│  • Emotional Volatility Scoring                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
         ┌─────────────────┐              ┌─────────────────┐
         │   CRISIS PATH   │              │  SAFE PATH      │
         │  (level >= 4)   │              │  (level < 4)   │
         └─────────────────┘              └─────────────────┘
                    │                               │
                    │                               ▼
                    │              ┌───────────────────────────────────┐
                    │              │     MEMORY FETCH                   │
                    │              │  • CAMA (MongoDB) - Recent        │
                    │              │  • Zep Cloud - Long-term          │
                    │              │  • Semantic + Temporal Recall     │
                    │              └───────────────────────────────────┘
                    │                               │
                    │                               ▼
                    │              ┌───────────────────────────────────┐
                    │              │   RESPONSE GENERATOR (Groq Llama) │
                    │              │  • System prompt with context     │
                    │              │  • Banned phrase filtering        │
                    │              │  • Lexical echo validation         │
                    │              └───────────────────────────────────┘
                    │                               │
                    ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EMOGUARD SAFETY SYSTEM                           │
│  • Emotion Watcher - distress/masking/escalation                        │
│  • Thought Refiner - cognitive distortion detection                    │
│  • Dialog Guide - dismissiveness/validation order                      │
│  • Banned Phrase Check - generic response prevention                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          MEMORY UPDATE                                   │
│  • CAMA - High-salience moments with PII sanitization                  │
│  • Zep - Full conversation for long-term recall                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Features

### Signal Detection
- Multi-level emotion analysis (primary, secondary, intensity, trajectory)
- Implicit need detection (validation, advice, venting, problem-solving)
- Sarcasm and emotional masking recognition
- Crisis signal detection with 5-level severity

### Memory Architecture
- **CAMA (Circular Associative Memory)**: Recent emotional moments with semantic similarity
- **Zep Cloud**: Long-term memory with fact extraction
- **Temporal Decay**: Weighted recall based on recency
- **PII Sanitization**: Automatic redaction of dates and times

### Safety System (EmoGuard)
- Real-time emotional distress monitoring
- Cognitive distortion detection
- Therapeutic response validation
- Region-specific crisis resources (India, US, UK)

### Crisis Support
| Region | Primary Resource | Contact |
|--------|-----------------|---------|
| India | iCall (Mumbai) | 9152987821 |
| India | AASRA | 9820466726 |
| India | KIRAN Helpline | 1800-599-0019 |
| US | 988 Lifeline | 988 |
| UK | Samaritans | 116 123 |

## Setup

### 1. Install Dependencies
```bash
cd test-bot-main
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your API keys:
```env
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
ZEP_API_KEY=your_zep_api_key
MONGODB_URI=mongodb://localhost:27017
```

### 3. Build & Run

**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm run build
npm start
```

### 4. Access the Application
- Frontend: http://localhost:8000
- Health Check: http://localhost:8000/chat/health

## API Endpoints

### REST API

**POST /chat** - Send a message and get AI response
```json
{
  "session_id": "user-session-id",
  "message": "I've just stopped thinking about it. It's easier that way.",
  "userId": "optional-user-id",
  "userName": "optional-name"
}
```

**Response:**
```json
{
  "response": "There's something almost logical about that...",
  "isCrisis": false,
  "debug": {
    "emotion_profile": {
      "primary_emotion": "Emptiness",
      "implicit_need": "venting",
      "sarcasm_detected": false,
      "volatility_score": 0.3
    }
  }
}
```

### WebSocket API
Connect to `ws://localhost:8000/chat`

Send: `{ "type": "chat", "message": "..." }`
Receive: `{ "type": "response", "message": "...", "emotion": {...} }`

## Tech Stack

- **Router**: Google Gemini 2.5 Flash (signal detection)
- **Generator**: Groq Llama 3.1 8B (response generation)
- **Orchestration**: LangGraph (multi-node workflow)
- **Memory**: MongoDB (CAMA) + Zep Cloud SDK
- **Safety**: Custom EmoGuard system
- **Frontend**: React + Vite + Framer Motion

## Response Quality Guidelines

The system is designed to avoid generic responses like:
- "I understand how you feel"
- "That sounds really tough"
- "You're not alone"
- "Have you considered speaking to a professional"

Instead, responses:
1. Name the specific detected emotion
2. Echo at least one phrase from the user's message
3. Address the implicit (unstated) need
4. Ask ONE specific, contextual question
5. Reference prior memory when relevant

## Project Structure

```
test-bot-main/
├── src/
│   ├── main.ts              # Express + WebSocket server
│   ├── config.ts            # Environment configuration
│   ├── types.ts             # TypeScript interfaces
│   ├── api/
│   │   ├── chat.ts          # WebSocket handler
│   │   ├── chatRest.ts      # REST API endpoint
│   │   └── session.ts       # Session management
│   ├── graph/
│   │   ├── graph.ts         # LangGraph workflow
│   │   ├── nodes.ts         # Graph nodes (9 total)
│   │   └── state.ts         # State management
│   ├── router/
│   │   └── routerLlm.ts     # Gemini Router LLM
│   ├── memory/
│   │   ├── cama.ts          # CAMA memory (with your enhancements)
│   │   └── zepClient.ts     # Zep Cloud integration
│   ├── safety/
│   │   └── emoguard.ts      # Safety guardrails
│   └── prompts/
│       └── systemPrompt.ts  # Response generation prompts
├── frontend/                 # User's React frontend
│   └── dist/                # Built frontend
└── .env.example             # Environment template
```

## Merged Contributions

### From Friend's Architecture
- Complete LangGraph orchestration (9 nodes)
- CAMA memory with MongoDB
- Zep Cloud long-term memory
- Multi-agent EmoGuard safety system
- Beautiful glassmorphism UI

### From Your Enhancements
- PII sanitization (dates/times)
- Semantic similarity beyond prefix overlap
- Temporal decay weighting (0.9^age)
- India-specific crisis resources (iCall, AASRA, KIRAN)
- Retry logic with exponential backoff
- Identity fact extraction from conversations
- Banned phrase detection in generation node

## Hackathon Tips

1. **Impress judges with**: Real-time emotion velocity tracking, implicit need detection, zero generic responses
2. **Memory continuity**: The CAMA + Zep combination maintains context across sessions
3. **Safety**: EmoGuard ensures therapeutic-grade responses
4. **Personalization**: Echo user's language, reference past conversations
