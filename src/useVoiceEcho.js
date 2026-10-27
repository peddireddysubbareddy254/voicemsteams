import { useCallback, useEffect, useRef, useState } from "react";

// Voice states, mirroring the ChatGPT / Gemini voice-mode UX.
export const STATUS = {
  IDLE: "idle",
  CONNECTING: "connecting",
  LISTENING: "listening",
  SPEAKING: "speaking",
  ERROR: "error",
};

const SpeechRecognitionImpl =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

export const isSupported =
  !!SpeechRecognitionImpl && typeof window !== "undefined" && "speechSynthesis" in window;

const normalize = (s) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);

// True when `heard` is most likely our own TTS output leaking back into the mic.
function isEcho(heard, spoken) {
  const h = normalize(heard);
  if (!h.length || !spoken) return false;
  const s = new Set(normalize(spoken));
  const overlap = h.filter((w) => s.has(w)).length;
  return overlap / h.length >= 0.6;
}

const ERROR_MESSAGES = {
  "not-allowed": "Microphone access was blocked. Allow microphone permission and try again.",
  "service-not-allowed": "Speech service is not allowed in this client. Try Teams on the web (Edge/Chrome).",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition service is unreachable from this client. Try Teams on the web (Edge/Chrome).",
  "language-not-supported": "This language is not supported by the speech service.",
};

/**
 * Listens continuously, speaks every finished user utterance back, and stops
 * speaking the moment the user starts talking again (barge-in).
 */
export function useVoiceEcho({ lang = "en-US", headphonesMode = false } = {}) {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [interim, setInterim] = useState("");
  const [lastHeard, setLastHeard] = useState("");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);

  const statusRef = useRef(STATUS.IDLE);
  const activeRef = useRef(false);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const spokenTextRef = useRef("");
  const speechEndedAtRef = useRef(0);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(0);
  const loudSinceRef = useRef(0);
  const headphonesRef = useRef(headphonesMode);

  useEffect(() => {
    headphonesRef.current = headphonesMode;
  }, [headphonesMode]);

  const updateStatus = useCallback((s) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    speechEndedAtRef.current = Date.now();
    if (activeRef.current) updateStatus(STATUS.LISTENING);
  }, [updateStatus]);

  const speak = useCallback(
    (text) => {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
      if (voice) u.voice = voice;
      const done = () => {
        // Ignore stale callbacks from an utterance that was already interrupted.
        if (utteranceRef.current !== u) return;
        utteranceRef.current = null;
        speechEndedAtRef.current = Date.now();
        if (activeRef.current) updateStatus(STATUS.LISTENING);
      };
      u.onend = done;
      u.onerror = done;
      // Keep a reference so Chrome does not garbage-collect it mid-speech.
      utteranceRef.current = u;
      spokenTextRef.current = text;
      updateStatus(STATUS.SPEAKING);
      window.speechSynthesis.speak(u);
    },
    [lang, updateStatus]
  );

  const bargeIn = useCallback(() => {
    if (statusRef.current === STATUS.SPEAKING) stopSpeaking();
  }, [stopSpeaking]);

  // Mic level meter (drives the orb animation) + optional energy-based barge-in.
  const startMeter = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel((prev) => prev * 0.7 + Math.min(1, rms * 6) * 0.3);

      // With headphones there is no speaker echo, so raw voice energy is a
      // reliable (and faster) barge-in signal than waiting for a transcript.
      if (headphonesRef.current && statusRef.current === STATUS.SPEAKING) {
        const now = performance.now();
        if (rms > 0.06) {
          if (!loudSinceRef.current) loudSinceRef.current = now;
          else if (now - loudSinceRef.current > 180) {
            loudSinceRef.current = 0;
            bargeIn();
          }
        } else {
          loudSinceRef.current = 0;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [bargeIn]);

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const createRecognition = useCallback(() => {
    const rec = new SpeechRecognitionImpl();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      if (activeRef.current && statusRef.current === STATUS.CONNECTING) {
        updateStatus(STATUS.LISTENING);
      }
    };

    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;

        const speaking = statusRef.current === STATUS.SPEAKING;
        const recentlySpoke = Date.now() - speechEndedAtRef.current < 1500;
        const echo = (speaking || recentlySpoke) && isEcho(text, spokenTextRef.current);
        if (echo) continue;

        // The user started talking over the assistant: stop speaking immediately.
        if (speaking) bargeIn();

        if (result.isFinal) {
          setInterim("");
          setLastHeard(text);
          speak(text);
        } else {
          interimText += (interimText ? " " : "") + text;
        }
      }
      setInterim(interimText);
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      const msg = ERROR_MESSAGES[e.error] || `Speech recognition error: ${e.error}`;
      if (["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"].includes(e.error)) {
        activeRef.current = false;
        setError(msg);
        updateStatus(STATUS.ERROR);
      }
    };

    // Browsers end continuous sessions on silence/timeouts; keep it alive.
    rec.onend = () => {
      if (!activeRef.current) return;
      setTimeout(() => {
        if (!activeRef.current || recognitionRef.current !== rec) return;
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }, 150);
    };

    return rec;
  }, [lang, bargeIn, speak, updateStatus]);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError("Voice mode is not supported in this client. Open Teams on the web in Microsoft Edge or Google Chrome.");
      updateStatus(STATUS.ERROR);
      return;
    }
    setError("");
    setInterim("");
    updateStatus(STATUS.CONNECTING);
    activeRef.current = true;
    try {
      await startMeter();
    } catch (e) {
      activeRef.current = false;
      setError(
        e?.name === "NotAllowedError"
          ? ERROR_MESSAGES["not-allowed"]
          : `Could not access microphone: ${e?.message || e}`
      );
      updateStatus(STATUS.ERROR);
      return;
    }
    // Unlock speech synthesis within the user gesture (needed on some browsers).
    window.speechSynthesis.cancel();
    window.speechSynthesis.getVoices();

    const rec = createRecognition();
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      setError(`Could not start speech recognition: ${e.message}`);
      updateStatus(STATUS.ERROR);
    }
  }, [createRecognition, startMeter, updateStatus]);

  const stop = useCallback(() => {
    activeRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    stopMeter();
    setInterim("");
    updateStatus(STATUS.IDLE);
  }, [stopMeter, updateStatus]);

  useEffect(() => stop, [stop]);

  return { status, interim, lastHeard, error, level, start, stop, interrupt: stopSpeaking };
}
