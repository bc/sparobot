// Text-to-Speech using Web Speech API (works offline on iOS Safari)

let synth = null;

function getSynth() {
  if (!synth && 'speechSynthesis' in window) {
    synth = window.speechSynthesis;
  }
  return synth;
}

export function isTTSAvailable() {
  return 'speechSynthesis' in window;
}

export function speak(text, rate = 0.9) {
  const s = getSynth();
  if (!s) return;

  // Stop any current speech
  if (s.speaking) s.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = rate;
  utterance.pitch = 1.0;

  // Try to pick a good voice
  const voices = s.getVoices();
  const preferred = voices.find(v => v.name.includes('Samantha')) // iOS default
    || voices.find(v => v.lang === 'en-US' && v.localService)
    || voices.find(v => v.lang.startsWith('en'));
  if (preferred) utterance.voice = preferred;

  s.speak(utterance);
}

export function stopSpeaking() {
  const s = getSynth();
  if (s && s.speaking) s.cancel();
}

export function isSpeaking() {
  const s = getSynth();
  return s ? s.speaking : false;
}

// Speech Recognition using Web Speech API
// Note: On iOS Safari, this works but may need internet.
// For fully offline STT, a Whisper ONNX model could be integrated via transformers.js

let recognition = null;

export function isSTTAvailable() {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

export function startListening(onResult, onEnd) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onEnd?.('Speech recognition not available');
    return null;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    onResult?.(transcript);
  };

  recognition.onerror = (event) => {
    onEnd?.(event.error);
  };

  recognition.onend = () => {
    onEnd?.();
  };

  recognition.start();
  return recognition;
}

export function stopListening() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
}
