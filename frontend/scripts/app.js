// ══════════════════════════════════════════════
    //  REFERENCE PATIENT DATA
    // ══════════════════════════════════════════════
    const PATIENTS = {
      A: {
        name: 'Patient A', type: 'Stable', typeColor: '#10b981',
        riskScore: 38, riskLabel: 'Low Risk', riskClass: 'low', riskColor: '#10b981',
        gradStop1: '#10b981', gradStop2: '#34d399',
        deltaText: '3% below baseline — Stable trajectory',
        deltaStyle: 'background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;',
        deltaArrow: 'down',
        description: 'Speech biomarkers within normal variation. No significant deviation from baseline. Cognitive markers stable across all sessions.',
        insight: 'This patient shows consistent stability across all 30 sessions. Emotional tone, hesitation rate, and vocabulary complexity remain within expected baseline variance. No clinical intervention warranted. Continue routine monitoring every 30 days.',
        insightMeta: 'Patient A · Stable profile · Not a clinical diagnosis',
        indices: { emo: 82, cog: 78, flu: 84 },
        indexColors: { emo: '#10b981', cog: '#10b981', flu: '#10b981' },
        emo: [28, 30, 31, 29, 33], cog: [80, 79, 81, 78, 80],
        hes: [12, 14, 13, 15, 14], lin: [76, 77, 75, 78, 76], risk: [35, 37, 36, 38, 38],
        transcriptNote: 'Patient A demonstrates fluent, well-structured speech with minimal hesitations. Vocabulary diversity is high. Sentence completion rate: 98%. Emotional tone: neutral-positive.',
      },
      B: {
        name: 'Patient B', type: 'Worsening', typeColor: '#ef4444',
        riskScore: 74, riskLabel: 'High Risk', riskClass: 'high', riskColor: '#ef4444',
        gradStop1: '#f59e0b', gradStop2: '#ef4444',
        deltaText: '24% above baseline — Deteriorating rapidly',
        deltaStyle: 'background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;',
        deltaArrow: 'up',
        description: 'Significant deterioration detected. Elevated hesitation frequency, vocabulary drop, and emotional volatility all trending upward at an accelerating rate.',
        insight: 'Multiple convergent markers indicate rapid cognitive decline. Hesitation frequency increased 68% from baseline. Emotional stress index rose sharply over two weeks. Linguistic efficiency at clinically concerning level. Immediate clinical referral strongly recommended.',
        insightMeta: 'Patient B · High-risk alert · Not a clinical diagnosis',
        indices: { emo: 31, cog: 29, flu: 26 },
        indexColors: { emo: '#ef4444', cog: '#ef4444', flu: '#ef4444' },
        emo: [38, 46, 55, 63, 74], cog: [68, 60, 52, 44, 35],
        hes: [18, 28, 39, 52, 68], lin: [65, 56, 46, 38, 28], risk: [42, 50, 58, 66, 74],
        transcriptNote: 'Patient B shows increasing word-finding difficulties, frequent mid-sentence pauses (avg 3.2s), rising filler word frequency ("um", "uh" every ~8 words). Sentence completion rate dropped to 71%. Topic coherence declining.',
      },
      C: {
        name: 'Patient C', type: 'Recovery', typeColor: '#1a6eb5',
        riskScore: 44, riskLabel: 'Moderate Risk', riskClass: 'moderate', riskColor: '#f59e0b',
        gradStop1: '#f59e0b', gradStop2: '#18b09e',
        deltaText: '18% improvement from peak — Recovering',
        deltaStyle: 'background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;',
        deltaArrow: 'down',
        description: 'Patient experienced elevated risk following a cognitive stress event. Intervention at Day 14. Measurable recovery trend detected across all five biomarker domains since Day 21.',
        insight: 'Following clinical intervention at Day 14, all major biomarkers show a consistent recovery trajectory. Hesitation rates decreased 34% from peak. Linguistic efficiency and emotional stability trending toward baseline. Continue current treatment protocol and reassess at Day 45.',
        insightMeta: 'Patient C · Recovery trajectory · Not a clinical diagnosis',
        indices: { emo: 61, cog: 58, flu: 55 },
        indexColors: { emo: '#f59e0b', cog: '#f59e0b', flu: '#f59e0b' },
        emo: [44, 60, 72, 58, 46], cog: [72, 58, 44, 55, 64],
        hes: [22, 38, 56, 42, 32], lin: [68, 52, 38, 50, 60], risk: [48, 62, 74, 60, 44],
        transcriptNote: 'Patient C initially showed significant speech disruption post-event. Following intervention, speech fluency improved steadily. Current session shows recovering sentence structure, reduced hesitations, and growing vocabulary breadth.',
      }
    };

    // ══════════════════════════════════════════════
    //  USER ANALYSIS DATA (computed from recordings)
    // ══════════════════════════════════════════════
    let userAnalysis = null;
    let allTranscripts = [];   // array of {session, text}
    let currentRunSessionAnalytics = {}; // keyed by session id, from /api/upload responses
    let currentComparePatient = 'A';
    let backendStatusBase = null;
    let backendStatusBusy = false;
    let backendProbeFailures = 0;
    let backendLastOkAt = 0;

    function getApiBase() {
      if (window.COGNIVARA_API_BASE && String(window.COGNIVARA_API_BASE).trim()) {
        return String(window.COGNIVARA_API_BASE).trim().replace(/\/$/, '');
      }
      if (window.location.protocol === 'file:') return 'http://localhost:8000';
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return 'http://localhost:8000';
      return window.location.origin;
    }

    function getApiCandidates() {
      // Backend badge should represent FastAPI health only.
      return getFastApiCandidates();
    }

    function getFastApiCandidates() {
      const preferred = getApiBase();
      let preferredHost = '';
      try {
        preferredHost = new URL(preferred).hostname;
      } catch (e) {}
      const isLocalPreferred = preferredHost === 'localhost' || preferredHost === '127.0.0.1';
      if (!isLocalPreferred && preferred) {
        return [String(preferred).replace(/\/$/, '')];
      }
      const set = new Set([preferred, 'http://localhost:8000', 'http://127.0.0.1:8000']);
      return Array.from(set).filter(Boolean).map(v => String(v).replace(/\/$/, ''));
    }

    function getStoredUser() {
      return JSON.parse(localStorage.getItem('cognivara_user') || '{}');
    }

    function getCurrentUserId() {
      const u = getStoredUser();
      const parsed = Number(u.userId);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    function getStoredAccessToken() {
      const u = getStoredUser();
      return String(u.accessToken || '').trim();
    }

    function buildAuthHeaders(extra = {}) {
      const token = getStoredAccessToken();
      return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
    }

    function backendHostLabel(base) {
      try {
        return new URL(base).host;
      } catch (e) {
        return base || 'unknown';
      }
    }

    function setBackendStatus(state, text, title) {
      const badge = document.getElementById('backend-status');
      const label = document.getElementById('backend-status-text');
      if (!badge || !label) return;
      badge.classList.remove('online', 'offline', 'checking');
      badge.classList.add(state);
      const defaultText = state === 'online'
        ? 'Backend: online'
        : state === 'offline'
          ? 'Backend: offline'
          : 'Backend: checking';
      label.textContent = defaultText;
      badge.title = title || defaultText;
    }

    async function probeBackend(base) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const resp = await fetch(`${base}/api/health`, { method: 'GET', signal: ctrl.signal });
        clearTimeout(t);
        return resp.ok;
      } catch (e) {
        return false;
      }
    }

    async function refreshBackendStatus(force = false) {
      if (backendStatusBusy && !force) return false;
      // Avoid false "offline" while long-running upload/analysis requests are active.
      const hasActiveWork = (
        (typeof isRecording !== 'undefined' && isRecording) ||
        (typeof pendingTranscriptions !== 'undefined' && Object.keys(pendingTranscriptions).length > 0)
      );
      if (!force && hasActiveWork) {
        if (backendStatusBase) {
          setBackendStatus(
            'online',
            `Backend: online (${backendHostLabel(backendStatusBase)})`,
            'Backend busy processing session data'
          );
          return true;
        }
        return false;
      }
      backendStatusBusy = true;
      // Avoid badge flicker during periodic background probes.
      if (force || !backendStatusBase) {
        setBackendStatus('checking', 'Backend: checking', 'Checking backend connectivity');
      }
      try {
        const candidates = [];
        if (backendStatusBase) candidates.push(backendStatusBase);
        for (const base of getApiCandidates()) {
          if (!candidates.includes(base)) candidates.push(base);
        }

        for (const base of candidates) {
          const ok = await probeBackend(base);
          if (ok) {
            backendProbeFailures = 0;
            backendLastOkAt = Date.now();
            backendStatusBase = base;
            setBackendStatus('online', `Backend: online (${backendHostLabel(base)})`, `Connected to ${base}`);
            return true;
          }
        }
        backendProbeFailures += 1;
        const recentOk = backendLastOkAt > 0 && (Date.now() - backendLastOkAt) < (10 * 60 * 1000);
        if (backendProbeFailures >= 8 || (force && !recentOk)) {
          setBackendStatus('offline', 'Backend: offline', 'FastAPI backend is not reachable');
        } else if (backendStatusBase || recentOk) {
          setBackendStatus(
            'online',
            `Backend: online (${backendHostLabel(backendStatusBase || 'known')})`,
            'Backend is slow/busy. Retrying health checks.'
          );
        } else {
          setBackendStatus('checking', 'Backend: checking', 'Backend response delayed; retrying');
        }
        return false;
      } finally {
        backendStatusBusy = false;
      }
    }

    function clampScore(v) {
      const n = Math.round(Number(v) || 0);
      return Math.max(0, Math.min(100, n));
    }

    function soberizeScore(v, pull = 0.35) {
      const clampedPull = Math.max(0, Math.min(0.8, Number(pull) || 0));
      const base = clampScore(v);
      return clampScore(Math.round(50 + (base - 50) * (1 - clampedPull)));
    }

    function localHeuristicAnalysis(text) {
      const words = (text || '').toLowerCase().match(/[a-z']+/g) || [];
      const sentences = (text || '').split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
      const wordCount = words.length;
      const sentenceCount = Math.max(1, sentences.length);
      const avgSentenceLen = wordCount / sentenceCount;
      const unique = new Set(words).size;
      const lexicalRichness = wordCount ? unique / wordCount : 0;
      const fillerSet = new Set(['um', 'uh', 'like', 'you', 'know', 'actually', 'basically', 'so']);
      const fillerCount = words.filter(w => fillerSet.has(w)).length;
      const fillerRatio = wordCount ? fillerCount / wordCount : 0;
      const repetitions = words.slice(1).reduce((n, w, i) => n + (w === words[i] ? 1 : 0), 0);
      const repetitionRatio = wordCount ? repetitions / wordCount : 0;

      // Very short transcripts are low-confidence for linguistic risk estimation.
      // Keep them near neutral to avoid inflated scores from sparse text.
      if (wordCount < 8) {
        const neutralRisk = clampScore(48 + fillerRatio * 12 + repetitionRatio * 8);
        return {
          emo: 50,
          cog: 52,
          hes: 48,
          lin: 52,
          risk: neutralRisk,
          confidence: 0.15,
          insight: `Low-confidence transcript (${wordCount} words): using neutralized linguistic estimate.`
        };
      }

      const cog = clampScore(
        18 +
        lexicalRichness * 56 +
        Math.min(avgSentenceLen, 24) * 1.45 -
        repetitionRatio * 70 -
        fillerRatio * 45
      );
      const hes = clampScore(
        10 +
        fillerRatio * 220 +
        repetitionRatio * 80 +
        Math.max(0, 13 - avgSentenceLen) * 1.55
      );
      const lin = clampScore(
        15 +
        lexicalRichness * 62 +
        Math.min(avgSentenceLen, 22) * 1.35 -
        repetitionRatio * 72 -
        fillerRatio * 35
      );
      const emo = clampScore(35 + fillerRatio * 45 + repetitionRatio * 28 + Math.max(0, 10 - avgSentenceLen) * 1.5);
      const rawRisk = clampScore(
        emo * 0.34 +
        hes * 0.28 +
        (100 - cog) * 0.2 +
        (100 - lin) * 0.18
      );
      // Confidence grows with transcript length; low-confidence sessions stay closer to neutral.
      const confidence = Math.max(0.25, Math.min(1, wordCount / 60));
      const risk = clampScore(Math.round(50 + (rawRisk - 50) * (0.70 * confidence)));

      return {
        emo, cog, hes, lin, risk,
        confidence,
        insight: `Local fallback analysis: lexical_richness=${lexicalRichness.toFixed(2)}, filler_ratio=${fillerRatio.toFixed(2)}.`
      };
    }

    function buildAnalysisFromParsedSessions(perSession, transcripts, sourceLabel) {
      const emoArr = perSession.map(p => clampScore(p.emo));
      const cogArr = perSession.map(p => clampScore(p.cog));
      const csiArr = perSession.map(p => clampScore(p.csi ?? p.cog));
      const hesArr = perSession.map(p => clampScore(p.hes));
      const linArr = perSession.map(p => clampScore(p.lin));
      const riskArr = perSession.map(p => clampScore(p.risk));

      const riskMean = riskArr.reduce((a, b) => a + b, 0) / Math.max(riskArr.length, 1);
      const sortedRisk = [...riskArr].sort((a, b) => a - b);
      const mid = Math.floor(sortedRisk.length / 2);
      const riskMedian = sortedRisk.length % 2
        ? sortedRisk[mid]
        : Math.round((sortedRisk[mid - 1] + sortedRisk[mid]) / 2);
      const spread = (sortedRisk[sortedRisk.length - 1] ?? 50) - (sortedRisk[0] ?? 50);
      let riskScore = Math.round(riskMedian * 0.60 + riskMean * 0.40);
      // Damp high volatility across sessions to keep scoring fair and stable.
      const neutralPull = Math.max(0, Math.min(0.48, (spread - 10) / 70));
      riskScore = clampScore(Math.round(riskScore * (1 - neutralPull) + 50 * neutralPull));
      riskScore = soberizeScore(riskScore, 0.22);

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

      const emoIdx = Math.round(emoArr.reduce((a, b) => a + b, 0) / Math.max(emoArr.length, 1));
      const csiScore = Math.round(csiArr.reduce((a, b) => a + b, 0) / Math.max(csiArr.length, 1));
      const cogIdx = csiScore;
      const fluIdx = Math.round(linArr.reduce((a, b) => a + b, 0) / Math.max(linArr.length, 1));

      return {
        riskScore, riskLabel, riskClass, riskColor, gradStop1, gradStop2,
        deltaText, deltaArrow,
        description: `Your speech biomarkers have been analyzed across ${transcripts.length} sessions (${sourceLabel}).`,
        analysisSource: sourceLabel,
        insight: perSession.map(p => p.insight || '').filter(Boolean).join('\n---\n') || 'Analysis complete.',
        insightMeta: `Generated today · ${sourceLabel} · Not a clinical diagnosis`,
        csiScore,
        indices: { emo: emoIdx, cog: cogIdx, flu: fluIdx },
        indexColors: { emo: riskColor, cog: riskColor, flu: riskColor },
        emo: emoArr, csi: csiArr, cog: cogArr, hes: hesArr, lin: linArr, risk: riskArr,
        transcripts, sessions: perSession
      };
    }

    async function computeUserAnalysis(transcripts) {
      function isInvalidTranscript(t) {
        if (!t || !t.text || !t.text.trim()) return true;
        const sessionId = Number(t.session);
        const hasBackendUpload = Number.isFinite(sessionId) && sessionId > 0 && !!currentRunSessionAnalytics[sessionId];
        // If backend upload succeeded for this session, it should not be treated as skipped
        // even when transcript text is still pending/unavailable.
        if (hasBackendUpload) return false;
        const lower = t.text.toLowerCase();
        return (
          lower.includes('no speech recognized') ||
          lower.includes('waiting for whisper') ||
          lower.includes('transcript unavailable')
        );
      }

      const invalid = transcripts.filter(isInvalidTranscript);
      const skippedSessions = invalid.map(t => t.session);
      if (skippedSessions.length) showTranscriptWarning(skippedSessions);
      const validTranscripts = transcripts.filter(t => !isInvalidTranscript(t));
      const analysisTranscripts = validTranscripts.length
        ? validTranscripts
        : transcripts.map((t, i) => ({
          session: t.session || (i + 1),
          text: `Session ${t.session || (i + 1)} speech sample recorded. Transcript unavailable; using audio-derived backend markers.`
        }));

      // Prefer current-run upload results over global dashboard history.
      const runSessionIds = analysisTranscripts.map(t => Number(t.session)).filter(n => Number.isFinite(n) && n > 0);
      const runUploads = runSessionIds
        .map(id => ({ id, data: currentRunSessionAnalytics[id] }))
        .filter(x => !!x.data);
      if (runUploads.length > 0) {
        const byId = new Map(runUploads.map(x => [x.id, x.data]));
        let prevRisk = null;
        const perSession = runSessionIds.map((id) => {
          const data = byId.get(id);
          if (!data) {
            const local = localHeuristicAnalysis(
              analysisTranscripts.find(t => Number(t.session) === id)?.text || ''
            );
            const risk = soberizeScore(local.risk, 0.28);
            return {
              session: id,
              emo: local.emo,
              cog: local.cog,
              hes: local.hes,
              lin: local.lin,
              csi: clampScore(100 - risk),
              risk,
              insight: `Session ${id}: partial upload fallback (local estimate).`
            };
          }
          const csiRaw = clampScore(data?.csi?.csi_score ?? data?.user_latest_csi_score ?? 50);
          const driftRaw = Number(data?.drift?.overall_drift_score ?? 0);
          const driftNorm = clampScore(Math.round((Math.max(0, Math.min(3.5, driftRaw)) / 3.5) * 100));

          // Backend-driven risk: primarily inverse CSI, with drift as secondary signal.
          let risk = clampScore(Math.round((100 - csiRaw) * 0.86 + driftNorm * 0.14));
          risk = soberizeScore(risk, 0.32);

          // Prevent abrupt visual jumps between consecutive sessions.
          if (prevRisk !== null) {
            const delta = risk - prevRisk;
            const bounded = Math.max(-8, Math.min(8, delta));
            risk = clampScore(prevRisk + bounded);
          }
          prevRisk = risk;

          const cog = clampScore(Math.round(csiRaw * 0.9 + 5));
          const lin = clampScore(Math.round(csiRaw * 0.85 + 8));
          const hes = clampScore(Math.round(risk * 0.8 + driftNorm * 0.2));
          const emo = clampScore(Math.round(risk * 0.75 + driftNorm * 0.25));
          return {
            session: id,
            emo,
            cog,
            hes,
            lin,
            csi: csiRaw,
            risk,
            insight: `Session ${id}: backend-driven CSI and drift analysis.`
          };
        });
        setBackendStatus('online', 'Backend: online (current run)', 'Using current-run session analytics');
        return buildAnalysisFromParsedSessions(
          perSession,
          analysisTranscripts,
          runUploads.length === runSessionIds.length
            ? 'Current-run backend analysis'
            : 'Current-run mixed analysis'
        );
      }

      const userId = getCurrentUserId();
      let dashboardErr = null;
      if (!userId) {
        setBackendStatus('offline', 'Backend: offline', 'User must be created in backend before analysis.');
        throw new Error('Missing backend user id. Please sign up again.');
      }

      for (const base of getFastApiCandidates()) {
        try {
          const endpoint = `${base}/api/dashboard/${userId}`;
          const resp = await fetch(endpoint, { method: 'GET', headers: buildAuthHeaders() });
          const jd = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(jd.detail || jd.error || `Dashboard failed (${resp.status})`);
          const expectedSessions = analysisTranscripts.length;
          const dashboardSessions = Number(jd.session_count || 0);
          if (dashboardSessions > 0 && dashboardSessions < expectedSessions) {
            throw new Error(`Backend has only ${dashboardSessions}/${expectedSessions} sessions from this run.`);
          }

          const csi = Array.isArray(jd?.trends?.csi) ? jd.trends.csi.map(clampScore) : [];
          const fallbackCsi = clampScore(jd?.latest_csi ?? 50);
          const csiArrRaw = csi.length ? csi : [fallbackCsi];
          const csiArr = csiArrRaw.slice(-Math.max(1, expectedSessions));
          const riskArr = csiArr.map(v => soberizeScore(100 - v, 0.30));
          const emoArr = csiArr.map(v => clampScore(v * 0.9 + 5));
          const cogArr = csiArr.slice();
          const hesArr = csiArr.map(v => clampScore(v * 0.75));
          const linArr = csiArr.map(v => clampScore(100 - v * 0.6));

          const riskScore = riskArr[riskArr.length - 1] ?? 50;
          let riskLabel = 'Low Risk', riskClass = 'low', riskColor = '#10b981', gradStop1 = '#10b981', gradStop2 = '#06b6d4', deltaText = 'Healthy range', deltaArrow = 'down';
          if (riskScore >= 35 && riskScore < 65) {
            riskLabel = 'Moderate Risk'; riskClass = 'moderate'; riskColor = '#f59e0b';
            gradStop1 = '#f59e0b'; gradStop2 = '#ef4444'; deltaText = 'Monitor closely'; deltaArrow = 'up';
          } else if (riskScore >= 65) {
            riskLabel = 'High Risk'; riskClass = 'high'; riskColor = '#ef4444';
            gradStop1 = '#f59e0b'; gradStop2 = '#ef4444'; deltaText = 'Elevated concern'; deltaArrow = 'up';
          }

          const out = {
            riskScore,
            riskLabel,
            riskClass,
            riskColor,
            gradStop1,
            gradStop2,
            deltaText,
            deltaArrow,
            description: `Your speech biomarkers were analyzed across ${jd.session_count || analysisTranscripts.length} sessions (FastAPI dashboard).`,
            analysisSource: 'FastAPI dashboard history',
            insight: `Baseline ready: ${jd.baseline_ready ? 'yes' : 'no'}. Flagged features: ${(jd.flagged_features || []).join(', ') || 'none'}.`,
            insightMeta: 'Generated today · FastAPI dashboard · Not a clinical diagnosis',
            csiScore: csiArr[csiArr.length - 1] ?? fallbackCsi,
            indices: {
              emo: emoArr[emoArr.length - 1] ?? 50,
              cog: cogArr[cogArr.length - 1] ?? 50,
              flu: linArr[linArr.length - 1] ?? 50
            },
            indexColors: { emo: riskColor, cog: riskColor, flu: riskColor },
            emo: emoArr,
            csi: csiArr,
            cog: cogArr,
            hes: hesArr,
            lin: linArr,
            risk: riskArr,
            transcripts,
            sessions: []
          };

          backendStatusBase = base;
          setBackendStatus('online', `Backend: online (${backendHostLabel(base)})`, `Using FastAPI dashboard on ${base}`);
          return out;
        } catch (e) {
          dashboardErr = e;
        }
      }

      // Last-resort local analysis so dashboard still works offline.
      const localPerSession = analysisTranscripts.map(t => ({ session: t.session, ...localHeuristicAnalysis(t.text) }));
      if (localPerSession.length) {
        setBackendStatus('checking', 'Backend: local fallback', 'Using in-browser fallback analysis');
        return buildAnalysisFromParsedSessions(localPerSession, transcripts, 'Local fallback analysis');
      }

      setBackendStatus('offline', 'Backend: offline', 'Analysis endpoints are unreachable');
      const dmsg = dashboardErr && dashboardErr.message ? dashboardErr.message : '';
      throw new Error(dmsg || 'Backend unreachable. Start FastAPI on http://localhost:8000.');
    }

    // Helper: display a warning banner for skipped sessions
    function showTranscriptWarning(sessions) {
      const msg = 'Session' + (sessions.length > 1 ? 's ' : ' ') + sessions.join(', ') + ' had no transcript and ' + (sessions.length > 1 ? 'were' : 'was') + ' skipped.';
      let banner = document.getElementById('transcript-warning-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'transcript-warning-banner';
        banner.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:999;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);backdrop-filter:blur(12px);padding:12px 24px;border-radius:12px;font-size:14px;font-weight:500;font-family:Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.3);animation:fadeUp 0.5s ease both;max-width:90%;text-align:center;';
        document.body.appendChild(banner);
        setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 8000);
      }
      banner.textContent = '\u26A0\uFE0F ' + msg;
    }

    // ══════════════════════════════════════════════
    //  GRAPH RENDERING
    // ══════════════════════════════════════════════
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
        const cx1 = (pts[i - 1][0] + pts[i][0]) / 2;
        d += ` C ${cx1} ${pts[i - 1][1]} ${cx1} ${pts[i][1]} ${pts[i][0]} ${pts[i][1]}`;
      }
      let html = '';
      if (filled) {
        const fillPath = d + ` L ${pts[pts.length - 1][0]} ${svgH - pad.b} L ${pts[0][0]} ${svgH - pad.b} Z`;
        html += `<path d="${fillPath}" fill="${color}" opacity="0.1"/>`;
      }
      html += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
      data.forEach((v, i) => {
        const [x, y] = pts[i];
        const isLast = i === data.length - 1;
        html += `<circle cx="${x}" cy="${y}" r="${isLast ? 4.5 : 3}" fill="${color}" ${isLast ? `stroke="white" stroke-width="1.5"` : `opacity="0.7"`}/>`;
      });
      const sessionTicks = data.map((_, i) => `S${i + 1}`);
      data.forEach((v, i) => {
        html += `<text x="${pts[i][0]}" y="${svgH - 4}" font-size="9" fill="#8a9ab0" font-family="Inter" text-anchor="middle">${sessionTicks[i]}</text>`;
      });
      const baseY = pad.t + h - ((data[0] - min) / range) * h;
      html += `<line x1="${pad.l}" y1="${baseY}" x2="${svgW - pad.r}" y2="${baseY}" stroke="#d8e0ea" stroke-width="1" stroke-dasharray="4,3"/>`;
      return html;
    }

    function scoreToneColor(value, higherIsBetter = true, maxVal = 100) {
      const raw = Number(value) || 0;
      const normalized = Math.max(0, Math.min(100, (raw / Math.max(1, maxVal)) * 100));
      const quality = higherIsBetter ? normalized : (100 - normalized);
      if (quality >= 70) return '#10b981'; // good
      if (quality >= 45) return '#f59e0b'; // risky
      return '#ef4444'; // bad
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
      const user = JSON.parse(localStorage.getItem('cognivara_user') || '{}');
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
      document.getElementById('risk-csi-score').textContent = p.csiScore ?? p.indices?.cog ?? '—';

      const { emo, cog, flu } = p.indices;
      ['emo', 'cog', 'flu'].forEach(k => {
        document.getElementById(`idx-${k}`).textContent = p.indices[k];
        document.getElementById(`idx-${k}`).style.color = p.indexColors[k];
        document.getElementById(`idx-${k}-bar`).style.width = p.indices[k] + '%';
        document.getElementById(`idx-${k}-bar`).style.background = `linear-gradient(90deg,${p.indexColors[k]},${p.indexColors[k]}88)`;
      });

      // Graphs (dynamic severity coloring: good=green, risky=yellow, bad=red)
      [
        { id: 'emo', data: p.emo, suffix: '/100', higherIsBetter: false, max: 100 },
        { id: 'cog', data: p.cog, suffix: '/100', higherIsBetter: true, max: 100 },
        { id: 'hes', data: p.hes, suffix: '/min', higherIsBetter: false, max: 80 },
        { id: 'lin', data: p.lin, suffix: '/100', higherIsBetter: true, max: 100 },
        { id: 'risk', data: p.risk, suffix: '/100', higherIsBetter: false, max: 100 }
      ].forEach(m => {
        const current = Array.isArray(m.data) && m.data.length ? m.data[m.data.length - 1] : 0;
        const tone = scoreToneColor(current, m.higherIsBetter, m.max);
        const svg = document.getElementById(`g-${m.id}`);
        if (svg) svg.innerHTML = makePath(m.data, 300, 90, tone, true);

        const val = document.getElementById(`g-${m.id}-val`);
        if (val) {
          val.textContent = current + m.suffix;
          val.style.color = tone;
        }

        const label = document.getElementById(`g-${m.id}-label`);
        if (label) label.style.color = tone;

        const card = document.getElementById(`graph-card-${m.id}`);
        if (card) {
          card.style.setProperty('--graph-accent', tone);
          card.style.setProperty('--graph-accent-soft', `${tone}99`);
        }
      });
    }

    // ══════════════════════════════════════════════
    //  COMPARE PAGE RENDER
    // ══════════════════════════════════════════════
    function selectComparePatient(pid) {
      currentComparePatient = pid;
      ['A', 'B', 'C'].forEach(id => {
        const t = document.getElementById(`ctab-${id}`);
        t.className = 'patient-tab';
        if (id === pid) {
          const map = { A: 'active-a', B: 'active-b', C: 'active-c' };
          t.classList.add(map[id]);
        }
      });
      renderComparePage(pid);
    }

    function renderComparePage(pid) {
      const ref = PATIENTS[pid];
      const user = userAnalysis;
      const u = JSON.parse(localStorage.getItem('cognivara_user') || '{}');
      const userName = u.name ? u.name.split(' ')[0] : 'You';
      const getLast = arr => Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;

      // Delta cards
      const userScore = user ? user.riskScore : 0;
      const refScore = ref.riskScore;
      const delta = userScore - refScore;
      const userCsi = user ? (user.csiScore ?? user.indices?.cog ?? getLast(user.csi) ?? getLast(user.cog)) : null;
      const refCsi = ref.csiScore ?? ref.indices?.cog ?? getLast(ref.cog);
      const csiDelta = userCsi !== null ? (userCsi - refCsi) : null;

      document.getElementById('cd-user-score').textContent = user ? userScore : '—';
      document.getElementById('cd-ref-score').textContent = refScore;
      document.getElementById('cd-ref-name').textContent = ref.name;
      document.getElementById('cd-delta').textContent = (delta > 0 ? '+' : '') + (user ? delta : '—');
      document.getElementById('cd-delta').style.color = delta > 0 ? '#ef4444' : delta < 0 ? '#10b981' : '#f59e0b';
      document.getElementById('cd-delta-note').textContent = !user ? 'Complete a recording first' : delta > 5 ? 'You score higher (worse)' : delta < -5 ? 'You score lower (better)' : 'Similar risk profile';
      document.getElementById('cd-user-csi').textContent = userCsi !== null ? userCsi : '—';
      document.getElementById('cd-ref-csi').textContent = refCsi;
      document.getElementById('cd-ref-csi-name').textContent = ref.name;
      document.getElementById('cd-csi-delta').textContent = csiDelta === null ? '—' : ((csiDelta > 0 ? '+' : '') + csiDelta);
      document.getElementById('cd-csi-delta').style.color = csiDelta === null ? '#8a9ab0' : csiDelta > 0 ? '#10b981' : csiDelta < 0 ? '#ef4444' : '#f59e0b';
      document.getElementById('cd-csi-delta-note').textContent = csiDelta === null ? 'Complete a recording first' : csiDelta > 5 ? 'Higher complexity than reference' : csiDelta < -5 ? 'Lower complexity than reference' : 'Similar complexity profile';

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
        const txHtml = allTranscripts.map((t, i) =>
          `<div style="margin-bottom:10px;"><strong>Session ${i + 1}:</strong> ${t.text || '<em>No speech detected</em>'}</div>`
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
    let recordingStartedAt = 0;
    const USE_BROWSER_SPEECH_RECOGNITION = true;
    const RECORDING_QUESTIONS = [
      'How was your day?',
      'What was the last thing you did that got you in trouble?',
      'What are your thoughts on your fav music artist?'
    ];

    function getRecordingQuestion(step) {
      const idx = Number(step) - 1;
      return RECORDING_QUESTIONS[idx] || RECORDING_QUESTIONS[RECORDING_QUESTIONS.length - 1];
    }

    function countWords(text) {
      return (String(text || '').match(/[a-z0-9']+/gi) || []).length;
    }

    function formatRecordedDuration(seconds) {
      const safe = Math.max(0.1, Number(seconds) || 0);
      return `${safe.toFixed(1)} sec recorded`;
    }

    function releaseMicrophone() {
      try {
        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
      } catch (e) { }
      mediaStream = null;
    }

    async function ensureMicrophoneAccess() {
      if (mediaStream && mediaStream.getTracks().some(t => t.readyState === 'live')) {
        return mediaStream;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('This browser does not support microphone access');
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return mediaStream;
    }

    function initSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return false;
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            sessionTranscript += t + ' ';
          } else {
            interim = t;
          }
        }
        liveTranscriptSnapshot = (sessionTranscript + interim).trim();
        updateTranscriptUI(liveTranscriptSnapshot);
      };
      recognition.onerror = (e) => {
        // Keep real capture only; do not inject demo transcript.
        if (e.error !== 'aborted') {
          console.warn('SpeechRecognition error:', e.error);
        }
      };
      recognition.onend = () => {
        // Keep recognition alive through the full recording interval.
        if (isRecording) {
          setTimeout(() => {
            if (!isRecording) return;
            try { recognition.start(); } catch (err) { }
          }, 120);
        }
      };
      return true;
    }

    function updateTranscriptUI(text) {
      const el = document.getElementById('transcript-text');
      el.innerHTML = `<span class="has-text">${text}</span><span class="transcript-cursor"></span>`;
    }

    function isCurrentSessionCard(sessionId) {
      const badge = document.getElementById('stc-session-badge');
      return !!badge && badge.textContent === `Session ${sessionId}`;
    }

    function updateSessionCardIfCurrent(sessionId, text) {
      if (!isCurrentSessionCard(sessionId)) return;
      document.getElementById('stc-text').textContent = text;
      if (/transcript pending/i.test(String(text || ''))) {
        document.getElementById('stc-words').textContent = 'Counting words...';
        return;
      }
      if (/transcript unavailable|no speech recognized/i.test(String(text || ''))) {
        document.getElementById('stc-words').textContent = 'Word count unavailable';
        return;
      }
      document.getElementById('stc-words').textContent = `${countWords(text)} words`;
    }

    function renderAllTranscripts() {
      const wrap = document.getElementById('all-transcripts');
      const atc = document.getElementById('all-transcripts-content');
      if (!wrap || !atc) return;
      if (!allTranscripts.length) {
        wrap.style.display = 'none';
        atc.innerHTML = '';
        return;
      }
      atc.innerHTML = allTranscripts.map(t =>
        `<div class="transcript-session-header">Session ${t.session}</div><div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">${t.text}</div>`
      ).join('');
      wrap.style.display = 'block';
    }

    async function uploadSessionForFeatureExtraction(blob, sessionId, transcriptText, fileName = null) {
      if (!blob) return null;
      const userId = getCurrentUserId();
      if (!userId) throw new Error('Missing backend user id. Please sign up first.');

      let lastErr = null;
      for (const base of getFastApiCandidates()) {
        try {
          const endpoint = `${base}/api/upload`;
          const fd = new FormData();
          fd.append('audio', blob, fileName || `session-${sessionId}.wav`);
          fd.append('user_id', String(userId));
          fd.append('transcript', transcriptText || '');

          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 8000);
          const resp = await fetch(endpoint, { method: 'POST', body: fd, signal: ctrl.signal, headers: buildAuthHeaders() });
          clearTimeout(timeout);
          const jd = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(jd.detail || jd.error || `HTTP ${resp.status}`);
          backendStatusBase = base;
          setBackendStatus('online', `Backend: online (${backendHostLabel(base)})`, `Uploaded session ${sessionId} to FastAPI`);
          return jd;
        } catch (e) {
          lastErr = e;
        }
      }

      console.warn('Session upload to FastAPI /api/upload failed:', lastErr);
      // Keep current status; periodic health checks will reconcile connectivity.
      return { skipped: true, error: (lastErr && lastErr.message) || 'Upload failed' };
    }

    async function waitForPendingSessionUploads(maxMs = 5000) {
      const jobs = Object.values(pendingTranscriptions);
      if (!jobs.length) return;
      await Promise.race([
        Promise.allSettled(jobs),
        new Promise(resolve => setTimeout(resolve, maxMs))
      ]);
    }

    async function transcribeSessionAudio(blob) {
      if (!blob) return null;
      const candidates = [];
      if (window.location.origin && /^https?:\/\//.test(window.location.origin)) {
        candidates.push(window.location.origin.replace(/\/$/, ''));
      }
      candidates.push('http://localhost:3000', 'http://127.0.0.1:3000');

      for (const base of candidates) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const fd = new FormData();
            fd.append('audio', blob, 'recording.wav');
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 15000);
            const resp = await fetch(`${base}/transcribe`, { method: 'POST', body: fd, signal: ctrl.signal });
            clearTimeout(timeout);
            const jd = await resp.json().catch(() => ({}));
            if (!resp.ok) continue;
            // Ignore demo/fallback transcriptions; only accept real model output.
            if (jd.demo || jd.mode === 'heuristic_no_api_key') {
              await new Promise(r => setTimeout(r, 450 * (attempt + 1)));
              continue;
            }
            const text = (jd.transcription || jd.text || jd?.raw?.text || '').trim();
            if (text) return text;
          } catch (e) {
            // Retry on transient failures, then move to next candidate.
            await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
          }
        }
      }
      return null;
    }

    function encodePcm16Wav(samples, sampleRate) {
      const buffer = new ArrayBuffer(44 + samples.length * 2);
      const view = new DataView(buffer);
      const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };

      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + samples.length * 2, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true); // PCM chunk size
      view.setUint16(20, 1, true); // PCM format
      view.setUint16(22, 1, true); // mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true); // byte rate
      view.setUint16(32, 2, true); // block align
      view.setUint16(34, 16, true); // bits per sample
      writeStr(36, 'data');
      view.setUint32(40, samples.length * 2, true);

      let offset = 44;
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
      return new Blob([view], { type: 'audio/wav' });
    }

    function downsampleFloat32(input, inputRate, outputRate) {
      if (outputRate >= inputRate) return input;
      const ratio = inputRate / outputRate;
      const outLength = Math.round(input.length / ratio);
      const output = new Float32Array(outLength);
      let pos = 0;
      for (let i = 0; i < outLength; i++) {
        const nextPos = Math.round((i + 1) * ratio);
        let sum = 0;
        let count = 0;
        while (pos < nextPos && pos < input.length) {
          sum += input[pos++];
          count++;
        }
        output[i] = count > 0 ? (sum / count) : 0;
      }
      return output;
    }

    async function convertRecordedBlobToWav(blob) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('AudioContext not available');
      const ac = new AC();
      try {
        const arr = await blob.arrayBuffer();
        const audioBuffer = await ac.decodeAudioData(arr.slice(0));
        const channels = audioBuffer.numberOfChannels;
        const len = audioBuffer.length;

        // Mix down to mono for STT stability.
        const mono = new Float32Array(len);
        for (let ch = 0; ch < channels; ch++) {
          const data = audioBuffer.getChannelData(ch);
          for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
        }

        const targetRate = 16000;
        const resampled = downsampleFloat32(mono, audioBuffer.sampleRate, targetRate);
        return encodePcm16Wav(resampled, targetRate);
      } finally {
        try { await ac.close(); } catch (e) { }
      }
    }

    function isLoggedIn() { return !!localStorage.getItem('cognivara_user'); }

    function scrollToRecord(e) {
      if (e) e.preventDefault();
      if (!isLoggedIn()) { showLogin(); return; }
      showHomeAndRecord();
      updateNav('nav-record');
      setTimeout(() => document.getElementById('recording').scrollIntoView({ behavior: 'smooth' }), 100);
    }

    function toggleRecord() {
      if (!isLoggedIn()) { showLogin(); return; }
      if (completedSteps >= 3) return; // guard — use startNewRecording() to reset
      if (!isRecording) startRecording();
      else { clearInterval(timerInterval); stopRecording(); }
    }

    function startNewRecording() {
      // Full reset of recording state
      if (isRecording) { clearInterval(timerInterval); stopRecording(); }
      completedSteps = 0;
      currentStep = 1;
      allTranscripts = [];
      currentRunSessionAnalytics = {};
      userAnalysis = null;
      sessionTranscript = '';
      liveTranscriptSnapshot = '';
      // Reset UI
      for (let i = 1; i <= 3; i++) {
        const s = document.getElementById(`step-${i}`);
        s.className = 'baseline-step' + (i === 1 ? ' active' : '');
        s.innerHTML = `<div class="step-dot"></div>Recording ${i} of 3`;
      }
      document.getElementById('timer').textContent = '0:30';
      document.getElementById('timer').style.letterSpacing = '';
      document.getElementById('progress-bar').style.width = '0%';
      document.getElementById('record-label').textContent = 'Tap to Record';
      document.getElementById('timer-label').textContent = getRecordingQuestion(1);
      document.getElementById('baseline-established').classList.remove('show');
      document.getElementById('session-transcript-card').classList.remove('show');
      document.getElementById('redo-btn').classList.remove('show');
      renderAllTranscripts();
      document.getElementById('compare-float-btn').classList.remove('show');
      // Navigate to recording section
      hideAllPages();
      updateNav('nav-record');
      document.getElementById('hero-section').style.display = 'block';
      document.getElementById('recording-section').style.display = 'block';
      setTimeout(() => document.getElementById('recording').scrollIntoView({ behavior: 'smooth' }), 100);
    }

    function toggleInfo(id) {
      // Close all other tooltips first
      document.querySelectorAll('.info-tooltip.show').forEach(el => {
        if (el.id !== id) el.classList.remove('show');
      });
      document.getElementById(id).classList.toggle('show');
    }

    // Close tooltips on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('.info-icon-wrap')) {
        document.querySelectorAll('.info-tooltip.show').forEach(el => el.classList.remove('show'));
      }
    });

    function startRecording() {
      isRecording = true;
      timeLeft = 30;
      recordingStartedAt = performance.now();
      sessionTranscript = '';
      liveTranscriptSnapshot = '';
      // Hide previous session transcript card while recording
      document.getElementById('session-transcript-card').classList.remove('show');
      document.getElementById('redo-btn').classList.remove('show');
      document.getElementById('transcript-box').style.display = 'block';
      document.getElementById('transcript-text').innerHTML = '<em>Listening… speak naturally</em><span class="transcript-cursor"></span>';

      document.getElementById('record-btn').classList.add('recording');
      document.getElementById('record-ring').classList.add('active');
      document.getElementById('record-ring2').classList.add('active');
      document.getElementById('mic-idle').style.display = 'none';
      document.getElementById('mic-active').style.display = 'block';
      document.getElementById('record-label').textContent = 'Tap to Stop';
      document.getElementById('record-label').classList.add('on');
      document.getElementById('timer').classList.add('active');
      document.getElementById(`step-${currentStep}`).classList.add('active');
      document.getElementById('timer-label').textContent = getRecordingQuestion(currentStep);

      // Use browser speech recognition when available so transcript text appears during each recording.
      if (USE_BROWSER_SPEECH_RECOGNITION) {
        const hasSR = initSpeechRecognition();
        if (hasSR && recognition) {
          try {
            recognition.start();
          } catch (e) { }
        } else {
          updateTranscriptUI('Live transcript is not supported in this browser. Recording will still be saved per session.');
        }
      }

      // Capture raw audio via one persistent microphone stream so permission is requested only once.
      ensureMicrophoneAccess().then(stream => {
        try {
          const preferred = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus'
          ];
          const chosen = preferred.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
          mediaMimeType = chosen || 'audio/webm';
          mediaRecorder = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
        } catch (e) {
          mediaRecorder = null;
          return;
        }
        const sessionChunks = [];
        recordedChunks = sessionChunks;
        mediaRecorder.ondataavailable = ev => { if (ev.data && ev.data.size) sessionChunks.push(ev.data); };
        mediaRecorder.start(250);
      }).catch(e => {
        mediaRecorder = null;
        if (USE_BROWSER_SPEECH_RECOGNITION) {
          updateTranscriptUI('Live transcript unavailable. Recording will still be saved for this session.');
        }
        alert(`Microphone access failed: ${e.message}`);
      });

      timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer').textContent = `0:${timeLeft.toString().padStart(2, '0')}`;
        document.getElementById('progress-bar').style.width = `${((30 - timeLeft) / 30) * 100}%`;
        if (timeLeft <= 0) { clearInterval(timerInterval); stopRecording(); }
      }, 1000);
    }

    function stopRecording() {
      isRecording = false;
      if (recognition) { try { recognition.stop(); } catch (e) { } }
      const elapsedSec = Math.min(30, Math.max(0.1, (performance.now() - recordingStartedAt) / 1000));

      document.getElementById('record-btn').classList.remove('recording');
      document.getElementById('record-ring').classList.remove('active');
      document.getElementById('record-ring2').classList.remove('active');
      document.getElementById('mic-idle').style.display = 'block';
      document.getElementById('mic-active').style.display = 'none';
      document.getElementById('record-label').classList.remove('on');
      document.getElementById('timer').classList.remove('active');

      const sessionId = currentStep;
      // Prefer browser transcript when available; otherwise fill from server transcription.
      const browserText = (sessionTranscript.trim() || liveTranscriptSnapshot || '').trim();
      const initialText = browserText || 'Transcript pending...';
      allTranscripts.push({ session: sessionId, text: initialText });
      renderAllTranscripts();

      // Hide live transcript box
      document.getElementById('transcript-box').style.display = 'none';

      // Show session transcript card with REAL spoken text
      const stc = document.getElementById('session-transcript-card');
      document.getElementById('stc-session-badge').textContent = `Session ${sessionId}`;
      document.getElementById('stc-text').textContent = initialText;
      document.getElementById('stc-words').textContent = browserText ? `${countWords(browserText)} words` : 'Counting words...';
      document.getElementById('stc-duration').textContent = formatRecordedDuration(elapsedSec);
      stc.classList.add('show');

      // Snapshot recorder state for this session to avoid cross-session race conditions.
      const recorderRef = mediaRecorder;
      const chunksRef = recordedChunks;
      const mimeTypeRef = mediaMimeType;

      // Upload each recorded session to the FastAPI analytics backend.
      let transcriptionPromise = Promise.resolve();
      if (recorderRef || (chunksRef && chunksRef.length > 0)) {
        transcriptionPromise = (async () => {
          try {
            if (recorderRef && recorderRef.state !== 'inactive') {
              try { recorderRef.requestData(); } catch (e) { }
              await new Promise(resolve => {
                const done = () => resolve();
                recorderRef.addEventListener('stop', done, { once: true });
                try { recorderRef.stop(); } catch (e) { resolve(); }
                setTimeout(resolve, 1200);
              });
            }
            if (!chunksRef || chunksRef.length === 0) {
              const idx = allTranscripts.findIndex(x => x.session === sessionId);
              if (idx >= 0 && !browserText) {
                allTranscripts[idx].text = 'Transcript unavailable for this session.';
                updateSessionCardIfCurrent(sessionId, 'Transcript unavailable for this session.');
                renderAllTranscripts();
              }
              return;
            }
            const rawBlob = new Blob(chunksRef, { type: mimeTypeRef || 'audio/webm' });
            const transcribePromise = !browserText ? transcribeSessionAudio(rawBlob) : Promise.resolve(null);
            // Do not block backend upload on transcription API latency.
            // If browser transcript is unavailable, upload with empty transcript.
            const transcriptText = browserText || '';

            // Upload raw blob first for speed. Convert/retry only if backend rejects it.
            let uploadResult = await uploadSessionForFeatureExtraction(
              rawBlob,
              sessionId,
              transcriptText,
              `session-${sessionId}.webm`
            );

            if (!uploadResult || uploadResult.skipped) {
              try {
                const wavBlob = await convertRecordedBlobToWav(rawBlob);
                uploadResult = await uploadSessionForFeatureExtraction(
                  wavBlob,
                  sessionId,
                  transcriptText,
                  `session-${sessionId}.wav`
                );
              } catch (convertErr) {
                console.warn('WAV fallback conversion failed:', convertErr);
              }
            }

            if (uploadResult && !uploadResult.skipped) {
              currentRunSessionAnalytics[sessionId] = uploadResult;
            }

            // Background transcription only updates UI text; it does not block analysis.
            if (!browserText) {
              void (async () => {
                const transcribed = await transcribePromise;
                const idx = allTranscripts.findIndex(x => x.session === sessionId);
                if (transcribed && transcribed.trim()) {
                  const resolvedText = transcribed.trim();
                  if (idx >= 0) allTranscripts[idx].text = resolvedText;
                  updateSessionCardIfCurrent(sessionId, resolvedText);
                  renderAllTranscripts();
                } else if (idx >= 0 && allTranscripts[idx].text.toLowerCase().includes('pending')) {
                  allTranscripts[idx].text = 'Transcript unavailable for this session.';
                  updateSessionCardIfCurrent(sessionId, 'Transcript unavailable for this session.');
                  renderAllTranscripts();
                }
              })();
            }
          } catch (e) {
            console.warn('Session analytics upload failed', e);
            const fallbackText = allTranscripts.find(x => x.session === sessionId)?.text || '';
            updateSessionCardIfCurrent(sessionId, fallbackText || `Session upload failed: ${e.message}`);
          } finally {
            // Keep microphone stream alive across sessions and don't clobber newer session state.
            if (recordedChunks === chunksRef) recordedChunks = [];
            if (mediaRecorder === recorderRef) mediaRecorder = null;
          }
        })();
      } else {
        // No captured audio buffer: keep deterministic fallback text instead of "transcribing..." placeholder.
        const idx = allTranscripts.findIndex(x => x.session === sessionId);
        if (idx >= 0 && !browserText) {
          allTranscripts[idx].text = 'Transcript unavailable for this session.';
          updateSessionCardIfCurrent(sessionId, 'Transcript unavailable for this session.');
          renderAllTranscripts();
        }
      }
      pendingTranscriptions[sessionId] = transcriptionPromise.finally(() => { delete pendingTranscriptions[sessionId]; });

      const step = document.getElementById(`step-${sessionId}`);
      step.classList.remove('active');
      step.classList.add('completed');
      step.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Recording ${sessionId} of 3`;
      completedSteps++;
      currentStep++;

      // Show redo button (only if not all 3 done yet, so user can redo last session)
      if (completedSteps < 3) {
        document.getElementById('redo-btn').classList.add('show');
      }

      if (completedSteps < 3) {
        document.getElementById('timer').textContent = '0:30';
        document.getElementById('progress-bar').style.width = '0%';
        document.getElementById('record-label').textContent = 'Tap to Record';
        document.getElementById('timer-label').textContent = getRecordingQuestion(currentStep);
      } else {
        document.getElementById('progress-bar').style.width = '100%';
        document.getElementById('timer').textContent = '✓';
        document.getElementById('timer').style.letterSpacing = '0';
        document.getElementById('timer-label').textContent = 'Analyzing speech biomarkers…';
        document.getElementById('record-label').textContent = 'Complete';
        document.getElementById('baseline-established').classList.add('show');
        document.getElementById('transcript-box').style.display = 'none';

        Promise.resolve()
          .then(() => waitForPendingSessionUploads(12000))
          .then(() => {
            renderAllTranscripts();
            return computeUserAnalysis(allTranscripts);
          })
          .then(result => {
            userAnalysis = result;
            renderUserDashboard(userAnalysis);

            // Auto-match the closest reference profile to your latest analyzed metrics.
            const uidx = {
              emo: userAnalysis.emo[userAnalysis.emo.length - 1],
              cog: userAnalysis.cog[userAnalysis.cog.length - 1],
              hes: userAnalysis.hes[userAnalysis.hes.length - 1],
              lin: userAnalysis.lin[userAnalysis.lin.length - 1],
              risk: userAnalysis.risk[userAnalysis.risk.length - 1]
            };
            let best = 'A';
            let bestDist = Infinity;
            ['A', 'B', 'C'].forEach(pid => {
              const p = PATIENTS[pid];
              const pidx = {
                emo: p.emo[p.emo.length - 1],
                cog: p.cog[p.cog.length - 1],
                hes: p.hes[p.hes.length - 1],
                lin: p.lin[p.lin.length - 1],
                risk: p.risk[p.risk.length - 1]
              };
              const d = Math.sqrt(
                Math.pow(uidx.emo - pidx.emo, 2) +
                Math.pow(uidx.cog - pidx.cog, 2) +
                Math.pow(uidx.hes - pidx.hes, 2) +
                Math.pow(uidx.lin - pidx.lin, 2) +
                Math.pow(uidx.risk - pidx.risk, 2)
              );
              if (d < bestDist) {
                bestDist = d;
                best = pid;
              }
            });
            currentComparePatient = best;
            renderComparePage(currentComparePatient);

            setTimeout(showDashboard, 2200);
          })
          .catch(err => {
            console.error('Analysis failed', err);
            userAnalysis = null;
            alert(`Analysis failed: ${err.message}`);
          });
      }
    }

    function redoLastRecording() {
      if (isRecording) return;
      // Roll back the last completed step
      completedSteps--;
      currentStep--;
      // Remove from transcripts array
      allTranscripts = allTranscripts.filter(t => t.session !== currentStep);
      delete currentRunSessionAnalytics[currentStep];
      delete pendingTranscriptions[currentStep];
      renderAllTranscripts();
      // Reset the step pill
      const step = document.getElementById(`step-${currentStep}`);
      step.classList.remove('completed');
      step.classList.add('active');
      step.innerHTML = `<div class="step-dot"></div>Recording ${currentStep} of 3`;
      // Reset timer & progress
      document.getElementById('timer').textContent = '0:30';
      document.getElementById('timer').style.letterSpacing = '';
      document.getElementById('progress-bar').style.width = '0%';
      document.getElementById('record-label').textContent = 'Tap to Record';
      document.getElementById('timer-label').textContent = getRecordingQuestion(currentStep);
      // Hide redo button and session transcript card
      document.getElementById('redo-btn').classList.remove('show');
      document.getElementById('session-transcript-card').classList.remove('show');
      document.getElementById('baseline-established').classList.remove('show');
    }

    // ══════════════════════════════════════════════
    //  DASHBOARD
    // ══════════════════════════════════════════════
    function showDashboard() {
      hideAllPages();
      updateNav('nav-dash');
      document.getElementById('dashboard').classList.add('show');
      document.getElementById('compare-float-btn').classList.add('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        if (userAnalysis) renderUserDashboard(userAnalysis);
        generateWaveform();
        generateMarkers();
        document.querySelectorAll('.reveal').forEach((el, i) => {
          setTimeout(() => el.classList.add('visible'), i * 80);
        });
      }, 400);
    }

    function showDashboardNav() {
      if (document.getElementById('dashboard').classList.contains('show')) return;
      if (userAnalysis) showDashboard();
    }

    // ══════════════════════════════════════════════
    //  PAGE NAVIGATION
    // ══════════════════════════════════════════════
    function updateNav(activeId) {
      document.querySelectorAll('.nav-links a').forEach(el => el.classList.remove('active'));
      if (activeId) {
        const el = document.getElementById(activeId);
        if (el) el.classList.add('active');
      }
    }

    function syncHomeRecordNavByScroll() {
      const heroSection = document.getElementById('hero-section');
      const recordingSection = document.getElementById('recording-section');
      const dashboard = document.getElementById('dashboard');
      const profile = document.getElementById('profile-page');
      const settings = document.getElementById('settings-page');
      const compare = document.getElementById('compare-page');
      const recording = document.getElementById('recording');

      // Only auto-sync when the home+record layout is visible.
      if (!heroSection || !recordingSection || !recording) return;
      if (heroSection.style.display === 'none' || recordingSection.style.display === 'none') return;

      // Do not override explicit nav states for other pages.
      if (dashboard.classList.contains('show')) return;
      if (profile.style.display === 'block' || settings.style.display === 'block' || compare.style.display === 'block') return;

      const nav = document.querySelector('nav');
      const navBottom = (nav ? nav.getBoundingClientRect().bottom : 0) + 24;
      const recordingTop = recording.getBoundingClientRect().top;
      updateNav(recordingTop <= navBottom ? 'nav-record' : 'nav-home');
    }

    function hideAllPages() {
      updateNav(null);
      document.getElementById('hero-section').style.display = 'none';
      document.getElementById('recording-section').style.display = 'none';
      document.getElementById('dashboard').classList.remove('show');
      document.getElementById('profile-page').style.display = 'none';
      document.getElementById('settings-page').style.display = 'none';
      document.getElementById('compare-page').style.display = 'none';
    }

    function showHomeAndRecord() {
      hideAllPages();
      document.getElementById('hero-section').style.display = 'block';
      document.getElementById('recording-section').style.display = 'block';
      document.getElementById('compare-float-btn').classList.remove('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      syncHomeRecordNavByScroll();
    }

    function goHome() {
      hideAllPages();
      updateNav('nav-home');
      document.getElementById('hero-section').style.display = 'block';
      document.getElementById('recording-section').style.display = 'block';
      if (userAnalysis) document.getElementById('compare-float-btn').classList.add('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      syncHomeRecordNavByScroll();
    }

    function goBack() {
      if (userAnalysis) {
        showDashboard();
      } else {
        goHome();
      }
    }

    function profileRiskMeta(score) {
      if (score < 45) return { label: 'Stable', color: '#10b981' };
      if (score < 65) return { label: 'Watch', color: '#f59e0b' };
      return { label: 'Elevated', color: '#ef4444' };
    }

    function renderProfileHistoryRows(rows) {
      const body = document.getElementById('profile-history-body');
      if (!body) return;
      if (!rows || !rows.length) {
        body.innerHTML = '<tr style="border-bottom:1px solid var(--border-soft);"><td colspan="4" style="padding:10px 4px; color:var(--text-muted);">No sessions yet. Complete recordings to populate history.</td></tr>';
        return;
      }

      const latestRows = rows.slice(-5).reverse();
      const baseline = latestRows[latestRows.length - 1]?.score || 50;
      body.innerHTML = latestRows.map((r) => {
        const meta = profileRiskMeta(r.score);
        const deltaPct = Math.round(((r.score - baseline) / Math.max(1, baseline)) * 100);
        const deltaColor = deltaPct <= 0 ? '#10b981' : deltaPct < 10 ? '#f59e0b' : '#ef4444';
        const deltaText = `${deltaPct > 0 ? '+' : ''}${deltaPct}%`;
        return `<tr style="border-bottom:1px solid var(--border-soft);">
          <td style="padding:8px 4px;">${r.label}</td>
          <td style="padding:8px 4px;">${r.score}</td>
          <td style="padding:8px 4px;color:${meta.color};">${meta.label}</td>
          <td style="padding:8px 4px;color:${deltaColor};">${deltaText}</td>
        </tr>`;
      }).join('');
    }

    function renderWeeklySummaryFromScores(scores, flaggedFeatures) {
      const titleEl = document.getElementById('profile-weekly-title');
      const textEl = document.getElementById('profile-weekly-text');
      if (!titleEl || !textEl) return;

      if (!scores || scores.length === 0) {
        titleEl.textContent = 'Weekly AI Summary';
        textEl.textContent = 'Weekly summary will appear after enough sessions are recorded.';
        return;
      }

      const first = scores[0];
      const last = scores[scores.length - 1];
      const diff = last - first;
      const direction = diff > 3 ? 'increased' : diff < -3 ? 'improved' : 'remained stable';
      const flagged = (flaggedFeatures || []).slice(0, 3).join(', ');
      titleEl.textContent = 'Weekly AI Summary';
      textEl.textContent = `Risk ${direction} by ${Math.abs(diff)} points across ${scores.length} sessions. ${flagged ? `Top flagged features: ${flagged}.` : 'No major feature flags this week.'}`;
    }

    async function showProfilePage() {
      hideAllPages();
      const user = JSON.parse(localStorage.getItem('cognivara_user') || '{}');
      const parts = (user.name || 'U').split(' ').filter(p => p);
      const initials = parts.map(p => p[0].toUpperCase()).slice(0, 2).join('');
      const avatar = document.getElementById('profile-avatar-large');
      avatar.textContent = initials;
      document.getElementById('profile-name-large').textContent = user.name || '—';
      document.getElementById('profile-email-large').textContent = user.email || '—';
      let ageGroup = '—';
      if (user.age) {
        const a = parseInt(user.age);
        if (a < 26) ageGroup = '18–25';
        else if (a < 41) ageGroup = '26–40';
        else if (a < 61) ageGroup = '41–60';
        else ageGroup = '60+';
      }
      document.getElementById('profile-age-large').textContent = ageGroup;
      document.getElementById('profile-start-date').textContent = user.startDate || 'Feb 1, 2026';
      document.getElementById('profile-start-date').textContent = user.startDate || 'Feb 1, 2026';
      document.getElementById('profile-risk-large').textContent = userAnalysis ? userAnalysis.riskLabel : 'No analysis yet';
      document.getElementById('profile-risk-large').style.color = userAnalysis ? userAnalysis.riskColor : '#8a9ab0';
      document.getElementById('profile-total-rec').textContent = String((userAnalysis && userAnalysis.risk && userAnalysis.risk.length) || 0);
      document.getElementById('profile-baseline').textContent = (userAnalysis && userAnalysis.risk && userAnalysis.risk.length >= 3) ? 'Yes' : 'Building';

      // Frontend fallback rendering from current analysis.
      if (userAnalysis && Array.isArray(userAnalysis.risk) && userAnalysis.risk.length) {
        const localRows = userAnalysis.risk.map((score, i) => ({
          label: `Session ${i + 1}`,
          score: clampScore(score)
        }));
        renderProfileHistoryRows(localRows);
        renderWeeklySummaryFromScores(localRows.map(r => r.score), []);
      } else {
        renderProfileHistoryRows([]);
        renderWeeklySummaryFromScores([], []);
      }

      // Backend-enriched profile data if available.
      try {
        const userId = getCurrentUserId();
        if (userId) {
          let dash = null;
          for (const base of getFastApiCandidates()) {
            try {
              const resp = await fetch(`${base}/api/dashboard/${userId}`, { headers: buildAuthHeaders() });
              if (!resp.ok) continue;
              dash = await resp.json();
              break;
            } catch (e) {}
          }
          if (dash) {
            const labels = Array.isArray(dash?.trends?.labels) ? dash.trends.labels : [];
            const scores = Array.isArray(dash?.trends?.csi) ? dash.trends.csi.map(clampScore) : [];
            const rows = scores.map((score, i) => ({
              label: labels[i] || `Session ${i + 1}`,
              score
            }));
            renderProfileHistoryRows(rows);
            renderWeeklySummaryFromScores(scores, dash.flagged_features || []);
            document.getElementById('profile-total-rec').textContent = String(dash.session_count || rows.length || 0);
            document.getElementById('profile-baseline').textContent = dash.baseline_ready ? 'Yes' : 'Building';
          }
        }
      } catch (e) {}

      document.getElementById('profile-page').style.display = 'block';
      document.getElementById('profile-dropdown').classList.remove('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showComparePage() {
      hideAllPages();
      document.getElementById('compare-page').style.display = 'block';
      document.getElementById('compare-float-btn').classList.remove('show');
      document.getElementById('profile-dropdown').classList.remove('show');
      selectComparePatient(currentComparePatient);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showSettingsPage() {
      hideAllPages();
      const user = JSON.parse(localStorage.getItem('cognivara_user') || '{}');
      document.getElementById('settings-name').value = user.name || '';
      document.getElementById('settings-email').value = user.email || '';
      document.getElementById('settings-age').value = user.age || '';
      document.getElementById('settings-page').style.display = 'block';
      document.getElementById('profile-dropdown').classList.remove('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function saveSettings() {
      const existing = getStoredUser();
      const user = {
        ...existing,
        name: document.getElementById('settings-name').value.trim(),
        email: document.getElementById('settings-email').value.trim(),
        age: document.getElementById('settings-age').value.trim()
      };
      if (!user.name || !user.email || !user.age) { alert('All fields required'); return; }
      syncUserWithBackend(user)
        .then(saved => {
          localStorage.setItem('cognivara_user', JSON.stringify(saved));
          updateUserUI();
          goBack();
        })
        .catch(err => alert(`Could not save settings to backend: ${err.message}`));
    }

    // ══════════════════════════════════════════════
    //  USER AUTH
    // ══════════════════════════════════════════════
    function showLogin() { document.getElementById('login-modal').classList.remove('hidden'); }
    function hideLogin() { document.getElementById('login-modal').classList.add('hidden'); }

    async function requestAuth(base, path, payload) {
      const resp = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const jd = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(jd.detail || jd.error || `HTTP ${resp.status}`);
      return jd;
    }

    async function authenticateUser(user) {
      let lastErr = null;
      for (const base of getFastApiCandidates()) {
        try {
          let authData;
          try {
            authData = await requestAuth(base, '/api/auth/signup', {
              name: user.name,
              email: user.email,
              password: user.password,
              age: user.age ? Number(user.age) : null,
              gender: user.gender || null
            });
          } catch (signupErr) {
            if (!/Email already exists/i.test(signupErr.message || '')) throw signupErr;
            authData = await requestAuth(base, '/api/auth/login', {
              email: user.email,
              password: user.password
            });
          }

          backendStatusBase = base;
          setBackendStatus('online', `Backend: online (${backendHostLabel(base)})`, `Authenticated with ${base}`);

          const authUser = authData.user || {};
          return {
            ...user,
            userId: authUser.id,
            name: authUser.name || user.name,
            email: authUser.email || user.email,
            age: authUser.age ?? user.age,
            gender: authUser.gender || user.gender || '',
            accessToken: authData.access_token,
            password: ''
          };
        } catch (e) {
          lastErr = e;
        }
      }
      throw (lastErr || new Error('Could not authenticate with backend'));
    }

    async function syncUserWithBackend(user) {
      let lastErr = null;
      for (const base of getFastApiCandidates()) {
        try {
          const fd = new FormData();
          fd.append('name', user.name || '');
          fd.append('email', user.email || '');
          fd.append('age', String(user.age || ''));
          if (user.gender) fd.append('gender', user.gender);
          if (user.password) fd.append('password', user.password);

          const resp = await fetch(`${base}/api/user`, { method: 'POST', body: fd });
          const jd = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(jd.detail || jd.error || `HTTP ${resp.status}`);

          backendStatusBase = base;
          setBackendStatus('online', `Backend: online (${backendHostLabel(base)})`, `Connected to ${base}`);

          return {
            ...user,
            userId: jd.user_id,
            gender: jd.gender || user.gender || '',
            password: ''
          };
        } catch (e) {
          lastErr = e;
        }
      }
      throw (lastErr || new Error('Could not reach FastAPI backend'));
    }

    function submitSignup(e) {
      e.preventDefault();
      const user = {
        name: document.getElementById('input-name').value.trim(),
        email: document.getElementById('input-email').value.trim(),
        age: document.getElementById('input-age').value.trim(),
        gender: document.getElementById('input-gender').value.trim(),
        password: document.getElementById('input-password').value
      };
      if (!user.name || !user.email || !user.age || !user.gender || !user.password) {
        alert('Please fill all signup fields.');
        return;
      }
      authenticateUser(user)
        .then(saved => {
          localStorage.setItem('cognivara_user', JSON.stringify(saved));
          document.getElementById('login-form').reset();
          hideLogin();
          updateUserUI();
          window.location.reload();
        })
        .catch(err => alert(`Could not sign in or create the account.\n\n${err.message}`));
    }

    function updateUserUI() {
      const u = localStorage.getItem('cognivara_user');
      const recordBtn = document.getElementById('record-btn');
      const avatar = document.getElementById('profile-btn');
      if (u) {
        const user = JSON.parse(u);
        document.getElementById('login-btn').style.display = 'none';
        if (avatar) {
          avatar.style.display = 'flex';
          const parts = user.name.split(' ').filter(p => p);
          const initials = parts.map(p => p[0].toUpperCase()).slice(0, 2).join('');
          avatar.textContent = initials;
        }
        if (recordBtn) { recordBtn.classList.remove('disabled'); recordBtn.disabled = false; }
      } else {
        document.getElementById('login-btn').style.display = 'inline-block';
        if (avatar) avatar.style.display = 'none';
        document.getElementById('profile-dropdown').classList.remove('show');
        if (recordBtn) { recordBtn.classList.add('disabled'); recordBtn.disabled = true; }
      }
    }

    function logout() {
      releaseMicrophone();
      localStorage.removeItem('cognivara_user');
      userAnalysis = null;
      allTranscripts = [];
      currentRunSessionAnalytics = {};
      completedSteps = 0;
      currentStep = 1;
      updateUserUI();
      document.getElementById('profile-dropdown').classList.remove('show');
      document.getElementById('compare-float-btn').classList.remove('show');
      window.location.reload();
    }

    function toggleProfile() {
      document.getElementById('profile-dropdown').classList.toggle('show');
    }

    // ══════════════════════════════════════════════
    //  WAVEFORM
    // ══════════════════════════════════════════════
    const waveformEvents = [
      { pct: 23, time: '00:07', label: 'Pitch Spike', color: '#2f7dd1', detail: 'A sharp pitch excursion suggests abrupt vocal effort or emphasis at this point in the recording.' },
      { pct: 40, time: '00:12', label: 'Elevated Stress', color: '#ef7d1a', detail: 'Stress-colored bars cluster here, indicating heightened vocal tension and denser energy variation.' },
      { pct: 60, time: '00:18', label: 'Hesitation', color: '#f05252', detail: 'The waveform narrows and breaks into shorter pulses, consistent with a hesitation-heavy segment.' },
      { pct: 76, time: '00:23', label: 'Negative Tone', color: '#f97316', detail: 'This segment is flagged for heavier tonal pressure and a more strained delivery pattern.' },
      { pct: 90, time: '00:27', label: 'Reduced Pitch Variation', color: '#1cb5a3', detail: 'Pitch variation flattens toward the end of the session, suggesting lower expressiveness in the closing phrase.' }
    ];

    function setWaveformDetail(eventInfo) {
      const timeEl = document.getElementById('waveform-detail-time');
      const titleEl = document.getElementById('waveform-detail-title');
      const copyEl = document.getElementById('waveform-detail-copy');
      if (!timeEl || !titleEl || !copyEl) return;
      if (!eventInfo) {
        timeEl.textContent = '00:12';
        titleEl.textContent = 'Elevated Stress';
        copyEl.textContent = 'Hover across the waveform or select a marker to inspect the strongest speech event in this recording.';
        return;
      }
      timeEl.textContent = eventInfo.time;
      titleEl.textContent = eventInfo.label;
      copyEl.textContent = eventInfo.detail;
    }

    function highlightWaveform(index) {
      const bars = Array.from(document.querySelectorAll('#waveform-svg .waveform-bar'));
      if (!bars.length) return;
      bars.forEach((bar, i) => {
        const near = index >= 0 && Math.abs(i - index) <= 2;
        bar.classList.toggle('is-active', near);
        bar.classList.toggle('is-dim', index >= 0 && !near);
      });
    }

    function activateMarker(markerIndex) {
      const markers = Array.from(document.querySelectorAll('#markers .marker'));
      markers.forEach((marker, idx) => marker.classList.toggle('active', idx === markerIndex));
      setWaveformDetail(waveformEvents[markerIndex] || null);
      if (markerIndex >= 0) {
        const targetPct = waveformEvents[markerIndex].pct;
        const targetIndex = Math.max(0, Math.min(119, Math.round((targetPct / 100) * 119)));
        highlightWaveform(targetIndex);
      }
    }

    function generateWaveform() {
      const svg = document.getElementById('waveform-svg');
      if (!svg) return;
      let html = '';
      for (let i = 0; i < 120; i++) {
        const x = 8 + (i / 120) * 784;
        const envelope = 0.52 + 0.48 * Math.sin(i * 0.19 + 0.4) ** 2;
        const motion = Math.sin(i * 0.42) * 0.45 + Math.sin(i * 0.11 + 1.7) * 0.22 + Math.cos(i * 0.07) * 0.18;
        const h = 10 + Math.abs(motion) * 34 + envelope * 16;
        const y = 46 - h / 2;
        let c = '#78aee3';
        if (i > 16 && i < 20) c = '#e8b949';
        if (i > 28 && i < 34) c = '#f08b86';
        if (i > 42 && i < 46) c = '#ef9f70';
        if (i > 54 && i < 58) c = '#eda35f';
        if (i > 64 && i < 68) c = '#37b9ab';
        html += `<rect class="waveform-bar" data-index="${i}" x="${x}" y="${y}" width="4.8" height="${h}" rx="2.4" fill="${c}" opacity="0.96"/>`;
      }
      svg.innerHTML = html;
      svg.onmouseleave = () => activateMarker(1);
      svg.onmousemove = (event) => {
        const rect = svg.getBoundingClientRect();
        const pct = (event.clientX - rect.left) / Math.max(rect.width, 1);
        const index = Math.max(0, Math.min(119, Math.round(pct * 119)));
        highlightWaveform(index);
        const nearest = waveformEvents.reduce((bestIdx, item, idx) => {
          const bestDist = Math.abs(waveformEvents[bestIdx].pct - pct * 100);
          const currDist = Math.abs(item.pct - pct * 100);
          return currDist < bestDist ? idx : bestIdx;
        }, 0);
        setWaveformDetail(waveformEvents[nearest]);
      };
      activateMarker(1);
    }

    function generateMarkers() {
      const c = document.getElementById('markers');
      if (!c) return;
      c.innerHTML = '';
      waveformEvents.forEach((m, idx) => {
          const d = document.createElement('div');
          d.className = 'marker'; d.style.left = `${m.pct}%`;
          d.innerHTML = `<div class="marker-tooltip">${m.time} â€” ${m.label}</div><div class="marker-line"></div><div class="marker-dot" style="background:${m.color};"></div>`;
          d.addEventListener('mouseenter', () => activateMarker(idx));
          d.addEventListener('click', () => activateMarker(idx));
          c.appendChild(d);
        });
      const tl = document.getElementById('waveform-timeline');
      if (tl) {
        tl.innerHTML = '';
        ['0:00', '0:05', '0:10', '0:15', '0:20', '0:25', '0:30'].forEach((t, i) => {
          const el = document.createElement('div');
          el.className = 'timeline-tick'; el.style.left = `${(i / 6) * 100}%`;
          el.innerHTML = `<span class="tick-time">${t}</span>`;
          tl.appendChild(el);
        });
      }
      activateMarker(1);
    }

    // ══════════════════════════════════════════════
    //  SCROLL REVEAL
    // ══════════════════════════════════════════════
    function initReveal() {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
      }, { threshold: 0.1 });
      document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    }

    document.addEventListener('click', e => {
      if (!e.target.closest('#profile-btn') && !e.target.closest('#profile-dropdown')) {
        document.getElementById('profile-dropdown').classList.remove('show');
      }
    });

    window.addEventListener('DOMContentLoaded', () => {
      initReveal();
      updateUserUI();
      refreshBackendStatus(true);
      setInterval(() => refreshBackendStatus(false), 30000);
      // If user is logged in, go home; if not, show home
      goHome();
    });

    window.addEventListener('scroll', syncHomeRecordNavByScroll, { passive: true });
    window.addEventListener('resize', syncHomeRecordNavByScroll);

    window.addEventListener('beforeunload', () => {
      releaseMicrophone();
    });
