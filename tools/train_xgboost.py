"""
Train XGBoost regressor and classifier on TF-IDF + numeric acoustic features.

Usage:
  python tools/train_xgboost.py

Requirements:
  pip install xgboost scikit-learn joblib sentence-transformers
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
from sklearn.metrics import classification_report, confusion_matrix, mean_absolute_error
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from scipy import sparse

try:
    from xgboost import XGBClassifier, XGBRegressor
except Exception:
    XGBClassifier = None
    XGBRegressor = None

from tools.train_stress_model import load_sessions_from_db, map_scores_to_labels
try:
    from tools.feature_engineering import compute_text_features
except ImportError:
    compute_text_features = None

def build_feature_matrices(df: pd.DataFrame):
    texts = df['transcript'].astype(str).tolist()
    vectorizer = TfidfVectorizer(max_features=5000, ngram_range=(1, 2))
    X_text = vectorizer.fit_transform(texts)

    numeric_feature_names = [
        'mfcc_variability_mean',
        'rms_mean',
        'zcr_mean',
        'spectral_centroid_mean',
        'harmonic_ratio',
        'tempo',
        'duration_sec',
        'speech_rate_estimate',
        'lexical_diversity',
        # engineered
        'sentiment_compound',
        'negative_ratio',
        'stress_keyword_count',
    ]

    numeric_rows = []
    for idx, row in df.iterrows():
        a = row.get('acoustic_features') or {}
        t = row.get('temporal_features') or {}
        l = row.get('linguistic_features') or {}
        try:
            eng = compute_text_features(row.get('transcript') or '') if compute_text_features else {}
        except Exception:
            eng = {}
        vals = []
        for k in numeric_feature_names:
            v = None
            if k in a:
                v = a.get(k)
            elif k in t:
                v = t.get(k)
            elif k in l:
                v = l.get(k)
            elif k in eng:
                v = eng.get(k)
            try:
                vals.append(float(v) if v is not None else 0.0)
            except Exception:
                vals.append(0.0)
        numeric_rows.append(vals)

    X_num = np.array(numeric_rows, dtype=float)
    scaler = StandardScaler()
    X_num_scaled = scaler.fit_transform(X_num) if X_num.size else X_num

    X_num_sparse = sparse.csr_matrix(X_num_scaled)
    X = sparse.hstack([X_text, X_num_sparse], format='csr')

    return X, X_text, X_num_scaled, vectorizer, scaler


def train_models(df: pd.DataFrame, out_dir: str = 'tools') -> None:
    os.makedirs(out_dir, exist_ok=True)

    scores = df['csi_score'].astype(int).to_numpy()
    y_cls, bins = map_scores_to_labels(scores)

    X, X_text, X_num_scaled, vectorizer, scaler = build_feature_matrices(df)

    # encode class labels for XGBoost which expects numeric classes
    le = LabelEncoder()
    y_cls_enc = le.fit_transform(y_cls)

    positions = np.arange(X.shape[0])
    stratify = y_cls_enc if len(set(y_cls_enc)) > 1 else None
    X_train, X_test, y_train_cls_enc, y_test_cls_enc, pos_train, pos_test = train_test_split(
        X, y_cls_enc, positions, test_size=0.2, random_state=42, stratify=stratify
    )

    # Regression target uses raw csi_score
    y_reg = scores
    y_reg_train = y_reg[pos_train]
    y_reg_test = y_reg[pos_test]

    # Train XGBoost classifier
    if XGBClassifier is not None:
        clf = XGBClassifier(eval_metric='mlogloss')
    else:
        from sklearn.ensemble import RandomForestClassifier

        clf = RandomForestClassifier(n_estimators=100)

    clf.fit(X_train, y_train_cls_enc)
    y_pred_enc = clf.predict(X_test)

    # convert back to original label strings for reporting
    y_pred = le.inverse_transform(y_pred_enc)
    y_test_labels = le.inverse_transform(y_test_cls_enc)

    print('=== XGBoost / Classifier Report ===')
    print(classification_report(y_test_labels, y_pred, digits=4))
    print('Confusion matrix:')
    print(confusion_matrix(y_test_labels, y_pred, labels=['low', 'medium', 'high']))

    # Train XGBoost regressor on same split
    if XGBRegressor is not None:
        reg = XGBRegressor()
    else:
        from sklearn.ensemble import RandomForestRegressor

        reg = RandomForestRegressor(n_estimators=100)

    reg.fit(X_train, y_reg_train)
    y_reg_pred = reg.predict(X_test)
    mae = mean_absolute_error(y_reg_test, y_reg_pred)
    print('=== XGBoost / Regressor Report ===')
    print(f'Test Set MAE: {mae:.4f}')

    # Refit on full dataset for production artifacts
    print("\nRefitting on full dataset for production artifacts...")
    clf.fit(X, y_cls_enc)
    reg.fit(X, scores)

    joblib.dump(clf, os.path.join(out_dir, 'xgb_stress_classifier.joblib'))
    joblib.dump(reg, os.path.join(out_dir, 'xgb_stress_regressor.joblib'))
    joblib.dump(vectorizer, os.path.join(out_dir, 'tfidf_vectorizer_xgb.joblib'))
    joblib.dump(scaler, os.path.join(out_dir, 'numeric_scaler_xgb.joblib'))

    with open(os.path.join(out_dir, 'xgb_label_classes.json'), 'w', encoding='utf-8') as f:
        json.dump({'classes': le.classes_.tolist()}, f, ensure_ascii=False, indent=2)

    with open(os.path.join(out_dir, 'label_bins_xgb.json'), 'w', encoding='utf-8') as f:
        json.dump(bins, f, ensure_ascii=False, indent=2)

    print('\nSaved XGBoost artifacts to:', os.path.abspath(out_dir))


def main():
    df = load_sessions_from_db()
    if df.empty:
        print('No sessions with transcripts and csi_score found in DB. Record sessions first.')
        return

    print(f'Found {len(df)} labelled sessions.')
    # quick hyperparameter tuning if requested via env var TUNE=1
    if os.getenv('TUNE', '0') == '1':
        print('Running hyperparameter tuning and model selection (GridSearchCV)...')
        from sklearn.model_selection import GridSearchCV, StratifiedKFold

        X, _, _, vectorizer, scaler = build_feature_matrices(df)
        scores = df['csi_score'].astype(int).to_numpy()
        y_cls, bins = map_scores_to_labels(scores)

        le = LabelEncoder()
        y_enc = le.fit_transform(y_cls)

        skf = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
        out_dir = 'tools'

        # small grid for classifier
        try:
            if XGBClassifier is None: raise ImportError("XGBoost not installed")
            param_grid = {'n_estimators': [50, 100], 'max_depth': [3, 6], 'learning_rate': [0.1, 0.01]}
            model = XGBClassifier(eval_metric='mlogloss')
            gs = GridSearchCV(model, param_grid, cv=skf, scoring='f1_macro', n_jobs=1)
            gs.fit(X, y_enc)
            print('Best classifier params:', gs.best_params_)
            clf_best = gs.best_estimator_
        except Exception:
            clf_best = None

        # small grid for regressor
        try:
            if XGBRegressor is None: raise ImportError("XGBoost not installed")
            param_grid_r = {'n_estimators': [50, 100], 'max_depth': [3, 6], 'learning_rate': [0.1, 0.01]}
            model_r = XGBRegressor()
            gs_r = GridSearchCV(model_r, param_grid_r, cv=3, scoring='neg_mean_absolute_error', n_jobs=1)
            gs_r.fit(X, scores)
            print('Best regressor params:', gs_r.best_params_)
            reg_best = gs_r.best_estimator_
        except Exception:
            reg_best = None

        if clf_best is not None and reg_best is not None:
            # save best models
            joblib.dump(clf_best, os.path.join(out_dir, 'xgb_stress_classifier.joblib'))
            joblib.dump(reg_best, os.path.join(out_dir, 'xgb_stress_regressor.joblib'))
            joblib.dump(vectorizer, os.path.join(out_dir, 'tfidf_vectorizer_xgb.joblib'))
            joblib.dump(scaler, os.path.join(out_dir, 'numeric_scaler_xgb.joblib'))
            with open(os.path.join(out_dir, 'xgb_label_classes.json'), 'w', encoding='utf-8') as f:
                json.dump({'classes': le.classes_.tolist()}, f, ensure_ascii=False, indent=2)
            with open(os.path.join(out_dir, 'label_bins_xgb.json'), 'w', encoding='utf-8') as f:
                json.dump(bins, f, ensure_ascii=False, indent=2)
            print(f'Saved tuned XGBoost artifacts to {out_dir}/')
        else:
            print('Tuning did not produce valid estimators; running default training')
            train_models(df)
    else:
        print('Training XGBoost models...')
        train_models(df)


if __name__ == '__main__':
    main()
