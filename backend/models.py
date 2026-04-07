from pydantic import BaseModel, Field
from typing import List, Optional, Dict

class UserMessage(BaseModel):
    session_id: str
    message: str

class EmotionProfile(BaseModel):
    primary_emotion: str = Field(description="The primary underlying emotion (e.g., Sadness, Anger, Emptiness, Anxiety).")
    sentiment_score: int = Field(description="A score from 1 (very negative) to 10 (very positive).")
    implicit_need: str = Field(description="What the user actually needs (e.g., Validation, Problem-solving, Comfort).")
    emotional_velocity: float = Field(description="Rate of emotional change (how fast the mood is shifting). 0 is stable, 1 is highly volatile.")
    crisis_signal_detected: bool = Field(description="True if the user exhibits signs of severe distress, harm, or crisis.")
    selected_strategy: str = Field(description="The psychological counseling strategy selected (e.g., Active Listening, CBT Reframing, Validation).")

class GraphNode(BaseModel):
    node_id: str
    type: str # 'user', 'emotion', 'event'
    label: str
    properties: Dict = {}

class GraphEdge(BaseModel):
    source: str
    target: str
    type: str # 'felt', 'caused_by', 'related_to'
    weight: float = 1.0

class MemorySnapshot(BaseModel):
    nodes: List[GraphNode] = []
    edges: List[GraphEdge] = []
    context_summary: str = ""

class AgentState(BaseModel):
    session_id: str
    messages: List[Dict[str, str]] # [{'role': 'user'|'assistant', 'content': '...'}]
    current_message: str
    emotion_profile: Optional[EmotionProfile] = None
    retrieved_memory: Optional[MemorySnapshot] = None
    response: str = ""
