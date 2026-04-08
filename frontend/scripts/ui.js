// UI rendering + status helpers
function setModePill(mode, note) {
  runtimeMode = mode;
  const pill = document.getElementById('mode-pill');
  if (!pill) return;
  pill.className = `mode-pill ${mode}`;
  if (mode === 'live') pill.textContent = note || 'Live AI mode';
  else if (mode === 'demo') pill.textContent = note || 'Demo fallback mode';
  else pill.textContent = note || 'Checking mode';
}

function showStatus(message, kind = 'info', sticky = false) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  banner.className = `status-banner show ${kind}`;
  banner.textContent = message;
  if (statusBannerTimer) clearTimeout(statusBannerTimer);
  if (!sticky) {
    statusBannerTimer = setTimeout(() => {
      banner.className = 'status-banner';
      banner.textContent = '';
    }, 4200);
  }
}


function makePath(data, svgW, svgH, color, filled) {
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const w = svgW - pad.l - pad.r;
  const h = svgH - pad.t - pad.b;
  const min = Math.min(...data) * 0.92;
  const max = Math.max(...data) * 1.08;
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad.l + (i / (data.length - 1)) * w;
    const y = pad.t + h - ((v - min) / range) * h;
    return [x, y];
  });
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const cx1 = (pts[i-1][0] + pts[i][0]) / 2;
    d += ` C ${cx1} ${pts[i-1][1]} ${cx1} ${pts[i][1]} ${pts[i][0]} ${pts[i][1]}`;
  }
  let html = '';
  if (filled) {
    const fillPath = d + ` L ${pts[pts.length-1][0]} ${svgH - pad.b} L ${pts[0][0]} ${svgH - pad.b} Z`;
    html += `<path d="${fillPath}" fill="${color}" opacity="0.1"/>`;
  }
  html += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
  data.forEach((v, i) => {
    const [x,y] = pts[i];
    const isLast = i === data.length - 1;
    html += `<circle cx="${x}" cy="${y}" r="${isLast ? 4.5 : 3}" fill="${color}" ${isLast ? `stroke="white" stroke-width="1.5"` : `opacity="0.7"`}/>`;
  });
  const sessionTicks = data.map((_, i) => `S${i + 1}`);
  data.forEach((v, i) => {
    html += `<text x="${pts[i][0]}" y="${svgH - 4}" font-size="9" fill="#8a9ab0" font-family="Manrope" text-anchor="middle">${sessionTicks[i]}</text>`;
  });
  const baseY = pad.t + h - ((data[0] - min) / range) * h;
  html += `<line x1="${pad.l}" y1="${baseY}" x2="${svgW - pad.r}" y2="${baseY}" stroke="#d8e0ea" stroke-width="1" stroke-dasharray="4,3"/>`;
  return html;
}

function renderUserDashboard(analysis) {
  const p = analysis;
  // Gauge
  const scoreEl = document.getElementById('gauge-score-num');
  const circle = document.getElementById('gauge-circle');
  scoreEl.textContent = p.riskScore;
  scoreEl.style.color = p.riskColor;
  document.getElementById('grad-stop-1').setAttribute('stop-color', p.gradStop1);
  document.getElementById('grad-stop-2').setAttribute('stop-color', p.gradStop2);
  setTimeout(() => {
    circle.style.strokeDashoffset = 465 - (p.riskScore / 100) * 465;
  }, 300);

  // Risk badge
  const badge = document.getElementById('risk-badge');
  const dotColor = p.riskClass === 'low' ? '#10b981' : p.riskClass === 'high' ? '#ef4444' : '#f59e0b';
  badge.className = `risk-status-badge ${p.riskClass}`;
  badge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="${dotColor}"><circle cx="12" cy="12" r="10"/></svg><span>${p.riskLabel}</span>`;

  // User badge
  const user = JSON.parse(localStorage.getItem('neurosync_user') || '{}');
  document.getElementById('user-badge-name').textContent = user.name ? user.name.split(' ')[0] + ' · Personal Analysis' : 'You · Personal Analysis';

  document.getElementById('risk-description').textContent = p.description;
  const sourceEl = document.getElementById('analysis-source-label');
  if (sourceEl) sourceEl.textContent = p.analysisSource || 'Unknown';

  const delta = document.getElementById('risk-delta');
  const arrow = p.deltaArrow === 'up' ? '<polyline points="18 15 12 9 6 15"/>' : '<polyline points="18 9 12 15 6 9"/>';
  delta.style.cssText = p.riskClass === 'low' ? 'background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;' : p.riskClass === 'high' ? 'background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;' : 'background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;';
  delta.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${arrow}</svg><span>${p.deltaText}</span>`;

  document.getElementById('insight-text').textContent = p.insight;
  document.getElementById('insight-meta').textContent = p.insightMeta;
  const explain = Array.isArray(p.explain) ? p.explain : [];
  document.getElementById('explain-1').textContent = explain[0] || 'Lexical signal analysis complete.';
  document.getElementById('explain-2').textContent = explain[1] || 'Fluency signal analysis complete.';
  document.getElementById('explain-3').textContent = explain[2] || 'Risk aggregation complete.';

  const {emo, cog, flu} = p.indices;
  ['emo','cog','flu'].forEach(k => {
    document.getElementById(`idx-${k}`).textContent = p.indices[k];
    document.getElementById(`idx-${k}`).style.color = p.indexColors[k];
    document.getElementById(`idx-${k}-bar`).style.width = p.indices[k] + '%';
    document.getElementById(`idx-${k}-bar`).style.background = `linear-gradient(90deg,${p.indexColors[k]},${p.indexColors[k]}88)`;
  });

  // Graphs
  [['g-emo',p.emo,'#ef4444','/100'],['g-cog',p.cog,'#f59e0b','/100'],
   ['g-hes',p.hes,'#8b5cf6','/min'],['g-lin',p.lin,'#18b09e','/100'],
   ['g-risk',p.risk,'#1a6eb5','/100']].forEach(([id,data,color,suf]) => {
    const svg = document.getElementById(id);
    if (svg) svg.innerHTML = makePath(data, 300, 90, color, true);
    const val = document.getElementById(id+'-val');
    if (val) val.textContent = data[data.length-1] + suf;
  });
}

