// Recording + audio processing helpers
function releaseMicrophone() {
  try {
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  } catch (e) {}
  mediaStream = null;
  micAccessPromise = null;
}

async function ensureMicrophoneAccess() {
  if (mediaStream && mediaStream.getTracks().some(t => t.readyState === 'live')) {
    return mediaStream;
  }
  if (micPermissionDenied) {
    throw new Error('Microphone permission is blocked in Brave. Open Site settings and allow microphone for localhost.');
  }
  if (micAccessPromise) {
    return micAccessPromise;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('This browser does not support microphone access');
  }
  micAccessPromise = navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => {
      mediaStream = stream;
      micPermissionDenied = false;
      return stream;
    })
    .catch((err) => {
      const name = String(err && err.name || '');
      const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
      if (denied) micPermissionDenied = true;
      throw denied
        ? new Error('Microphone permission denied. In Brave, set localhost:3000 microphone access to Allow.')
        : err;
    })
    .finally(() => {
      micAccessPromise = null;
    });
  return micAccessPromise;
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
        try { recognition.start(); } catch(err) {}
      }, 120);
    }
  };
  return true;
}

function updateTranscriptUI(text) {
  const el = document.getElementById('transcript-text');
  el.innerHTML = `<span class="has-text">${text}</span><span class="transcript-cursor"></span>`;
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
    try { await ac.close(); } catch (e) {}
  }
}

