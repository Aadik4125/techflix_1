const axios = require('axios');

const HF_ROUTER_BASE = 'https://router.huggingface.co/hf-inference/models';
const WORD_REGEX = /[a-z']+/g;
const SENTENCE_REGEX = /[.!?]+/g;
const FILLER_SET = new Set(['um', 'uh', 'like', 'you', 'know', 'actually', 'basically', 'so']);

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeClassificationOutput(raw) {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length && Array.isArray(raw[0])) return raw[0];
  if (Array.isArray(raw)) return raw;
  if (raw.labels && raw.scores && Array.isArray(raw.labels) && Array.isArray(raw.scores)) {
    return raw.labels.map((label, i) => ({ label, score: Number(raw.scores[i]) || 0 }));
  }
  return [];
}

function toScoreMap(predictions) {
  const map = Object.create(null);
  for (const p of predictions) {
    if (!p || !p.label) continue;
    map[String(p.label).toLowerCase()] = Number(p.score) || 0;
  }
  return map;
}

function extractWords(text) {
  return (text || '').toLowerCase().match(WORD_REGEX) || [];
}

function lexicalFeatures(text) {
  const words = extractWords(text);
  const sentenceCount = Math.max(((text || '').match(SENTENCE_REGEX) || []).length, 1);
  const wordCount = words.length;
  const avgSentenceLen = wordCount / sentenceCount;

  const uniqueWords = new Set();
  let fillerCount = 0;
  let repetitions = 0;

  for (let i = 0; i < wordCount; i++) {
    const w = words[i];
    uniqueWords.add(w);
    if (FILLER_SET.has(w)) fillerCount++;
    if (i > 0 && w === words[i - 1]) repetitions++;
  }

  const unique = uniqueWords.size;
  const lexicalRichness = wordCount ? unique / wordCount : 0;
  const fillerRatio = wordCount ? fillerCount / wordCount : 0;
  const repetitionRatio = wordCount ? repetitions / wordCount : 0;

  return {
    wordCount,
    sentenceCount,
    avgSentenceLen,
    lexicalRichness,
    fillerRatio,
    repetitionRatio
  };
}

function maxByScore(items) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const score = Number(item?.score) || 0;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function buildParsedFromSignals(text, emotionPred = [], sentimentPred = [], modelInfo) {
  const emotion = toScoreMap(emotionPred);
  const sentiment = toScoreMap(sentimentPred);
  const fx = lexicalFeatures(text);

  const emoNegative =
    (emotion.anger || 0) +
    (emotion.fear || 0) +
    (emotion.sadness || 0) +
    (emotion.disgust || 0);
  const emoPositive = (emotion.joy || 0) + (emotion.love || 0);
  const emoNeutral = emotion.neutral || 0;

  const sentNegative = (sentiment.negative || 0) + (sentiment.label_0 || 0);
  const sentNeutral = (sentiment.neutral || 0) + (sentiment.label_1 || 0);
  const sentPositive = (sentiment.positive || 0) + (sentiment.label_2 || 0);

  const stressSignal = emoNegative * 0.65 + sentNegative * 0.35;
  const calmingSignal = emoPositive * 0.7 + sentPositive * 0.3;

  const emo = clamp(Math.round(
    32 +
    stressSignal * 68 -
    calmingSignal * 36 +
    (1 - Math.min(1, fx.lexicalRichness * 1.2)) * 10
  ));
  const cog = clamp(Math.round(
    18 +
    fx.lexicalRichness * 56 +
    Math.min(fx.avgSentenceLen, 24) * 1.45 -
    fx.repetitionRatio * 70 -
    fx.fillerRatio * 45 +
    sentNeutral * 8
  ));
  const hes = clamp(Math.round(
    10 +
    fx.fillerRatio * 220 +
    fx.repetitionRatio * 80 +
    Math.max(0, 13 - fx.avgSentenceLen) * 1.55 +
    stressSignal * 18
  ));
  const lin = clamp(Math.round(
    15 +
    fx.lexicalRichness * 62 +
    Math.min(fx.avgSentenceLen, 22) * 1.35 -
    fx.repetitionRatio * 72 -
    fx.fillerRatio * 35
  ));

  const risk = clamp(Math.round(
    emo * 0.34 +
    hes * 0.28 +
    (100 - cog) * 0.2 +
    (100 - lin) * 0.18
  ));

  const topEmotion = maxByScore(emotionPred);
  const topSentiment = maxByScore(sentimentPred);

  return {
    emo,
    cog,
    hes,
    lin,
    risk,
    description: `HF multi-signal analysis using emotion=${modelInfo.emotion} and sentiment=${modelInfo.sentiment}.`,
    insight: `Top emotion: ${topEmotion?.label || 'unknown'} (${Math.round((topEmotion?.score || 0) * 100)}%), top sentiment: ${topSentiment?.label || 'unknown'} (${Math.round((topSentiment?.score || 0) * 100)}%).`,
    notes: 'hf_multisignal_v3'
  };
}

