// Plugin Audio — UI
// Fecha: 2026-04-09 | Issue: SEC-211 (fix UX: botón flotante + toggle)
// Estado: Listo para producción
// Criterio de ejecución: se activa cuando el plugin audio está instalado en Paperclip

import { useState, useEffect, useRef, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import {
  useHostContext,
  usePluginData,
  usePluginAction,
} from "@paperclipai/plugin-sdk/ui";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_ID = "paperclip-plugin-audio";

const ACTION_KEYS = {
  transcribeAudio: "transcribeAudio",
  synthesizeSpeech: "synthesizeSpeech",
};

const DATA_KEYS = {
  config: "audio-config",
};

const AUTOPLAY_KEY = `${PLUGIN_ID}:autoPlayTTS`;

// ---------------------------------------------------------------------------
// Design tokens (dark UI, glassmorphism)
// ---------------------------------------------------------------------------

const COLOR = {
  bg: "rgba(255,255,255,0.04)",
  bgHover: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  borderFocus: "rgba(255,255,255,0.25)",
  text: "rgba(255,255,255,0.90)",
  textMuted: "rgba(255,255,255,0.50)",
  accent: "#7c3aed",
  accentHover: "#6d28d9",
  danger: "#ef4444",
  dangerHover: "#dc2626",
  dangerLight: "rgba(239,68,68,0.15)",
  success: "#22c55e",
  warning: "#f59e0b",
};

const style = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "12px 10px",
    fontSize: 13,
    color: COLOR.text,
    minHeight: 0,
    overflowY: "auto",
  },
  section: {
    background: COLOR.bg,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: COLOR.textMuted,
    margin: 0,
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: 6,
    border: `1px solid ${COLOR.border}`,
    background: COLOR.bg,
    color: COLOR.text,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.15s, border-color 0.15s",
    outline: "none",
  },
  btnPrimary: {
    background: COLOR.accent,
    borderColor: COLOR.accent,
    color: "#fff",
  },
  btnDanger: {
    background: COLOR.dangerLight,
    borderColor: COLOR.danger,
    color: COLOR.danger,
  },
  micCircle: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    border: "none",
    outline: "none",
    transition: "box-shadow 0.2s, transform 0.1s",
    flexShrink: 0,
  },
  textarea: {
    width: "100%",
    minHeight: 70,
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${COLOR.border}`,
    background: "rgba(255,255,255,0.05)",
    color: COLOR.text,
    fontSize: 12,
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontSize: 12,
    color: COLOR.textMuted,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

function isSpeechSupported() {
  return typeof window !== "undefined" &&
    (typeof window.SpeechRecognition !== "undefined" ||
      typeof window.webkitSpeechRecognition !== "undefined");
}

function isMediaRecorderSupported() {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Chat textarea helpers
// ---------------------------------------------------------------------------

function findChatTextarea() {
  // Try specific selectors first, then fall back to last visible textarea
  const selectors = [
    'textarea[data-chat-input]',
    'textarea[data-testid="chat-input"]',
    '[data-chat-input] textarea',
    'textarea[placeholder]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    } catch {}
  }
  const all = Array.from(document.querySelectorAll('textarea'));
  return all.reverse().find((el) => el.offsetParent !== null) ?? null;
}

function injectIntoChat(text) {
  if (!text) return;
  const ta = findChatTextarea();
  if (!ta) return;
  const current = ta.value;
  const newValue = current
    ? current.endsWith(' ') ? current + text : current + ' ' + text
    : text;
  try {
    // Use native setter to bypass React's synthetic event tracking
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(ta, newValue);
    else ta.value = newValue;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.focus();
    ta.setSelectionRange(newValue.length, newValue.length);
  } catch {
    ta.value = newValue;
  }
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function MicIcon({ size = 20, color = "currentColor" }) {
  return _jsx("svg", {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
    "aria-hidden": "true",
    children: _jsxs(_Fragment, {
      children: [
        _jsx("path", { d: "M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" }),
        _jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
        _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "23" }),
        _jsx("line", { x1: "8", y1: "23", x2: "16", y2: "23" }),
      ],
    }),
  });
}

function PlayIcon({ size = 16 }) {
  return _jsx("svg", {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "currentColor", "aria-hidden": "true",
    children: _jsx("polygon", { points: "5,3 19,12 5,21" }),
  });
}

function StopIcon({ size = 16 }) {
  return _jsx("svg", {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "currentColor", "aria-hidden": "true",
    children: _jsx("rect", { x: "4", y: "4", width: "16", height: "16", rx: "2" }),
  });
}

function CopyIcon({ size = 14 }) {
  return _jsx("svg", {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor", strokeWidth: 2,
    strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
    children: _jsxs(_Fragment, {
      children: [
        _jsx("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2" }),
        _jsx("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }),
      ],
    }),
  });
}

// ---------------------------------------------------------------------------
// DictadoSection — Level 1: Web Speech API
// ---------------------------------------------------------------------------

function DictadoSection({ defaultLanguage }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  const supported = isSpeechSupported();

  const toggleListen = useCallback(() => {
    if (!supported) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = defaultLanguage || "es-ES";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += chunk;
        else interim += chunk;
      }
      setTranscript(finalTranscript + interim);
    };

    recognition.onend = () => {
      setListening(false);
      if (finalTranscript) {
        setTranscript(finalTranscript);
        // Inyectar directamente al textarea del chat
        injectIntoChat(finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error !== "no-speech") setError(`Error: ${event.error}`);
    };

    setError(null);
    setTranscript("");
    finalTranscript = "";
    recognition.start();
    setListening(true);
  }, [listening, supported, defaultLanguage]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  if (!supported) {
    return _jsxs("div", {
      style: style.section,
      children: [
        _jsx("p", { style: style.sectionTitle, children: "Dictado por voz" }),
        _jsx("p", { style: { fontSize: 12, color: COLOR.textMuted, margin: 0 }, children: "Tu navegador no soporta Web Speech API. Usa Chrome o Edge." }),
      ],
    });
  }

  return _jsxs("div", {
    style: style.section,
    children: [
      _jsx("p", { style: style.sectionTitle, children: "Dictado por voz" }),
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between" },
        children: [
          _jsxs("div", {
            style: { display: "flex", flexDirection: "column", gap: 4 },
            children: [
              _jsx("span", {
                style: { fontSize: 12, color: COLOR.textMuted },
                children: listening ? "Escuchando…" : transcript ? "✓ Texto enviado al chat" : `Idioma: ${defaultLanguage || "es-ES"}`,
              }),
              error && _jsx("span", { style: { fontSize: 11, color: COLOR.danger }, children: error }),
            ],
          }),
          _jsx("button", {
            onClick: toggleListen,
            onContextMenu: (e) => e.preventDefault(),
            onTouchStart: (e) => { e.preventDefault(); toggleListen(e); },
            "aria-label": listening ? "Detener dictado" : "Iniciar dictado",
            type: "button",
            style: {
              ...style.micCircle,
              background: listening ? COLOR.dangerLight : COLOR.bg,
              border: `2px solid ${listening ? COLOR.danger : COLOR.border}`,
              boxShadow: listening ? `0 0 0 4px rgba(239,68,68,0.15), 0 0 0 8px rgba(239,68,68,0.08)` : "none",
            },
            children: _jsx(MicIcon, { size: 22, color: listening ? COLOR.danger : COLOR.textMuted }),
          }),
        ],
      }),
      !listening && !transcript && _jsx("p", { style: { fontSize: 11, color: COLOR.textMuted, margin: 0, fontStyle: "italic" }, children: "Click para dictar. El texto aparecerá en el chat directamente." }),
    ],
  });
}

// ---------------------------------------------------------------------------
// GrabacionSection — Level 2: MediaRecorder + Whisper
// ---------------------------------------------------------------------------

function GrabacionSection({ workerAvailable, defaultLanguage }) {
  const transcribeAction = usePluginAction(ACTION_KEYS.transcribeAudio);

  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);

  const supported = isMediaRecorderSupported();

  const startRecording = useCallback(async () => {
    if (!supported || recording) return;
    setErrorMsg(null); setTranscript(""); setStatus(null); chunksRef.current = [];

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg("Permiso de micrófono denegado. Permite el acceso en tu navegador.");
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const base64 = await blobToBase64(blob);
      setStatus("transcribing");
      try {
        const result = await transcribeAction({ audioBase64: base64, mimeType });
        setTranscript(result?.text ?? "");
        setStatus("done");
      } catch (err) {
        setErrorMsg(err?.message ?? "Error al transcribir el audio");
        setStatus("error");
      }
    };

    recorder.start(500);
    setRecording(true);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => setDuration(Date.now() - startTimeRef.current), 200);
  }, [supported, recording, transcribeAction]);

  const stopRecording = useCallback(() => {
    if (!recording) return;
    clearInterval(timerRef.current);
    setRecording(false); setDuration(0);
    mediaRecorderRef.current?.stop();
  }, [recording]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
  }, []);

  const handleCopy = async () => {
    if (!transcript) return;
    try { await copyToClipboard(transcript); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setErrorMsg("Error al copiar"); }
  };

  if (!supported) {
    return _jsxs("div", {
      style: style.section,
      children: [
        _jsx("p", { style: style.sectionTitle, children: "Grabación (Nivel 2)" }),
        _jsx("p", { style: { fontSize: 12, color: COLOR.textMuted, margin: 0 }, children: "MediaRecorder no está disponible en este navegador." }),
      ],
    });
  }

  return _jsxs("div", {
    style: style.section,
    children: [
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between" },
        children: [
          _jsx("p", { style: style.sectionTitle, children: "Grabación de voz" }),
          !workerAvailable && _jsx("span", {
            style: { ...style.badge, background: "rgba(245,158,11,0.15)", color: COLOR.warning, border: "1px solid rgba(245,158,11,0.3)" },
            children: "Worker pendiente",
          }),
        ],
      }),
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between" },
        children: [
          _jsx("span", {
            style: { fontSize: 12, color: recording ? COLOR.danger : COLOR.textMuted },
            children: recording ? `Grabando… ${formatDuration(duration)}`
              : status === "transcribing" ? "Transcribiendo con Whisper…"
              : status === "done" ? "Transcripción lista"
              : status === "error" ? "Error en transcripción"
              : "Listo para grabar",
          }),
          _jsx("button", {
            onClick: recording ? stopRecording : startRecording,
            disabled: !workerAvailable || status === "transcribing",
            "aria-label": recording ? "Detener grabación" : "Iniciar grabación",
            style: {
              ...style.micCircle,
              background: recording ? COLOR.dangerLight : COLOR.bg,
              border: `2px solid ${recording ? COLOR.danger : COLOR.border}`,
              boxShadow: recording ? `0 0 0 4px rgba(239,68,68,0.15), 0 0 0 8px rgba(239,68,68,0.08)` : "none",
              opacity: (!workerAvailable || status === "transcribing") ? 0.5 : 1,
            },
            children: recording ? _jsx(StopIcon, { size: 18 }) : _jsx(MicIcon, { size: 22, color: COLOR.textMuted }),
          }),
        ],
      }),
      errorMsg && _jsx("span", { style: { fontSize: 11, color: COLOR.danger }, children: errorMsg }),
      transcript && _jsxs(_Fragment, {
        children: [
          _jsx("textarea", { style: style.textarea, value: transcript, readOnly: true, rows: 3, "aria-label": "Texto transcrito" }),
          _jsxs("div", {
            style: { ...style.row, justifyContent: "flex-end" },
            children: [_jsxs("button", { style: style.btn, onClick: handleCopy, children: [_jsx(CopyIcon, {}), copied ? "¡Copiado!" : "Copiar"] })],
          }),
        ],
      }),
      !workerAvailable && _jsx("p", {
        style: { fontSize: 11, color: COLOR.textMuted, margin: 0, fontStyle: "italic" },
        children: "Requiere el worker de audio ([SEC-202](/SEC/issues/SEC-202)). Disponible cuando Forge complete la integración con Whisper.",
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// TtsSection — Level 2: ElevenLabs TTS
// ---------------------------------------------------------------------------

function TtsSection({ workerAvailable }) {
  const synthesizeAction = usePluginAction(ACTION_KEYS.synthesizeSpeech);
  const { entityId } = useHostContext();

  const [text, setText] = useState("");
  const [agentId, setAgentId] = useState(entityId ?? "");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(() => {
    try { return localStorage.getItem(AUTOPLAY_KEY) === "true"; } catch { return false; }
  });
  const [errorMsg, setErrorMsg] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => { try { localStorage.setItem(AUTOPLAY_KEY, String(autoPlay)); } catch {} }, [autoPlay]);
  useEffect(() => { if (entityId) setAgentId(entityId); }, [entityId]);

  const handlePlay = async () => {
    if (!text.trim() || !workerAvailable) return;
    setErrorMsg(null); setLoading(true);
    try {
      const result = await synthesizeAction({ text: text.trim(), agentId });
      const { audioBase64, mimeType: mime } = result ?? {};
      if (!audioBase64) throw new Error("No se recibió audio del servidor");
      const dataUrl = `data:${mime ?? "audio/mpeg"};base64,${audioBase64}`;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = dataUrl;
        audioRef.current.onplay = () => setPlaying(true);
        audioRef.current.onended = () => setPlaying(false);
        audioRef.current.onerror = () => { setPlaying(false); setErrorMsg("Error al reproducir el audio"); };
        await audioRef.current.play();
      }
    } catch (err) {
      setErrorMsg(err?.message ?? "Error en TTS");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = () => { audioRef.current?.pause(); setPlaying(false); };

  return _jsxs("div", {
    style: style.section,
    children: [
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between" },
        children: [
          _jsx("p", { style: style.sectionTitle, children: "Text-to-Speech" }),
          !workerAvailable && _jsx("span", {
            style: { ...style.badge, background: "rgba(245,158,11,0.15)", color: COLOR.warning, border: "1px solid rgba(245,158,11,0.3)" },
            children: "Worker pendiente",
          }),
        ],
      }),
      _jsx("textarea", {
        style: style.textarea,
        value: text,
        onChange: (e) => setText(e.target.value),
        placeholder: "Pega aquí el texto del agente para escucharlo…",
        rows: 3,
        disabled: !workerAvailable,
        "aria-label": "Texto para sintetizar",
      }),
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between" },
        children: [
          _jsxs("label", {
            style: { ...style.toggle, userSelect: "none" },
            children: [
              _jsx("input", { type: "checkbox", checked: autoPlay, onChange: (e) => setAutoPlay(e.target.checked), style: { accentColor: COLOR.accent }, "aria-label": "Auto-reproducir respuestas" }),
              "Auto-play",
            ],
          }),
          playing
            ? _jsxs("button", { style: { ...style.btn, ...style.btnDanger }, onClick: handleStop, children: [_jsx(StopIcon, {}), "Detener"] })
            : _jsxs("button", {
                style: { ...style.btn, ...(workerAvailable && text.trim() ? style.btnPrimary : {}), opacity: (!workerAvailable || !text.trim() || loading) ? 0.5 : 1 },
                onClick: handlePlay,
                disabled: !workerAvailable || !text.trim() || loading,
                children: [loading ? "Generando…" : _jsx(PlayIcon, {}), loading ? "" : "Reproducir"],
              }),
        ],
      }),
      errorMsg && _jsx("span", { style: { fontSize: 11, color: COLOR.danger }, children: errorMsg }),
      _jsx("audio", { ref: audioRef, style: { display: "none" }, preload: "none" }),
    ],
  });
}

// ---------------------------------------------------------------------------
// AudioChatInputButton — floating mic button injected near chat textarea
// Slot: toolbarButton (entityTypes: issue) — useEffect injects floating DOM el
// ---------------------------------------------------------------------------

export function AudioChatInputButton() {
  const configResult = usePluginData(DATA_KEYS.config);
  const defaultLanguage = configResult.data?.defaultLanguage ?? "es-ES";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      typeof window.SpeechRecognition !== "undefined" ||
      typeof window.webkitSpeechRecognition !== "undefined";
    if (!supported) return;

    let listening = false;
    let recognition = null;

    // --- Build floating button ---
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Dictado por voz (click para iniciar/detener)");
    btn.title = "Dictado por voz";
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>' +
      '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
      '<line x1="12" y1="19" x2="12" y2="23"/>' +
      '<line x1="8" y1="23" x2="16" y2="23"/>' +
      "</svg>";

    const applyIdleStyle = () => {
      btn.style.cssText =
        "width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;" +
        "cursor:pointer;border:1.5px solid rgba(255,255,255,0.18);background:rgba(30,30,40,0.85);" +
        "color:rgba(255,255,255,0.55);outline:none;padding:0;pointer-events:all;" +
        "box-shadow:0 1px 4px rgba(0,0,0,0.3);transition:background 0.15s,border-color 0.15s,box-shadow 0.2s;";
    };
    const applyRecordingStyle = () => {
      btn.style.cssText =
        "width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;" +
        "cursor:pointer;border:1.5px solid #ef4444;background:rgba(239,68,68,0.18);" +
        "color:#ef4444;outline:none;padding:0;pointer-events:all;" +
        "box-shadow:0 0 0 3px rgba(239,68,68,0.22),0 1px 4px rgba(0,0,0,0.3);transition:background 0.15s,border-color 0.15s,box-shadow 0.2s;";
    };
    applyIdleStyle();

    const stopListening = () => {
      try { recognition?.stop(); } catch {}
      recognition = null;
      listening = false;
      applyIdleStyle();
    };

    const startListening = () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SR();
      recognition.lang = defaultLanguage;
      recognition.interimResults = false;
      recognition.continuous = false;
      let finalText = "";

      recognition.onresult = (ev) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
        }
      };
      recognition.onend = () => {
        listening = false;
        applyIdleStyle();
        if (finalText.trim()) injectIntoChat(finalText.trim());
        recognition = null;
      };
      recognition.onerror = (ev) => {
        if (ev.error !== "no-speech") console.warn("[audio-plugin]", ev.error);
        listening = false;
        applyIdleStyle();
        recognition = null;
      };

      recognition.start();
      listening = true;
      applyRecordingStyle();
    };

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (listening) stopListening();
      else startListening();
    });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); }, { passive: false });

    // --- Floating container ---
    const container = document.createElement("div");
    container.id = "paperclip-audio-mic-float";
    container.style.cssText =
      "position:fixed;z-index:9999;pointer-events:none;display:flex;align-items:center;justify-content:center;";
    container.appendChild(btn);
    document.body.appendChild(container);

    const positionBtn = () => {
      const ta = findChatTextarea();
      if (!ta) { container.style.display = "none"; return; }
      container.style.display = "flex";
      const rect = ta.getBoundingClientRect();
      const margin = 6;
      const btnSize = 30;
      container.style.left = rect.right - btnSize - margin + "px";
      container.style.top = rect.bottom - btnSize - margin + "px";
      container.style.width = btnSize + "px";
      container.style.height = btnSize + "px";
    };

    positionBtn();
    window.addEventListener("resize", positionBtn);
    const observer = new MutationObserver(positionBtn);
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
    const poll = setInterval(positionBtn, 1500);

    return () => {
      clearInterval(poll);
      window.removeEventListener("resize", positionBtn);
      observer.disconnect();
      stopListening();
      if (container.parentNode) container.parentNode.removeChild(container);
    };
  }, [defaultLanguage]);

  // Returns null — this component's job is done via DOM injection in useEffect
  return null;
}

// ---------------------------------------------------------------------------
// AudioSidebarPanel — main slot
// ---------------------------------------------------------------------------

export function AudioSidebarPanel() {
  const configResult = usePluginData(DATA_KEYS.config);
  const config = configResult.data ?? {};
  const workerAvailable = !configResult.error;
  const defaultLanguage = config.defaultLanguage ?? "es-ES";

  return _jsxs("div", {
    style: style.panel,
    children: [
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between", marginBottom: 2 },
        children: [
          _jsx("span", { style: { fontSize: 13, fontWeight: 600, color: COLOR.text }, children: "Audio" }),
          workerAvailable
            ? _jsx("span", { style: { ...style.badge, background: "rgba(34,197,94,0.12)", color: COLOR.success, border: "1px solid rgba(34,197,94,0.25)" }, children: "Worker activo" })
            : _jsx("span", { style: { ...style.badge, background: "rgba(245,158,11,0.12)", color: COLOR.warning, border: "1px solid rgba(245,158,11,0.25)" }, children: "Solo Nivel 1" }),
        ],
      }),
      _jsx(DictadoSection, { defaultLanguage }),
      _jsx(GrabacionSection, { workerAvailable, defaultLanguage }),
      _jsx(TtsSection, { workerAvailable }),
    ],
  });
}

// ---------------------------------------------------------------------------
// AudioSidebarEntry — sidebar nav link
// ---------------------------------------------------------------------------

export function AudioSidebarEntry({ context }) {
  const companyPrefix = context.companyPrefix ?? "";
  const panelPath = companyPrefix ? `/${companyPrefix}/settings/plugins` : "/settings/plugins";
  const isActive = typeof window !== "undefined" && window.location.pathname.includes("audio");

  return _jsxs("a", {
    href: panelPath,
    title: "Panel de Audio",
    "aria-current": isActive ? "page" : undefined,
    style: {
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      borderRadius: 6, textDecoration: "none",
      color: isActive ? COLOR.text : COLOR.textMuted,
      background: isActive ? COLOR.bgHover : "transparent",
      transition: "background 0.15s, color 0.15s",
      fontSize: 13, fontWeight: 500,
    },
    children: [_jsx(MicIcon, { size: 16, color: "currentColor" }), "Audio"],
  });
}
