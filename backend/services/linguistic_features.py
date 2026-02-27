"""
CogniVara — Linguistic Feature Extraction (NLTK-based)
Sentence length, lexical diversity (TTR), word frequency, syntactic complexity.
"""

import nltk
from nltk.corpus import stopwords


# ── Cached Data ──────────────────────────────────────────

_SINGLE_FILLERS = {'um', 'uh', 'like', 'actually', 'basically', 'so', 'well', 'right'}
_STOP_WORDS = None


def _get_stop_words() -> set:
    global _STOP_WORDS
    if _STOP_WORDS is None:
        try:
            _STOP_WORDS = set(stopwords.words('english'))
        except LookupError:
            nltk.download('stopwords', quiet=True)
            _STOP_WORDS = set(stopwords.words('english'))
    return _STOP_WORDS


def _tokenize_sentences(text: str) -> list[str]:
    try:
        return nltk.sent_tokenize(text)
    except LookupError:
        nltk.download('punkt_tab', quiet=True)
        return nltk.sent_tokenize(text)


def _tokenize_words(text: str) -> list[str]:
    try:
        tokens = nltk.word_tokenize(text.lower())
    except LookupError:
        nltk.download('punkt_tab', quiet=True)
        tokens = nltk.word_tokenize(text.lower())
    return [t for t in tokens if t.isalpha()]


def _pos_tag(words: list[str]) -> list[tuple[str, str]]:
    try:
        return nltk.pos_tag(words)
    except LookupError:
        nltk.download('averaged_perceptron_tagger_eng', quiet=True)
        return nltk.pos_tag(words)


# ── Feature Extraction ───────────────────────────────────

_EMPTY = {
    'sentence_length_mean': 0.0, 'lexical_diversity': 0.0,
    'avg_word_length': 0.0, 'filler_ratio': 0.0,
    'content_word_ratio': 0.0, 'syntactic_complexity': 0.0,
    'vocabulary_richness': 0.0, 'word_count': 0, 'sentence_count': 0,
}

_COMPLEX_TAGS = frozenset({'IN', 'WDT', 'WP', 'WP$', 'WRB'})


def extract_linguistic_features(text: str) -> dict:
    """Extract linguistic features from transcript text."""
    if not text or not text.strip():
        return dict(_EMPTY)

    sentences = _tokenize_sentences(text)
    words = _tokenize_words(text)

    if not words:
        return dict(_EMPTY)

    word_count = len(words)
    unique_count = len(set(words))

    # Sentence length
    sentence_word_counts = [len(_tokenize_words(s)) for s in sentences]
    sentence_word_counts = [c for c in sentence_word_counts if c > 0]
    sentence_length_mean = (sum(sentence_word_counts) / len(sentence_word_counts)
                            if sentence_word_counts else 0.0)

    # Lexical diversity (TTR)
    ttr = unique_count / word_count

    # Average word length
    avg_word_length = sum(len(w) for w in words) / word_count

    # Filler ratio (single pass)
    filler_word_count = sum(1 for w in words if w in _SINGLE_FILLERS)
    filler_ratio = filler_word_count / word_count

    # Content word ratio
    stops = _get_stop_words()
    content_count = sum(1 for w in words if w not in stops)
    content_word_ratio = content_count / word_count

    # Syntactic complexity (POS heuristic)
    pos_tags = _pos_tag(words)
    clause_markers = sum(1 for _, tag in pos_tags if tag in _COMPLEX_TAGS)
    syntactic_complexity = clause_markers / max(len(sentences), 1)

    # Vocabulary richness (Brunet's W)
    brunets_w = word_count ** (unique_count ** -0.172) if unique_count > 0 else 0.0

    return {
        'sentence_length_mean': round(sentence_length_mean, 4),
        'lexical_diversity': round(ttr, 4),
        'avg_word_length': round(avg_word_length, 4),
        'filler_ratio': round(filler_ratio, 4),
        'content_word_ratio': round(content_word_ratio, 4),
        'syntactic_complexity': round(syntactic_complexity, 4),
        'vocabulary_richness': round(brunets_w, 4),
        'word_count': word_count,
        'sentence_count': len(sentences),
    }
