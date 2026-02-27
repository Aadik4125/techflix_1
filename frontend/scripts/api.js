// API + analysis helpers
function getApiBase() {
  if (window.NEUROSYNC_API_BASE && String(window.NEUROSYNC_API_BASE).trim()) {
    return String(window.NEUROSYNC_API_BASE).trim().replace(/\/$/, '');
  }
  if (window.location.protocol === 'file:') return 'http://localhost:3000';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return 'http://localhost:3000';
  return window.location.origin;
}

// ── CogniVara Python Backend (FastAPI on port 8000) ──────
function getPythonApiBase() {
  if (window.COGNIVARA_API_BASE && String(window.COGNIVARA_API_BASE).trim()) {
    return String(window.COGNIVARA_API_BASE).trim().replace(/\/$/, '');
  }
  return 'http://localhost:8000';
}

/**
 * Send audio + transcript to the CogniVara Python backend for
 * full cognitive analysis (acoustic/temporal/linguistic + baseline + drift + CSI).
 * Returns null if the Python backend is unavailable (graceful fallback).
 */
async function uploadToCogniVara(audioBlob, transcript, userId) {
  const base = getPythonApiBase();
  try {
    const fd = new FormData();
    fd.append('audio', audioBlob, 'recording.wav');
    fd.append('user_id', String(userId));
    fd.append('transcript', transcript || '');
    const resp = await fetch(base + '/api/upload', { method: 'POST', body: fd });
    if (!resp.ok) {
      console.warn('[CogniVara] Upload failed:', resp.status);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.warn('[CogniVara] Python backend unreachable:', e.message);
    return null;
  }
}

/**
 * Create or update a user in the CogniVara backend.
 * Returns { user_id, status } or null on failure.
 */
async function ensureCogniVaraUser(name, email, age) {
  const base = getPythonApiBase();
  try {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('email', email);
    if (age != null) fd.append('age', String(age));
    const resp = await fetch(base + '/api/user', { method: 'POST', body: fd });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.warn('[CogniVara] Could not sync user:', e.message);
    return null;
  }
}

/**
 * Fetch the full cognitive dashboard data from the Python backend.
 */
async function fetchCognitiveProfile(userId) {
  const base = getPythonApiBase();
  try {
    const resp = await fetch(base + '/api/dashboard/' + userId);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.warn('[CogniVara] Dashboard fetch failed:', e.message);
    return null;
  }
}


async function computeUserAnalysis(transcripts) {
  const withText = transcripts.map((t, i) => ({
    session: t.session || (i + 1),
    text: (t.text && t.text.trim()) ? t.text.trim() : `Demo session ${i + 1}: brief speech sample used for fallback analysis.`
  }));

  const API_BASE = getApiBase();
  const endpoint = API_BASE + '/analyze';
  const perSession = await Promise.all(withText.map(async (t) => {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t.text })
      });
      const jd = await resp.json();
      if (!resp.ok) throw new Error(jd.error || `Session ${t.session} analysis failed`);
      const parsed = jd.parsed || null;
      if (!parsed) throw new Error(`Session ${t.session} returned no parsed analysis`);
      const mode = jd.demo || jd.mode === 'heuristic' ? 'demo' : 'live';
      return { session: t.session, sourceMode: mode, ...parsed, _raw: jd.raw || null };
    } catch (e) {
      return buildClientHeuristic(t.text, t.session, `Session ${t.session}: ${e.message}`);
    }
  }));

  const usedDemo = perSession.some(p => p.sourceMode !== 'live');
  setModePill(usedDemo ? 'demo' : 'live');

  const emoArr = perSession.map(p => Math.max(0, Math.min(100, Math.round(p.emo || 0))));
  const cogArr = perSession.map(p => Math.max(0, Math.min(100, Math.round(p.cog || 0))));
  const hesArr = perSession.map(p => Math.max(0, Math.min(100, Math.round(p.hes || 0))));
  const linArr = perSession.map(p => Math.max(0, Math.min(100, Math.round(p.lin || 0))));
  const riskArr = perSession.map(p => Math.max(0, Math.min(100, Math.round(p.risk || 0))));

  const riskScore = Math.round(riskArr.reduce((a, b) => a + b, 0) / Math.max(riskArr.length, 1));

  let riskLabel, riskClass, riskColor, gradStop1, gradStop2, deltaText, deltaArrow;
  if (riskScore < 45) {
    riskLabel = 'Low Risk'; riskClass = 'low'; riskColor = '#10b981';
    gradStop1 = '#10b981'; gradStop2 = '#34d399';
    deltaText = `Stable trajectory`; deltaArrow = 'down';
  } else if (riskScore < 65) {
    riskLabel = 'Moderate Risk'; riskClass = 'moderate'; riskColor = '#f59e0b';
    gradStop1 = '#f59e0b'; gradStop2 = '#18b09e';
    deltaText = `Monitor closely`; deltaArrow = 'up';
  } else {
    riskLabel = 'High Risk'; riskClass = 'high'; riskColor = '#ef4444';
    gradStop1 = '#f59e0b'; gradStop2 = '#ef4444';
    deltaText = `Elevated concern`; deltaArrow = 'up';
  }

  const emoIdx = Math.round(emoArr.reduce((a, b) => a + b, 0) / emoArr.length || 0);
  const cogIdx = Math.round(cogArr.reduce((a, b) => a + b, 0) / cogArr.length || 0);
  const fluIdx = Math.round(linArr.reduce((a, b) => a + b, 0) / linArr.length || 0);

  return {
    riskScore, riskLabel, riskClass, riskColor, gradStop1, gradStop2,
    deltaText, deltaArrow,
    description: usedDemo
      ? `Your speech biomarkers were analyzed across ${withText.length} sessions using resilient demo fallback logic.`
      : `Your speech biomarkers have been analyzed across ${withText.length} sessions using live AI models.`,
    insight: perSession.map(p => p.insight).join('\n---\n'),
    insightMeta: usedDemo
      ? `Generated today · Demo fallback mode · Not a clinical diagnosis`
      : `Generated today · Live AI mode · Not a clinical diagnosis`,
    indices: { emo: emoIdx, cog: cogIdx, flu: fluIdx },
    indexColors: { emo: riskColor, cog: riskColor, flu: riskColor },
    emo: emoArr, cog: cogArr, hes: hesArr, lin: linArr, risk: riskArr,
    transcripts: withText, sessions: perSession,
    explain: buildExplainability(withText, perSession)
  };
}


