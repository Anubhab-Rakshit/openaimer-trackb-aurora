import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import TypedDict, Annotated, Sequence, Optional
import operator

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
from dotenv import load_dotenv

from models import EmotionProfile, AgentState, UserMessage, MemorySnapshot
from memory import GraphMemory

load_dotenv()

# Update: Using the highly advanced 2.5 and 3.1 models available on this API key.
try:
    # thinking_budget=0 disables the default 'thinking' mode on 2.5-flash, reducing latency from ~10s to ~2-3s
    flash_model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.1, thinking_budget=0)
    router_model = flash_model.with_structured_output(EmotionProfile)
    pro_model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7, thinking_budget=0)
except Exception as e:
    print(f"Model Init Error: {e}")
    # Final fallback strings
    flash_model = ChatGoogleGenerativeAI(model="gemini-2.5-flash")
    router_model = flash_model.with_structured_output(EmotionProfile)
    pro_model = flash_model



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
    
    # We ask the router model to analyze the user's message
    prompt = f"""
    Analyze the user's message and predict their underlying emotional state, sentiment, and emotional velocity.
    Remember that users rarely say exactly what they mean. Look for implicit distress or subtle cues.
    You must also choose a psychological strategy (e.g., Active Listening, CBT Reframing, Validation) to respond.
    
    User message: "{msg}"
    """
    
    try:
        profile = router_model.invoke(prompt)
    except Exception as e:
        # Fallback if structured output fails
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

def safety_node(state: GraphState):
    """Handles explicit crisis signals safely."""
    response = "It sounds like you're going through an incredibly difficult time right now. Please know that you are not alone. If you are feeling overwhelmed and need immediate support, please reach out to a local crisis hotline or a healthcare professional. We want you to be safe."
    
    # We still want to log this in memory, but we don't pass it to the generator
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
    
    RELEVANT MEMORY (from previous sessions):
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
        ai_response = pro_model.invoke(messages_to_send)
    except Exception as e:
        print(f"Node Error Fallback: {e}")
        # Final emergency fallback if the Pro/Flash invoke itself fails
        fallback_model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7)
        ai_response = fallback_model.invoke(messages_to_send)

    
    # Update memory after generating response
    memory_manager.add_interaction(state["session_id"], state["current_message"], profile)
    
    return {"response": ai_response.content}

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
        
    initial_state = {
        "session_id": sess_id,
        "messages": session_messages[sess_id][-6:], # Keep last 6 message turns in context
        "current_message": payload.message,
        "emotion_profile": None,
        "retrieved_memory": None,
        "response": ""
    }
    
    for event in app_graph.stream(initial_state):
        pass # Stream execution
        
    final_state = event[list(event.keys())[0]] # Get output from last node
    response_text = final_state["response"]
    
    # Update short-term context
    session_messages[sess_id].append(HumanMessage(content=payload.message))
    session_messages[sess_id].append(AIMessage(content=response_text))
    
    # Return additional debug info for the hackathon UI to show off the backend
    return {
        "response": response_text,
        "debug": {
            "emotion_profile": final_state.get("emotion_profile", {}).model_dump() if final_state.get("emotion_profile") else None,
            "memory_context": final_state.get("retrieved_memory", {}).model_dump() if final_state.get("retrieved_memory") else None
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
