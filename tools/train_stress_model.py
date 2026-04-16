"""
Train a multinomial logistic regression to classify stress (low/medium/high)
from session transcripts and the `csi_score` stored in the backend DB.

Usage:
  python tools/train_stress_model.py

Requirements:
  pip install scikit-learn pandas joblib
"""
from __future__ import annotations

import json
import os
import sys
from typing import Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split


def load_sessions_from_db() -> pd.DataFrame:
    BACKEND_DIR = os.path.join(os.getcwd(), 'backend')
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from database import SessionLocal
    from models.session import Session

    db = SessionLocal()
    try:
        rows = db.query(Session).filter(Session.transcript != None).filter(Session.csi_score != None).all()
    finally:
        db.close()

    data = []
    for r in rows:
        data.append({'session_id': int(r.id), 'user_id': int(r.user_id), 'session_number': int(r.session_number), 'transcript': r.transcript or '', 'csi_score': int(r.csi_score) if r.csi_score is not None else None})
    return pd.DataFrame(data)


def map_scores_to_labels(scores: np.ndarray) -> Tuple[np.ndarray, dict]:
    # Use 33/66 percentiles to create roughly balanced low/medium/high bins
    q1, q2 = np.percentile(scores, [33.3333, 66.6666])

    def f(x):
        if x <= q1:
            return 'low'
        if x <= q2:
            return 'medium'
        return 'high'

    labels = np.array([f(x) for x in scores])
    bins = {'q1': float(q1), 'q2': float(q2)}
    return labels, bins


def build_and_train(df: pd.DataFrame, out_dir: str = 'tools') -> None:
    os.makedirs(out_dir, exist_ok=True)

    texts = df['transcript'].astype(str).tolist()
    scores = df['csi_score'].astype(int).to_numpy()

    y, bins = map_scores_to_labels(scores)

    vectorizer = TfidfVectorizer(max_features=5000, ngram_range=(1, 2))
    X = vectorizer.fit_transform(texts)

    # Use stratified split where possible
    stratify = y if len(set(y)) > 1 else None
    if stratify is not None:
        # ensure each class has at least 2 samples for stratify
        counts = pd.Series(y).value_counts()
        if counts.min() < 2:
            stratify = None

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=stratify)

    clf = LogisticRegression(max_iter=2000, multi_class='multinomial', solver='saga')
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)

    report = classification_report(y_test, y_pred, digits=4)
    cm = confusion_matrix(y_test, y_pred, labels=['low', 'medium', 'high'])

    print('=== Classification Report ===')
    print(report)
    print('=== Confusion Matrix (rows=true, cols=pred) ===')
    print(cm)

    # Persist artifacts
    joblib.dump(clf, os.path.join(out_dir, 'stress_model.joblib'))
    joblib.dump(vectorizer, os.path.join(out_dir, 'tfidf_vectorizer.joblib'))
    with open(os.path.join(out_dir, 'label_bins.json'), 'w', encoding='utf-8') as f:
        json.dump(bins, f, ensure_ascii=False, indent=2)

    # Save dataset used for training
    df2 = df.copy()
    df2['label'] = y
    df2.to_csv(os.path.join(out_dir, 'training_data_with_labels.csv'), index=False)

    print('\nSaved model and artifacts to:', os.path.abspath(out_dir))


def main():
    df = load_sessions_from_db()
    if df.empty:
        print('No sessions with transcripts and csi_score found in DB. Record sessions first.')
        return

    print(f'Found {len(df)} labelled sessions. Training classifier...')
    build_and_train(df)


if __name__ == '__main__':
    main()
