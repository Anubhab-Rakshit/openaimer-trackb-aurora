import os
import logging
import re
from typing import TypedDict, Annotated, Sequence, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import operator

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential

from models import EmotionProfile, AgentState, UserMessage, MemorySnapshot
from memory import GraphMemory

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Model Optimization: Using Gemini 2.5-flash for both (avoids rate limits)
try:
    # Router: Gemini 2.5-flash for speed, low temperature for consistency
    flash_model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.1, thinking_budget=0)
    router_model = flash_model.with_structured_output(EmotionProfile)

    # Generator: Gemini 2.5-flash with higher temperature for creativity (skipping Pro to avoid rate limits)
    pro_model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7, thinking_budget=0)

except Exception as e:
    logger.error(f"Model Init Error: {e}")
    # Fallback to 2.5-flash for both
    flash_model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.1, thinking_budget=0)
    router_model = flash_model.with_structured_output(EmotionProfile)
    pro_model = flash_model

# Retry decorator for model invocations
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
def invoke_model_with_retry(model, *args, **kwargs):
    """Invoke model with exponential backoff retry logic."""
    return model.invoke(*args, **kwargs)



memory_manager = GraphMemory()

# Define LangGraph State
class GraphState(TypedDict):
    session_id: str
    messages: Sequence[BaseMessage]
    current_message: str
    emotion_profile: Optional[EmotionProfile]
    retrieved_memory: Optional[MemorySnapshot]
    response: str

# Nodes
def router_node(state: GraphState):
    """Analyzes message for implicit needs and extracts EmotionProfile."""
    msg = state["current_message"]

    prompt = f"""
    Analyze the user's message and predict their underlying emotional state, sentiment, and emotional velocity.
    Remember that users rarely say exactly what they mean. Look for implicit distress or subtle cues.
    You must also choose a psychological strategy (e.g., Active Listening, CBT Reframing, Validation) to respond.

    User message: "{msg}"
    """

    try:
        profile = invoke_model_with_retry(router_model, prompt)
    except Exception as e:
        logger.error(f"Router model failed: {e}")
        profile = EmotionProfile(
            primary_emotion="Neutral",
            sentiment_score=5,
            implicit_need="General Chat",
            emotional_velocity=0.0,
            crisis_signal_detected=False,
            selected_strategy="Active Listening"
        )
    return {"emotion_profile": profile}

def guardrail_condition(state: GraphState):
    """Router logic for crisis detection."""
    if state["emotion_profile"].crisis_signal_detected:
        return "safety_node"
    return "memory_node"

# Crisis resources by region
CRISIS_RESOURCES = {
    "US": "988 Suicide & Crisis Lifeline (call or text 988)",
    "UK": "Samaritans at 116 123",
    "IN": "KIRAN Mental Health Helpline at 1800-599-0019 or AASRA at 9820466726",
    "AU": "Lifeline at 13 11 14",
    "CA": "Crisis Services Canada at 1-833-456-4566",
}

def safety_node(state: GraphState):
    """Handles explicit crisis signals safely with actionable resources."""
    logger.warning(f"CRISIS SIGNAL DETECTED in session {state['session_id']}")
    region = "IN"  # Default region; can be made dynamic via UserMessage
    resource = CRISIS_RESOURCES.get(region, "your local emergency services or crisis hotline")

    response = (
        f"It sounds like you're going through an incredibly difficult time right now. "
        f"Your safety matters. Please reach out to {resource} — they have trained professionals "
        f"who can support you immediately.\n\n"
        f"In the meantime, would you like me to guide you through a grounding exercise? "
        f"Try this: Breathe in slowly for 4 seconds, hold for 4, and exhale for 6. "
        f"Repeat this a few times while noticing 5 things around you."
    )

    memory_manager.add_interaction(state["session_id"], state["current_message"], state["emotion_profile"])
    return {"response": response}

def memory_node(state: GraphState):
    """Retrieves relevant memory graph context."""
    context = memory_manager.retrieve_context(state["session_id"], state["emotion_profile"].primary_emotion)
    return {"retrieved_memory": context}

