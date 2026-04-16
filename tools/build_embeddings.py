"""
Build sentence-transformers embeddings for transcripts and optionally a FAISS index.

Usage:
  python tools/build_embeddings.py

Saves:
  - tools/embeddings.npy
  - tools/embedding_ids.json
  - tools/faiss_index.index (if faiss available)
"""
from __future__ import annotations

import json
import os
import sys
from typing import List

import joblib
import numpy as np

BACK = os.path.join(os.getcwd(), 'backend')
if BACK not in sys.path:
    sys.path.insert(0, BACK)

from tools.train_stress_model import load_sessions_from_db


def main(out_dir: str = 'tools'):
    os.makedirs(out_dir, exist_ok=True)
    df = load_sessions_from_db()
    if df.empty:
        print('No sessions to embed')
        return

    texts = df['transcript'].astype(str).tolist()
    ids = df['session_id'].astype(int).tolist()

    try:
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer('all-MiniLM-L6-v2')
    except Exception as e:
        raise RuntimeError('sentence-transformers not available in environment') from e

    embeddings = model.encode(texts, show_progress_bar=True, convert_to_numpy=True)
    emb_path = os.path.join(out_dir, 'embeddings.npy')
    np.save(emb_path, embeddings)

    with open(os.path.join(out_dir, 'embedding_ids.json'), 'w', encoding='utf-8') as f:
        json.dump({'ids': ids}, f)

    # try faiss
    try:
        import faiss

        dim = embeddings.shape[1]
        index = faiss.IndexFlatL2(dim)
        index.add(embeddings.astype('float32'))
        faiss.write_index(index, os.path.join(out_dir, 'faiss_index.index'))
        print('Saved FAISS index')
    except Exception:
        print('FAISS not available — saved raw embeddings only')

    print('Saved embeddings to', emb_path)


if __name__ == '__main__':
    main()