function isRetryable(err) {
  const status = err?.response?.status;
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('network')
  );
}

async function hfPostJson({ apiKey, model, payload, timeout = 120000, retries = 2 }) {
  const url = `${HF_ROUTER_BASE}/${encodeURIComponent(model)}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.post(url, payload, { headers, timeout });
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) throw err;
      await delay(350 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function transcribeWithHF({ apiKey, model, fileBuffer, contentType }) {
  const url = `${HF_ROUTER_BASE}/${encodeURIComponent(model)}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': contentType || 'audio/webm',
    Accept: 'application/json'
  };

  const resp = await axios.post(url, fileBuffer, {
    headers,
    responseType: 'json',
    timeout: 180000
  });

  const data = resp.data;
  const transcription = typeof data === 'string' ? data : data?.text || null;
  return { raw: data, transcription };
}

async function runModelWithFallback({ apiKey, text, primaryModel, fallbackModel }) {
  const tryModel = async (model) => {
    const resp = await hfPostJson({
      apiKey,
      model,
      payload: { inputs: text },
      timeout: 120000,
      retries: 2
    });
    const pred = normalizeClassificationOutput(resp.data);
    if (!pred.length) throw new Error(`HF response shape invalid for ${model}`);
    return { model, raw: resp.data, pred };
  };

  try {
    return await tryModel(primaryModel);
  } catch (primaryErr) {
    if (!fallbackModel || fallbackModel === primaryModel) throw primaryErr;
    const fallback = await tryModel(fallbackModel);
    return { ...fallback, usedFallback: true };
  }
}

async function analyzeWithHF({ apiKey, text, emotionModel, sentimentModel, emotionFallbackModel, sentimentFallbackModel }) {
  const [emotionSettled, sentimentSettled] = await Promise.allSettled([
    runModelWithFallback({
      apiKey,
      text,
      primaryModel: emotionModel,
      fallbackModel: emotionFallbackModel
    }),
    runModelWithFallback({
      apiKey,
      text,
      primaryModel: sentimentModel,
      fallbackModel: sentimentFallbackModel
    })
  ]);

  if (emotionSettled.status === 'rejected' && sentimentSettled.status === 'rejected') {
    throw new Error('Both emotion and sentiment model calls failed');
  }

  const emotionOk = emotionSettled.status === 'fulfilled';
  const sentimentOk = sentimentSettled.status === 'fulfilled';

  const emotionPred = emotionOk ? emotionSettled.value.pred : [];
  const sentimentPred = sentimentOk ? sentimentSettled.value.pred : [];
  const emotionRaw = emotionOk ? emotionSettled.value.raw : null;
  const sentimentRaw = sentimentOk ? sentimentSettled.value.raw : null;

  const parsed = buildParsedFromSignals(text, emotionPred, sentimentPred, {
    emotion: emotionOk ? emotionSettled.value.model : 'unavailable',
    sentiment: sentimentOk ? sentimentSettled.value.model : 'unavailable'
  });

  if (!emotionOk || !sentimentOk) {
    const missing = !emotionOk ? 'emotion' : 'sentiment';
    parsed.notes = `${parsed.notes};partial=${missing}`;
  }

  return {
    raw: {
      emotion: emotionRaw,
      sentiment: sentimentRaw
    },
    parsed,
    model: {
      emotion: emotionOk ? emotionSettled.value.model : null,
      sentiment: sentimentOk ? sentimentSettled.value.model : null
    }
  };
}

function analyzeHeuristically(text) {
  const parsed = buildParsedFromSignals(text, [], [], {
    emotion: 'local-heuristic',
    sentiment: 'local-heuristic'
  });

  parsed.description = 'Local heuristic analysis (no external AI model call).';
  parsed.insight = 'Generated from lexical signals only because HF_API_KEY is not configured.';
  parsed.notes = 'heuristic_local_no_api_key';

  return {
    raw: {
      emotion: null,
      sentiment: null
    },
    parsed,
    model: {
      emotion: null,
      sentiment: null
    },
    mode: 'heuristic'
  };
}

module.exports = {
  transcribeWithHF,
  analyzeWithHF,
  analyzeHeuristically
};
