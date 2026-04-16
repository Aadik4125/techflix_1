"""
Predict stress level for a given transcript using saved artifacts.

Usage:
  python tools/predict_stress.py --text "some transcript here"

Requirements:
  pip install joblib
"""
from __future__ import annotations

import argparse
import os
import sys
import joblib


def load_artifacts(out_dir: str = 'tools'):
    model_path = os.path.join(out_dir, 'stress_model.joblib')
    vec_path = os.path.join(out_dir, 'tfidf_vectorizer.joblib')
    if not os.path.exists(model_path) or not os.path.exists(vec_path):
        raise FileNotFoundError('Model artifacts not found. Run tools/train_stress_model.py first')
    clf = joblib.load(model_path)
    vec = joblib.load(vec_path)
    return clf, vec


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--text', type=str, help='Transcript text to classify')
    args = p.parse_args()

    if not args.text:
        print('Provide transcript text with --text')
        return

    clf, vec = load_artifacts()
    X = vec.transform([args.text])
    pred = clf.predict(X)[0]
    probs = clf.predict_proba(X)[0]
    labels = list(clf.classes_)

    # Map classes to numeric centers (0-100 scale) and compute probability-weighted score
    centers = {'low': 10.0, 'medium': 50.0, 'high': 90.0}
    score = 0.0
    for lab, p in zip(labels, probs):
        center = centers.get(lab, 50.0)
        score += p * center

    print('Prediction:', pred)
    print(f'Probability-weighted score: {score:.2f} / 100')
    print('Class probabilities:')
    for lab, p in zip(labels, probs):
        print(f'  {lab}: {p:.4f}')


if __name__ == '__main__':
    main()
