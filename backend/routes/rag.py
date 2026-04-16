from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from database import SessionLocal
from models.session import Session as SessionModel

from app.services.rag_service import get_retriever, generate_answer_with_llm

router = APIRouter()


@router.post('/rag/query')
def rag_query(payload: dict[str, Any]):
    q = payload.get('query')
    top_k = int(payload.get('top_k', 5))
    if not q:
        raise HTTPException(status_code=400, detail='query required')

    retriever = get_retriever()
    try:
        results = retriever.retrieve(q, top_k=top_k)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # fetch transcripts from DB for returned session ids
    db = SessionLocal()
    out = []
    texts = []
    try:
        for sid, score in results:
            row = db.query(SessionModel).filter(SessionModel.id == int(sid)).first()
            if row is None:
                continue
            text = row.transcript or ''
            texts.append(text)
            out.append({'session_id': int(sid), 'score': float(score), 'transcript': text})
    finally:
        db.close()

    # generate answer from LLM if available
    answer = generate_answer_with_llm(q, texts)

    return {'query': q, 'results': out, 'answer': answer}
