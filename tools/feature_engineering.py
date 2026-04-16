"""
Small text feature engineering utilities used by trainers.
"""
from __future__ import annotations

import re
from typing import Dict

NEGATIVE_WORDS = {
    'sad', 'depressed', 'angry', 'upset', 'anxious', 'anxiety', 'stressed', 'overwhelmed',
    'hopeless', 'tired', 'fatigued', 'worthless', 'down', 'unhappy', 'panic', 'pain'
}

STRESS_KEYWORDS = {'stress', 'stressed', 'anxious', 'anxiety', 'panic', 'overwhelm', 'pressure'}


def simple_tokenize(text: str):
    return [w for w in re.findall(r"\w+", text.lower())]


def compute_text_features(text: str) -> Dict[str, float]:
    """Return engineered features from `text`.

    Features:
      - word_count
      - negative_ratio: fraction of tokens in NEGATIVE_WORDS
      - stress_keyword_count
      - sentiment_compound: try VADER/TextBlob, fallback 0.0
    """
    text = (text or '')
    tokens = simple_tokenize(text)
    n = len(tokens)

    neg_count = sum(1 for t in tokens if t in NEGATIVE_WORDS)
    stress_count = sum(1 for t in tokens if t in STRESS_KEYWORDS)

    # try VADER
    sentiment_compound = 0.0
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

        analyzer = SentimentIntensityAnalyzer()
        sentiment_compound = float(analyzer.polarity_scores(text).get('compound', 0.0))
    except Exception:
        try:
            from textblob import TextBlob

            sentiment_compound = float(TextBlob(text).sentiment.polarity)
        except Exception:
            sentiment_compound = 0.0

    negative_ratio = float(neg_count / n) if n else 0.0

    return {
        'word_count': float(n),
        'negative_ratio': negative_ratio,
        'stress_keyword_count': float(stress_count),
        'sentiment_compound': float(sentiment_compound),
    }
