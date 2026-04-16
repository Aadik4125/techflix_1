from __future__ import annotations

import json
import os
import sys
from typing import List, Tuple

import numpy as np

BACK = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if BACK not in sys.path:
    sys.path.insert(0, BACK)

EMB_PATH = os.path.join(BACK, 'tools', 'embeddings.npy')
IDS_PATH = os.path.join(BACK, 'tools', 'embedding_ids.json')
FAISS_PATH = os.path.join(BACK, 'tools', 'faiss_index.index')


def load_embeddings():
    if not os.path.exists(EMB_PATH) or not os.path.exists(IDS_PATH):
        raise FileNotFoundError('Embeddings or ids not found. Run tools/build_embeddings.py')
    emb = np.load(EMB_PATH)
    with open(IDS_PATH, 'r', encoding='utf-8') as f:
        ids = json.load(f).get('ids', [])
    return emb, ids


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    # a: (m, d), b: (n, d) -> (m, n)
    a_norm = a / np.linalg.norm(a, axis=1, keepdims=True)
    b_norm = b / np.linalg.norm(b, axis=1, keepdims=True)
    return np.dot(a_norm, b_norm.T)


class Retriever:
    def __init__(self):
        self.embeddings = None
        self.ids = None
        self.faiss_index = None
        try:
            self.embeddings, self.ids = load_embeddings()
        except Exception:
            self.embeddings, self.ids = None, None

        # try to load faiss index
        try:
            import faiss

            if os.path.exists(FAISS_PATH):
                self.faiss_index = faiss.read_index(FAISS_PATH)
        except Exception:
            self.faiss_index = None

        # lazily load embedder
        self.embedder = None

    def _ensure_embedder(self):
        if self.embedder is None:
            try:
                from sentence_transformers import SentenceTransformer

                self.embedder = SentenceTransformer('all-MiniLM-L6-v2')
            except Exception:
                self.embedder = None

    def embed_query(self, query: str) -> np.ndarray:
        self._ensure_embedder()
        if self.embedder is None:
            raise RuntimeError('sentence-transformers not available')
        emb = self.embedder.encode([query], convert_to_numpy=True)
        return emb

    def retrieve(self, query: str, top_k: int = 5) -> List[Tuple[int, float]]:
        """Return list of (session_id, score) sorted descending by similarity."""
        if self.embeddings is None:
            raise RuntimeError('Embeddings not loaded')

        q = self.embed_query(query)

        if self.faiss_index is not None:
            # faiss returns distances; convert to similarity
            D, I = self.faiss_index.search(q.astype('float32'), top_k)
            results = []
            for dist, idx in zip(D[0], I[0]):
                if idx < 0 or idx >= len(self.ids):
                    continue
                sid = int(self.ids[idx])
                # for IndexFlatL2, smaller dist = closer; convert
                score = float(1.0 / (1.0 + float(dist)))
                results.append((sid, score))
            return results

        # fallback: cosine similarity via numpy
        sims = _cosine_sim(q, self.embeddings)[0]
        idxs = np.argsort(-sims)[:top_k]
        return [(int(self.ids[int(i)]), float(sims[int(i)])) for i in idxs]


_RETRIEVER = None


def get_retriever():
    global _RETRIEVER
    if _RETRIEVER is None:
        _RETRIEVER = Retriever()
    return _RETRIEVER


def generate_answer_with_llm(question: str, contexts: List[str]) -> str:
    """If OpenAI is available via `openai` package and env var OPENAI_API_KEY, call model; otherwise return concatenated contexts."""
    try:
        import openai

        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            return '\n'.join(contexts)
        openai.api_key = api_key
        prompt = (
            "You are an assistant that answers a user's question using the provided context. "
            "Context passages are provided below. Use them to compose a concise answer.\n\n"
        )
        for i, c in enumerate(contexts[:5], start=1):
            prompt += f"Context {i}: {c}\n\n"
        prompt += f"User question: {question}\n\nAnswer:" 

        if hasattr(openai, 'ChatCompletion'):
            resp = openai.ChatCompletion.create(
                model=os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo'),
                messages=[{"role": "user", "content": prompt}],
                max_tokens=256,
                temperature=0.2,
            )
            return resp['choices'][0]['message']['content'].strip()
        return '\n'.join(contexts)
    except Exception:
        return '\n'.join(contexts)