function clampMetric(v) {
  return Math.max(0, Math.min(100, Math.round(v || 0)));
}

function lexicalStats(text) {
  const words = String(text || '').toLowerCase().match(/[a-z']+/g) || [];
  const fillers = new Set(['um', 'uh', 'like', 'you', 'know', 'actually', 'basically', 'so']);
  let fillerCount = 0;
  let repeatCount = 0;
  const uniq = new Set();
  for (let i = 0; i < words.length; i++) {
    uniq.add(words[i]);
    if (fillers.has(words[i])) fillerCount++;
    if (i > 0 && words[i] === words[i - 1]) repeatCount++;
  }
  return {
    words: words.length,
    richness: words.length ? uniq.size / words.length : 0,
    fillerRatio: words.length ? fillerCount / words.length : 0,
    repeatRatio: words.length ? repeatCount / words.length : 0
  };
}

function buildClientHeuristic(text, session, reason) {
  const fx = lexicalStats(text);
  const emo = clampMetric(30 + (1 - Math.min(1, fx.richness * 1.25)) * 26 + fx.fillerRatio * 45);
  const cog = clampMetric(28 + fx.richness * 62 - fx.repeatRatio * 35);
  const hes = clampMetric(14 + fx.fillerRatio * 170 + fx.repeatRatio * 90);
  const lin = clampMetric(20 + fx.richness * 70 - fx.fillerRatio * 40 - fx.repeatRatio * 30);
  const risk = clampMetric(emo * 0.34 + hes * 0.28 + (100 - cog) * 0.2 + (100 - lin) * 0.18);
  return {
    session,
    sourceMode: 'demo',
    emo, cog, hes, lin, risk,
    insight: `Session ${session} used resilient local heuristic fallback${reason ? ` (${reason})` : ''}.`
  };
}

function buildExplainability(transcripts, sessions) {
  const text = transcripts.map(t => t.text).join(' ');
  const fx = lexicalStats(text);
  const avgRisk = Math.round(sessions.reduce((a, s) => a + (s.risk || 0), 0) / Math.max(1, sessions.length));
  const demoSessions = sessions.filter(s => s.sourceMode !== 'live').length;
  return [
    `Lexical richness ${(fx.richness * 100).toFixed(1)}% across ${fx.words} words shaped complexity and fluency metrics.`,
    `Filler ratio ${(fx.fillerRatio * 100).toFixed(1)}% and repetition ${(fx.repeatRatio * 100).toFixed(1)}% increased hesitation pressure.`,
    `${demoSessions ? `${demoSessions}/${sessions.length} session(s) used demo fallback.` : 'All sessions used live AI inference.'} Composite risk stabilized at ${avgRisk}/100.`
  ];
}
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  GRAPH RENDERING
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function uploadAudioAndTranscribe(blob) {
  if (!blob) return null;
  const API_BASE = getApiBase();
  const endpoint = API_BASE + '/transcribe';
  try {
    const fd = new FormData();
    fd.append('audio', blob, 'recording.wav');
    const resp = await fetch(endpoint, { method: 'POST', body: fd });
    const jd = await resp.json();
    if (!resp.ok) {
      const msg = jd?.error || jd?.details?.error || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    if (jd.demo || jd.mode === 'heuristic_no_api_key') {
      setModePill('demo');
      showStatus('Demo transcription is active. You can continue the full flow.', 'warn');
    } else {
      setModePill('live');
    }
    // Try common fields
    if (jd.transcription && jd.transcription.trim().length > 0) return jd.transcription;
    if (jd.text) return jd.text;
    if (jd.raw && jd.raw.text) return jd.raw.text;
    if (jd.error) throw new Error(jd.error);
    throw new Error('Whisper returned no transcription text');
  } catch (e) {
    console.error('Transcription upload failed', e);
    setModePill('demo', 'Demo fallback mode');
    showStatus('Live transcription unavailable. Continuing with demo transcript.', 'warn');
    return 'Demo transcription fallback: short local sample used because Whisper was unavailable.';
  }
}

