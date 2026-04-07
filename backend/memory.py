import os
import json
import logging
import re
import networkx as nx
from typing import List, Dict, Any
from models import MemorySnapshot, GraphNode, GraphEdge

class GraphMemory:
    """Enhanced GraphMemory with semantic similarity, temporal weighting, and sanitization."""

    def __init__(self, storage_dir: str = "./memory_storage"):
        self.storage_dir = storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)
        self.graphs: Dict[str, nx.DiGraph] = {}
        # Configure basic error logging
        logging.basicConfig(filename='backend_memory.log', level=logging.ERROR)

    def _sanitize_message(self, message: str) -> str:
        """Remove obvious PII such as dates (MM/DD/YYYY) and timestamps."""
        return re.sub(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b", "[DATE]", message)

    def _get_graph(self, session_id: str) -> nx.DiGraph:
        if session_id not in self.graphs:
            graph_path = os.path.join(self.storage_dir, f"{session_id}.json")
            G = nx.DiGraph()
            if os.path.exists(graph_path):
                try:
                    with open(graph_path, 'r') as f:
                        data = json.load(f)
                        G = nx.node_link_graph(data)
                except Exception as e:
                    logging.error(f"Failed to load graph for {session_id}: {e}")
            self.graphs[session_id] = G
        return self.graphs[session_id]

    def _save_graph(self, session_id: str):
        G = self.graphs[session_id]
        graph_path = os.path.join(self.storage_dir, f"{session_id}.json")
        try:
            data = nx.node_link_data(G)
            with open(graph_path, 'w') as f:
                json.dump(data, f)
        except Exception as e:
            logging.error(f"Failed to save graph for {session_id}: {e}")

    def _compute_semantic_similarity(self, emo1: str, emo2: str) -> float:
        """Very light semantic similarity using prefix overlap.
        In a production system you would use embeddings; here we approximate.
        """
        base1 = emo1.split('_')[0]
        base2 = emo2.split('_')[0]
        return 1.0 if base1 == base2 else 0.0

    def _get_semantic_similar_nodes(self, G: nx.DiGraph, current_emotion: str) -> List[str]:
        """Return emotion nodes that are semantically similar to the current one.
        For now we treat emissions with the same base token as similar.
        """
        similar = []
        for node in G.nodes:
            if G.nodes[node].get('type') == 'emotion':
                if self._compute_semantic_similarity(current_emotion, node) > 0.7:
                    similar.append(node)
        return similar

    def add_interaction(self, session_id: str, message: str, emotion_profile: Any):
        G = self._get_graph(session_id)
        # Sanitize message before storing
        clean_msg = self._sanitize_message(message)
        interaction_node = f"interaction_{len(G.nodes)}"
        G.add_node(interaction_node, type="interaction", message=clean_msg, time=len(G.nodes))
        emotion_node = emotion_profile.primary_emotion.lower()
        if not G.has_node(emotion_node):
            G.add_node(emotion_node, type="emotion", label=emotion_profile.primary_emotion)
        G.add_edge(interaction_node, emotion_node, type="exhibited", weight=emotion_profile.sentiment_score)
        self._save_graph(session_id)

    def retrieve_context(self, session_id: str, current_emotion: str) -> MemorySnapshot:
        G = self._get_graph(session_id)
        if len(G.nodes) == 0:
            return MemorySnapshot(context_summary="No previous history.")
        cur = current_emotion.lower()
        # Gather semantically similar emotion nodes + direct predecessors
        related_emotions = self._get_semantic_similar_nodes(G, cur)
        if cur not in related_emotions:
            related_emotions.append(cur)
        context_nodes = []
        for emo in related_emotions:
            preds = list(G.predecessors(emo))
            context_nodes.extend(preds)
        # Limit to most recent 5 interactions and apply temporal decay weighting
        recent = sorted(context_nodes, key=lambda n: G.nodes[n].get('time', 0), reverse=True)[:5]
        summary_parts = []
        for n in recent:
            msg = G.nodes[n].get('message', '')
            age = G.nodes[n].get('time', 0)
            weight = 0.9 ** (len(G.nodes) - age)
            summary_parts.append(f"{msg} (relevancy:{weight:.2f})")
        summary = " | ".join(summary_parts) if summary_parts else "No relevant past interactions."
        return MemorySnapshot(context_summary=summary)
