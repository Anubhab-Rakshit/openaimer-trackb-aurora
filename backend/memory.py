import networkx as nx
from typing import List, Dict, Any
from models import MemorySnapshot, GraphNode, GraphEdge
import json
import os

class GraphMemory:
    def __init__(self, storage_dir: str = "./memory_storage"):
        self.storage_dir = storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)
        # Dictionary bridging session_id to their respective NetworkX directed graphs
        self.graphs: Dict[str, nx.DiGraph] = {}

    def _get_graph(self, session_id: str) -> nx.DiGraph:
        if session_id not in self.graphs:
            graph_path = os.path.join(self.storage_dir, f"{session_id}.json")
            G = nx.DiGraph()
            if os.path.exists(graph_path):
                with open(graph_path, 'r') as f:
                    data = json.load(f)
                    G = nx.node_link_graph(data)
            self.graphs[session_id] = G
        return self.graphs[session_id]

    def _save_graph(self, session_id: str):
        G = self.graphs[session_id]
        graph_path = os.path.join(self.storage_dir, f"{session_id}.json")
        data = nx.node_link_data(G)
        with open(graph_path, 'w') as f:
            json.dump(data, f)

    def add_interaction(self, session_id: str, message: str, emotion_profile: Any):
        G = self._get_graph(session_id)
        
        # Add basic chronological root mechanism
        interaction_node = f"interaction_{len(G.nodes)}"
        G.add_node(interaction_node, type="interaction", message=message, time=len(G.nodes))
        
        emotion_node = emotion_profile.primary_emotion.lower()
        if not G.has_node(emotion_node):
            G.add_node(emotion_node, type="emotion", label=emotion_profile.primary_emotion)
        
        # Connect interaction to the recognized emotion
        G.add_edge(interaction_node, emotion_node, type="exhibited", weight=emotion_profile.sentiment_score)
        
        # In a full REMT system, we would extract semantic entities (like "exams", "parents") 
        # and attach them here as well. We'll simplify this to just tracking the emotional topology.
        self._save_graph(session_id)

    def retrieve_context(self, session_id: str, current_emotion: str) -> MemorySnapshot:
        G = self._get_graph(session_id)
        if len(G.nodes) == 0:
            return MemorySnapshot(context_summary="No previous history.")
            
        current_emotion = current_emotion.lower()
        
        nodes = []
        edges = []
        
        # If the emotion exists in the graph, we fetch the subgraph of previous times the user felt this way
        if G.has_node(current_emotion):
            # Get neighbors (interactions that led to this emotion)
            neighbors = list(G.predecessors(current_emotion))
            summary_parts = []
            for n in neighbors[-3:]: # Get last 3 instances
                node_data = G.nodes[n]
                summary_parts.append(f"Previously felt {current_emotion} when mentioning: '{node_data.get('message', '')}'")
            
            context_summary = " ".join(summary_parts)
            
            return MemorySnapshot(
                context_summary=context_summary
            )
        else:
            # Just return general recent history
            recent_nodes = [n for n, d in G.nodes(data=True) if d.get('type') == 'interaction']
            recent_nodes.sort(key=lambda x: G.nodes[x].get('time', 0))
            recent_interactions = [G.nodes[n].get('message', '') for n in recent_nodes[-2:]]
            return MemorySnapshot(
                context_summary=f"Recent interactions: {' | '.join(recent_interactions)}"
            )