// ══════════════════════════════════════════════
//  COMPARE PAGE RENDER
// ══════════════════════════════════════════════
function selectComparePatient(pid) {
  currentComparePatient = pid;
  ['A','B','C'].forEach(id => {
    const t = document.getElementById(`ctab-${id}`);
    t.className = 'patient-tab';
    if (id === pid) {
      const map = {A:'active-a', B:'active-b', C:'active-c'};
      t.classList.add(map[id]);
    }
  });
  renderComparePage(pid);
}

function renderComparePage(pid) {
  const ref = PATIENTS[pid];
  const user = userAnalysis;
  const u = JSON.parse(localStorage.getItem('neurosync_user') || '{}');
  const userName = u.name ? u.name.split(' ')[0] : 'You';
  const getLast = arr => Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;

  // Delta cards
  const userScore = user ? user.riskScore : 0;
  const refScore = ref.riskScore;
  const delta = userScore - refScore;

  document.getElementById('cd-user-score').textContent = userScore || '—';
  document.getElementById('cd-ref-score').textContent = refScore;
  document.getElementById('cd-ref-name').textContent = ref.name;
  document.getElementById('cd-delta').textContent = (delta > 0 ? '+' : '') + (user ? delta : '—');
  document.getElementById('cd-delta').style.color = delta > 0 ? '#ef4444' : delta < 0 ? '#10b981' : '#f59e0b';
  document.getElementById('cd-delta-note').textContent = !user ? 'Complete a recording first' : delta > 5 ? 'You score higher (worse)' : delta < -5 ? 'You score lower (better)' : 'Similar risk profile';

  // Column headers
  document.getElementById('compare-user-name').textContent = userName;
  document.getElementById('compare-user-score-big').textContent = user ? userScore : '—';
  document.getElementById('compare-user-score-big').style.color = user ? (user.riskColor) : '#8a9ab0';

  const ubadge = document.getElementById('compare-user-badge');
  ubadge.className = `risk-status-badge ${user ? user.riskClass : 'moderate'}`;
  ubadge.textContent = user ? user.riskLabel : 'No data';

  document.getElementById('compare-ref-name').textContent = ref.name;
  document.getElementById('compare-ref-type').textContent = `Reference Profile · ${ref.type}`;
  document.getElementById('compare-ref-score-big').textContent = refScore;
  document.getElementById('compare-ref-score-big').style.color = ref.riskColor;

  const rbadge = document.getElementById('compare-ref-badge');
  rbadge.className = `risk-status-badge ${ref.riskClass}`;
  rbadge.textContent = ref.riskLabel;

  const colHeader = document.getElementById('compare-ref-header');
  colHeader.style.setProperty('--ref-col-color', ref.riskColor);
  colHeader.style.background = '';

  // Metrics
  const metricDefs = [
    { label: 'Emotional Stress', userVal: user ? getLast(user.emo) : null, refVal: getLast(ref.emo), color: '#ef4444', maxVal: 100 },
    { label: 'Cognitive Complexity', userVal: user ? getLast(user.cog) : null, refVal: getLast(ref.cog), color: '#f59e0b', maxVal: 100 },
    { label: 'Speech Hesitation', userVal: user ? getLast(user.hes) : null, refVal: getLast(ref.hes), color: '#8b5cf6', maxVal: 80 },
    { label: 'Linguistic Efficiency', userVal: user ? getLast(user.lin) : null, refVal: getLast(ref.lin), color: '#18b09e', maxVal: 100 },
    { label: 'Risk Accumulation', userVal: user ? getLast(user.risk) : null, refVal: getLast(ref.risk), color: '#1a6eb5', maxVal: 100 },
  ];

  function buildMetricCard(metricDef, isUser) {
    const val = isUser ? metricDef.userVal : metricDef.refVal;
    const pct = val !== null ? Math.round((val / metricDef.maxVal) * 100) : 0;
    return `
      <div class="compare-metric-row">
        <div class="compare-metric-label">${metricDef.label}</div>
        <div class="compare-bars">
          <div class="compare-bar-row">
            <div class="compare-bar-label">${isUser ? userName : ref.name}</div>
            <div class="compare-bar-track">
              <div class="compare-bar-fill" style="width:${val !== null ? pct : 0}%; background:${metricDef.color};"></div>
            </div>
            <div class="compare-bar-val" style="color:${metricDef.color};">${val !== null ? val : '—'}</div>
          </div>
        </div>
      </div>`;
  }

  document.getElementById('compare-user-metrics').innerHTML = metricDefs.map(m => buildMetricCard(m, true)).join('');
  document.getElementById('compare-ref-metrics').innerHTML = metricDefs.map(m => buildMetricCard(m, false)).join('');

  // Transcripts
  if (allTranscripts.length > 0) {
    const txHtml = allTranscripts.map((t,i) =>
      `<div style="margin-bottom:10px;"><strong>Session ${i+1}:</strong> ${t.text || '<em>No speech detected</em>'}</div>`
    ).join('');
    document.getElementById('compare-user-transcript').innerHTML = txHtml;
  } else {
    document.getElementById('compare-user-transcript').innerHTML = '<em>No recordings yet. Complete 3 sessions to see your transcript.</em>';
  }
  document.getElementById('compare-ref-transcript').innerHTML = `<em>${ref.transcriptNote}</em>`;

  // AI insight
  let insightText = '';
  if (!user) {
    insightText = `Comparing against ${ref.name} (${ref.type}): This reference profile scores ${refScore}/100. Complete a recording to see your personal comparison.`;
  } else {
    const diff = Math.abs(delta);
    const direction = delta > 0 ? 'higher' : 'lower';
    if (diff <= 8) {
      insightText = `Your risk profile is closely aligned with ${ref.name} (${ref.type}). Your score of ${userScore} vs their ${refScore} — a difference of only ${diff} points — suggests comparable cognitive biomarker patterns. ${ref.type === 'Stable' ? 'This alignment with the stable reference is a positive indicator.' : ref.type === 'Worsening' ? 'Close alignment with the worsening profile warrants attention.' : 'Your trajectory appears similar to the recovery profile.'}`;
    } else if (delta > 0) {
      insightText = `Your score of ${userScore} is ${diff} points ${direction} than ${ref.name} (${refScore}). ${ref.type === 'Stable' ? 'This elevated score compared to the stable reference may indicate developing cognitive stress markers.' : 'Both profiles show elevated markers, though yours are somewhat more pronounced.'}`;
    } else {
      insightText = `Your score of ${userScore} is ${diff} points ${direction} than ${ref.name} (${refScore}). ${ref.type === 'Stable' ? 'Your profile aligns favorably with the stable reference — strong indicator of healthy cognitive speech patterns.' : 'Despite being lower than this reference, continued monitoring is still recommended.'}`;
    }
  }
  document.getElementById('compare-insight-text').textContent = insightText;
  document.getElementById('compare-insight-meta').textContent = `Comparing you vs ${ref.name} · Not a clinical diagnosis · For investigational use only`;
}

// ══════════════════════════════════════════════
//  RECORDING + LIVE TRANSCRIPT
// ══════════════════════════════════════════════
let isRecording = false, timerInterval = null, currentStep = 1, timeLeft = 30, completedSteps = 0;
let mediaRecorder = null, recordedChunks = [], mediaStream = null;
let recognition = null, sessionTranscript = '';
let liveTranscriptSnapshot = '';
let mediaMimeType = 'audio/webm';
let pendingTranscriptions = {};
let micAccessPromise = null;
let micPermissionDenied = false;
const USE_BROWSER_SPEECH_RECOGNITION = false;