def generator_node(state: GraphState):
    """Generates the deeply contextual response."""
    profile = state["emotion_profile"]
    memory_context = state["retrieved_memory"].context_summary

    system_prompt = f"""
    You are an advanced, empathetic AI counseling assistant.
    You do NOT use generic responses like "I'm sorry you feel that way" or "That must be hard."
    You are designed to read between the lines and respond with extreme specificity.

    CURRENT ASSESSMENT:
    - Primary Emotion: {profile.primary_emotion}
    - Underlying Need: {profile.implicit_need}
    - Counseling Strategy to use: {profile.selected_strategy}

    RELEVANT MEMORY:
    {memory_context}

    INSTRUCTIONS:
    1. Apply the {profile.selected_strategy} strategy.
    2. Address the implicit need ({profile.implicit_need}) rather than just the surface words.
    3. If there is a shift in mood, acknowledge it subtly.
    4. Keep the response natural, human-like, and conversational.
    """

    # Construct message list for context
    messages_to_send = [SystemMessage(content=system_prompt)]
    messages_to_send.extend(state["messages"])
    messages_to_send.append(HumanMessage(content=state["current_message"]))

    try:
        ai_response = invoke_model_with_retry(pro_model, messages_to_send)
    except Exception as e:
        logger.error(f"Generator model failed: {e}")
        # Fallback: use flash model with higher temperature
        fallback = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7)
        ai_response = fallback.invoke(messages_to_send)

    # Update memory after generating response
    memory_manager.add_interaction(state["session_id"], state["current_message"], profile)
    return {"response": ai_response.content if hasattr(ai_response, 'content') else str(ai_response)}

# Compile Graph
workflow = StateGraph(GraphState)
workflow.add_node("router", router_node)
workflow.add_node("safety", safety_node)
workflow.add_node("memory", memory_node)
workflow.add_node("generator", generator_node)

workflow.set_entry_point("router")
workflow.add_conditional_edges("router", guardrail_condition, {"safety_node": "safety", "memory_node": "memory"})
workflow.add_edge("memory", "generator")
workflow.add_edge("generator", END)
workflow.add_edge("safety", END)

app_graph = workflow.compile()

# FastAPI Setup
app = FastAPI(title="OpenAimer Track B Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session message tracking (for hackathon purposes instead of persistent DB)
session_messages = {}

@app.post("/chat")
async def chat_endpoint(payload: UserMessage):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set.")

    sess_id = payload.session_id
    if sess_id not in session_messages:
        session_messages[sess_id] = []

    # Trim to last 4 turns to stay within context limits (8 messages total: user+ai pairs)
    initial_state = {
        "session_id": sess_id,
        "messages": session_messages[sess_id][-4:],
        "current_message": payload.message,
        "emotion_profile": None,
        "retrieved_memory": None,
        "response": ""
    }

    try:
        for event in app_graph.stream(initial_state):
            pass  # Stream execution
        final_state = event[list(event.keys())[0]]
        response_text = final_state["response"]
    except Exception as e:
        logger.error(f"Graph streaming failed: {e}")
        response_text = "I encountered an internal error. Please try again."

    # Update short-term context
    session_messages[sess_id].append(HumanMessage(content=payload.message))
    session_messages[sess_id].append(AIMessage(content=response_text))
    # Keep session memory bounded
    if len(session_messages[sess_id]) > 20:
        session_messages[sess_id] = session_messages[sess_id][-20:]

    return {
        "response": response_text,
        "debug": {
            "emotion_profile": final_state.get("emotion_profile", {}).model_dump()
            if final_state.get("emotion_profile")
            else None,
            "memory_context": final_state.get("retrieved_memory", {}).model_dump()
            if final_state.get("retrieved_memory")
            else None,
        },
    }

# Health check endpoint for API key validation
@app.get("/health")
def health_check():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set.")
    return {
        "status": "healthy",
        "models": ["gemini-2.5-flash (router)", "gemini-2.5-flash (generator)"],
        "features": ["semantic memory", "temporal weighting", "crisis detection", "retry logic"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
