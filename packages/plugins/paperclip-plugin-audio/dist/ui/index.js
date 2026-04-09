// Plugin Audio — UI
// Fecha: 2026-04-09 | Issue: SEC-215 (Modo 2 auto-send + Modo 3 Voice Chat Mode)
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
const MODE_KEY = `${PLUGIN_ID}:mode`;

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
  voiceChat: "rgba(124,58,237,0.15)",
  voiceChatBorder: "rgba(124,58,237,0.35)",
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

function injectIntoTextarea(ta, text) {
  if (!text || !ta) return;
  const current = ta.value;
  const newValue = current
    ? current.endsWith(" ") ? current + text : current + " " + text
    : text;
  try {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeSetter) nativeSetter.call(ta, newValue);
    else ta.value = newValue;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
    ta.focus();
    ta.setSelectionRange(newValue.length, newValue.length);
  } catch {
    ta.value = newValue;
  }
}

function injectIntoChat(text) {
  if (!text) return;
  const ta = findChatTextarea();
  if (!ta) return;
  injectIntoTextarea(ta, text);
}

/**
 * Inject text into the chat textarea and auto-submit via Ctrl+Enter.
 * Returns true if text was sent, false if textarea not found.
 */
function sendChatMessage(text) {
  if (!text) return false;
  const ta = findChatTextarea();
  if (!ta) return false;

  // First clear any existing content, then set our text
  try {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeSetter) nativeSetter.call(ta, text);
    else ta.value = text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
    ta.focus();
    ta.setSelectionRange(text.length, text.length);
  } catch {
    ta.value = text;
  }

  // Trigger Ctrl+Enter (Paperclip's submit shortcut: e.metaKey || e.ctrlKey)
  setTimeout(() => {
    ta.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    }));
  }, 50);

  return true;
}

/**
 * Find the last agent/assistant message text in the DOM.
 * Uses .paperclip-markdown as the stable selector for MarkdownBody content.
 */
function findLastAgentMessageText() {
  // paperclip-markdown is the class used by MarkdownBody for all prose content
  const elements = document.querySelectorAll(".paperclip-markdown");
  if (!elements.length) return null;

  // Get the last one (most recent message)
  const last = elements[elements.length - 1];
  const text = last.textContent?.trim() ?? "";
  // Filter out very short strings (headers, labels, etc.)
  if (text.length < 20) return null;
  return text;
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

function WaveIcon({ size = 24, active = false }) {
  return _jsxs("svg", {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round",
    "aria-hidden": "true",
    children: [
      _jsx("line", { x1: "2", y1: "12", x2: "2", y2: "12", style: { animation: active ? "wave1 0.6s ease-in-out infinite" : "none" } }),
      _jsx("line", { x1: "6", y1: "8", x2: "6", y2: "16", style: { animation: active ? "wave2 0.6s ease-in-out infinite 0.1s" : "none" } }),
      _jsx("line", { x1: "10", y1: "5", x2: "10", y2: "19", style: { animation: active ? "wave1 0.6s ease-in-out infinite 0.2s" : "none" } }),
      _jsx("line", { x1: "14", y1: "8", x2: "14", y2: "16", style: { animation: active ? "wave2 0.6s ease-in-out infinite 0.15s" : "none" } }),
      _jsx("line", { x1: "18", y1: "10", x2: "18", y2: "14", style: { animation: active ? "wave1 0.6s ease-in-out infinite 0.05s" : "none" } }),
      _jsx("line", { x1: "22", y1: "12", x2: "22", y2: "12", style: { animation: active ? "wave2 0.6s ease-in-out infinite 0.25s" : "none" } }),
    ],
  });
}

// ---------------------------------------------------------------------------
// ModeSelector — tabs for Modo 1 / 2 / 3
// ---------------------------------------------------------------------------

const MODE_LABELS = {
  1: "Dictado",
  2: "Nota + auto-send",
  3: "Voice Chat",
};

function ModeSelector({ mode, onChange }) {
  return _jsxs("div", {
    style: {
      display: "flex",
      gap: 4,
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${COLOR.border}`,
      borderRadius: 8,
      padding: 4,
    },
    "aria-label": "Seleccionar modo",
    children: [1, 2, 3].map((m) =>
      _jsx("button", {
        key: m,
        onClick: () => onChange(m),
        type: "button",
        "aria-pressed": mode === m,
        style: {
          flex: 1,
          padding: "5px 4px",
          borderRadius: 5,
          border: "none",
          background: mode === m ? (m === 3 ? COLOR.accent : "rgba(255,255,255,0.10)") : "transparent",
          color: mode === m ? "#fff" : COLOR.textMuted,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.03em",
          cursor: "pointer",
          transition: "all 0.15s",
          outline: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        },
        children: `M${m}: ${MODE_LABELS[m]}`,
      })
    ),
  });
}

// ---------------------------------------------------------------------------
// DictadoSection — Mode 1: Web Speech API
// ---------------------------------------------------------------------------

function DictadoSection({ defaultLanguage }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
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
// GrabacionSection — Mode 2: MediaRecorder + Whisper (+ auto-send)
// ---------------------------------------------------------------------------

function GrabacionSection({ workerAvailable, defaultLanguage, autoSend = false }) {
  const transcribeAction = usePluginAction(ACTION_KEYS.transcribeAudio);

  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);

  const supported = isMediaRecorderSupported();

  const startRecording = useCallback(async () => {
    if (!supported || recording) return;
    setErrorMsg(null); setTranscript(""); setStatus(null); setSent(false); chunksRef.current = [];

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
        const text = result?.text ?? "";
        setTranscript(text);
        setStatus("done");
        if (autoSend && text.trim()) {
          const ok = sendChatMessage(text.trim());
          setSent(ok);
        } else if (text.trim()) {
          injectIntoChat(text.trim());
        }
      } catch (err) {
        setErrorMsg(err?.message ?? "Error al transcribir el audio");
        setStatus("error");
      }
    };

    recorder.start(500);
    setRecording(true);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => setDuration(Date.now() - startTimeRef.current), 200);
  }, [supported, recording, transcribeAction, autoSend]);

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
        _jsx("p", { style: style.sectionTitle, children: "Grabación de voz" }),
        _jsx("p", { style: { fontSize: 12, color: COLOR.textMuted, margin: 0 }, children: "MediaRecorder no está disponible en este navegador." }),
      ],
    });
  }

  const statusText = recording ? `Grabando… ${formatDuration(duration)}`
    : status === "transcribing" ? "Transcribiendo con Whisper…"
    : status === "done" && sent ? "✓ Mensaje enviado"
    : status === "done" ? "✓ Transcripción lista"
    : status === "error" ? "Error en transcripción"
    : "Listo para grabar";

  return _jsxs("div", {
    style: style.section,
    children: [
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between" },
        children: [
          _jsx("p", { style: style.sectionTitle, children: autoSend ? "Nota de voz (auto-send)" : "Grabación de voz" }),
          !workerAvailable && _jsx("span", {
            style: { ...style.badge, background: "rgba(245,158,11,0.15)", color: COLOR.warning, border: "1px solid rgba(245,158,11,0.3)" },
            children: "Worker pendiente",
          }),
          autoSend && workerAvailable && _jsx("span", {
            style: { ...style.badge, background: "rgba(124,58,237,0.15)", color: COLOR.accent, border: "1px solid rgba(124,58,237,0.3)" },
            children: "Auto-send",
          }),
        ],
      }),
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between" },
        children: [
          _jsx("span", {
            style: { fontSize: 12, color: recording ? COLOR.danger : (status === "done" ? COLOR.success : COLOR.textMuted) },
            children: statusText,
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
      transcript && !autoSend && _jsxs(_Fragment, {
        children: [
          _jsx("textarea", { style: style.textarea, value: transcript, readOnly: true, rows: 3, "aria-label": "Texto transcrito" }),
          _jsxs("div", {
            style: { ...style.row, justifyContent: "flex-end" },
            children: [_jsxs("button", { style: style.btn, onClick: handleCopy, children: [_jsx(CopyIcon, {}), copied ? "¡Copiado!" : "Copiar"] })],
          }),
        ],
      }),
      autoSend && transcript && _jsx("p", {
        style: { fontSize: 11, color: COLOR.textMuted, margin: 0, fontStyle: "italic" },
        children: `Transcrito: "${transcript.substring(0, 60)}${transcript.length > 60 ? "…" : ""}"`,
      }),
      !workerAvailable && _jsx("p", {
        style: { fontSize: 11, color: COLOR.textMuted, margin: 0, fontStyle: "italic" },
        children: "Requiere el worker de audio. Disponible cuando Forge complete la integración con Whisper.",
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
// VoiceChatMode — Mode 3: full hands-free conversation
// States: idle → recording → processing → waiting → speaking → idle
// ---------------------------------------------------------------------------

// State indicators
const VC_STATE_CONFIG = {
  idle:       { label: "Listo — mantén pulsado para hablar", color: COLOR.textMuted, ring: COLOR.border },
  recording:  { label: "Grabando…",                         color: COLOR.danger,     ring: COLOR.danger },
  processing: { label: "Procesando…",                       color: COLOR.warning,    ring: COLOR.warning },
  waiting:    { label: "Esperando respuesta…",              color: COLOR.accent,     ring: COLOR.accent },
  speaking:   { label: "Reproduciendo respuesta…",          color: COLOR.success,    ring: COLOR.success },
};

function VoiceChatMode({ workerAvailable, defaultLanguage, agentId, onExit }) {
  const transcribeAction = usePluginAction(ACTION_KEYS.transcribeAudio);
  const synthesizeAction = usePluginAction(ACTION_KEYS.synthesizeSpeech);

  const [vcState, setVcState] = useState("idle");
  const [errorMsg, setErrorMsg] = useState(null);
  const [lastSent, setLastSent] = useState("");
  const [lastResponse, setLastResponse] = useState("");

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const holdingRef = useRef(false);
  const sentAtRef = useRef(null);
  const observerRef = useRef(null);
  const responseTimeoutRef = useRef(null);
  const streamRef = useRef(null);

  // Auto-play TTS when agent responds — DOM observation via .paperclip-markdown
  const startWaitingForResponse = useCallback((sentText) => {
    setVcState("waiting");
    sentAtRef.current = Date.now();

    // Snapshot of existing .paperclip-markdown nodes before the response arrives
    const existingNodes = new Set(Array.from(document.querySelectorAll(".paperclip-markdown")));

    const synthesize = async (text) => {
      if (!text || !workerAvailable) { setVcState("idle"); return; }
      setVcState("speaking");
      setLastResponse(text);
      try {
        const result = await synthesizeAction({ text: text.substring(0, 500), agentId });
        const { audioBase64, mimeType: mime } = result ?? {};
        if (!audioBase64) { setVcState("idle"); return; }
        const dataUrl = `data:${mime ?? "audio/mpeg"};base64,${audioBase64}`;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = dataUrl;
          audioRef.current.onended = () => setVcState("idle");
          audioRef.current.onerror = () => setVcState("idle");
          await audioRef.current.play();
        }
      } catch {
        setVcState("idle");
      }
    };

    // MutationObserver: watch for new .paperclip-markdown nodes
    const observer = new MutationObserver(() => {
      const allNodes = document.querySelectorAll(".paperclip-markdown");
      for (const node of allNodes) {
        if (!existingNodes.has(node)) {
          const text = node.textContent?.trim() ?? "";
          if (text.length >= 20) {
            // Found new agent response — wait a bit for it to finish streaming
            clearTimeout(responseTimeoutRef.current);
            responseTimeoutRef.current = setTimeout(() => {
              // Re-read text after brief delay (streaming may have added more)
              const finalText = node.textContent?.trim() ?? "";
              if (finalText.length >= 20) {
                observer.disconnect();
                observerRef.current = null;
                synthesize(finalText);
              }
            }, 1500);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    observerRef.current = observer;

    // Timeout after 30s — give up waiting
    responseTimeoutRef.current = setTimeout(() => {
      observer.disconnect();
      observerRef.current = null;
      setVcState("idle");
    }, 30000);
  }, [workerAvailable, agentId, synthesizeAction]);

  const stopObserver = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    clearTimeout(responseTimeoutRef.current);
  }, []);

  // Hold-to-talk: start recording on pointerdown
  const handlePointerDown = useCallback(async (e) => {
    if (e.button !== undefined && e.button !== 0) return; // left click / touch only
    if (vcState !== "idle") return;
    e.preventDefault();
    holdingRef.current = true;
    setErrorMsg(null);

    if (!workerAvailable) {
      setErrorMsg("Worker de audio no disponible.");
      return;
    }

    chunksRef.current = [];
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch {
      setErrorMsg("Permiso de micrófono denegado.");
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (!holdingRef.current && chunksRef.current.length === 0) { setVcState("idle"); return; }
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const base64 = await blobToBase64(blob);
      setVcState("processing");
      try {
        const result = await transcribeAction({ audioBase64: base64, mimeType });
        const text = result?.text?.trim() ?? "";
        if (text) {
          setLastSent(text);
          const ok = sendChatMessage(text);
          if (ok) {
            startWaitingForResponse(text);
          } else {
            setVcState("idle");
            setErrorMsg("No se encontró el chat. Abre una conversación.");
          }
        } else {
          setVcState("idle");
        }
      } catch (err) {
        setErrorMsg(err?.message ?? "Error al transcribir");
        setVcState("idle");
      }
    };

    recorder.start(300);
    setVcState("recording");
  }, [vcState, workerAvailable, transcribeAction, startWaitingForResponse]);

  // Release: stop recording
  const handlePointerUp = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    stopObserver();
    audioRef.current?.pause();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [stopObserver]);

  // Add global pointerup to handle releases outside the button
  useEffect(() => {
    const up = () => handlePointerUp();
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [handlePointerUp]);

  const cfg = VC_STATE_CONFIG[vcState] ?? VC_STATE_CONFIG.idle;
  const isActive = vcState !== "idle";
  const bigBtnSize = 80;

  return _jsxs("div", {
    style: {
      ...style.section,
      background: `rgba(124,58,237,0.06)`,
      border: `1px solid ${COLOR.voiceChatBorder}`,
      gap: 12,
    },
    children: [
      // Header
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between" },
        children: [
          _jsx("p", { style: { ...style.sectionTitle, color: COLOR.accent }, children: "Voice Chat Mode" }),
          _jsx("button", {
            onClick: () => {
              stopObserver();
              audioRef.current?.pause();
              streamRef.current?.getTracks().forEach((t) => t.stop());
              if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
              onExit();
            },
            type: "button",
            style: { ...style.btn, fontSize: 11, padding: "4px 10px" },
            children: "✕ Salir",
          }),
        ],
      }),

      // State indicator
      _jsx("div", {
        style: {
          textAlign: "center",
          fontSize: 12,
          color: cfg.color,
          fontWeight: 500,
          minHeight: 18,
          transition: "color 0.2s",
        },
        "aria-live": "polite",
        children: cfg.label,
      }),

      // Big hold-to-talk button
      _jsx("div", {
        style: { display: "flex", justifyContent: "center", padding: "4px 0" },
        children: _jsx("button", {
          onPointerDown: handlePointerDown,
          onPointerUp: handlePointerUp,
          onContextMenu: (e) => e.preventDefault(),
          disabled: vcState === "processing" || vcState === "waiting" || vcState === "speaking",
          type: "button",
          "aria-label": vcState === "recording" ? "Suelta para enviar" : "Mantén pulsado para hablar",
          style: {
            width: bigBtnSize,
            height: bigBtnSize,
            borderRadius: "50%",
            border: `2px solid ${cfg.ring}`,
            background: vcState === "recording"
              ? COLOR.dangerLight
              : vcState === "speaking"
              ? "rgba(34,197,94,0.12)"
              : vcState === "processing" || vcState === "waiting"
              ? "rgba(124,58,237,0.12)"
              : COLOR.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: (vcState === "processing" || vcState === "waiting" || vcState === "speaking") ? "default" : "pointer",
            outline: "none",
            boxShadow: vcState === "recording"
              ? `0 0 0 6px rgba(239,68,68,0.15), 0 0 0 12px rgba(239,68,68,0.07)`
              : vcState === "speaking"
              ? `0 0 0 6px rgba(34,197,94,0.12)`
              : "none",
            transition: "all 0.2s",
            opacity: (vcState === "processing" || vcState === "waiting") ? 0.7 : 1,
          },
          children: vcState === "recording"
            ? _jsx(StopIcon, { size: 28 })
            : vcState === "speaking"
            ? _jsx(WaveIcon, { size: 28, active: true })
            : _jsx(MicIcon, { size: 32, color: vcState === "idle" ? COLOR.textMuted : cfg.color }),
        }),
      }),

      // Hint
      _jsx("p", {
        style: { fontSize: 11, color: COLOR.textMuted, margin: 0, textAlign: "center", fontStyle: "italic" },
        children: vcState === "idle"
          ? "Mantén pulsado el botón para grabar. Suelta para enviar."
          : vcState === "recording"
          ? "Suelta para enviar…"
          : vcState === "processing"
          ? "Transcribiendo y enviando…"
          : vcState === "waiting"
          ? "El agente está respondiendo…"
          : "Reproduciéndose la respuesta…",
      }),

      // Last exchange (debug/info)
      (lastSent || lastResponse) && _jsxs("div", {
        style: { borderTop: `1px solid ${COLOR.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 },
        children: [
          lastSent && _jsxs("div", {
            style: { fontSize: 11, color: COLOR.textMuted },
            children: [
              _jsx("span", { style: { fontWeight: 600 }, children: "Tú: " }),
              `"${lastSent.substring(0, 80)}${lastSent.length > 80 ? "…" : ""}"`,
            ],
          }),
          lastResponse && _jsxs("div", {
            style: { fontSize: 11, color: COLOR.textMuted },
            children: [
              _jsx("span", { style: { fontWeight: 600 }, children: "Agente: " }),
              `"${lastResponse.substring(0, 80)}${lastResponse.length > 80 ? "…" : ""}"`,
            ],
          }),
        ],
      }),

      errorMsg && _jsx("span", { style: { fontSize: 11, color: COLOR.danger }, children: errorMsg }),

      !workerAvailable && _jsx("p", {
        style: { fontSize: 11, color: COLOR.warning, margin: 0 },
        children: "Worker de audio no disponible. Voice Chat requiere Whisper + TTS.",
      }),

      _jsx("audio", { ref: audioRef, style: { display: "none" }, preload: "none" }),
    ],
  });
}

// ---------------------------------------------------------------------------
// AudioChatInputButton — floating mic button injected on EVERY visible textarea
// Slot: globalToolbarButton — mounts globally on every page (SEC-212 fix)
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

    const BTN_SIZE = 30;
    const MARGIN = 6;
    const MIC_SVG =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>' +
      '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
      '<line x1="12" y1="19" x2="12" y2="23"/>' +
      '<line x1="8" y1="23" x2="16" y2="23"/>' +
      "</svg>";

    const injected = new WeakSet();
    const containerMap = new Map();
    let activeRecognition = null;
    let activeContainer = null;

    function idleStyle(btn) {
      btn.style.cssText =
        `width:${BTN_SIZE}px;height:${BTN_SIZE}px;border-radius:50%;display:flex;align-items:center;justify-content:center;` +
        "cursor:pointer;border:1.5px solid rgba(255,255,255,0.18);background:rgba(30,30,40,0.85);" +
        "color:rgba(255,255,255,0.55);outline:none;padding:0;pointer-events:all;" +
        "box-shadow:0 1px 4px rgba(0,0,0,0.3);transition:background 0.15s,border-color 0.15s,box-shadow 0.2s;";
    }

    function recordingStyle(btn) {
      btn.style.cssText =
        `width:${BTN_SIZE}px;height:${BTN_SIZE}px;border-radius:50%;display:flex;align-items:center;justify-content:center;` +
        "cursor:pointer;border:1.5px solid #ef4444;background:rgba(239,68,68,0.18);" +
        "color:#ef4444;outline:none;padding:0;pointer-events:all;" +
        "box-shadow:0 0 0 3px rgba(239,68,68,0.22),0 1px 4px rgba(0,0,0,0.3);transition:background 0.15s,border-color 0.15s,box-shadow 0.2s;";
    }

    function stopActiveRecognition() {
      if (activeRecognition) {
        try { activeRecognition.stop(); } catch {}
        activeRecognition = null;
      }
      if (activeContainer) {
        const b = activeContainer.firstElementChild;
        if (b) idleStyle(b);
        activeContainer = null;
      }
    }

    function positionContainer(ta, container) {
      if (!ta.isConnected || ta.offsetParent === null) {
        container.style.display = "none";
        return;
      }
      const rect = ta.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { container.style.display = "none"; return; }
      container.style.display = "flex";
      container.style.left = rect.right - BTN_SIZE - MARGIN + "px";
      container.style.top = rect.bottom - BTN_SIZE - MARGIN + "px";
      container.style.width = BTN_SIZE + "px";
      container.style.height = BTN_SIZE + "px";
    }

    function addMicButton(ta) {
      if (injected.has(ta)) return;
      injected.add(ta);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", "Dictado por voz");
      btn.title = "Dictado por voz";
      btn.innerHTML = MIC_SVG;
      idleStyle(btn);

      const container = document.createElement("div");
      container.className = "paperclip-audio-mic-float";
      container.style.cssText =
        "position:fixed;z-index:9999;pointer-events:none;display:none;" +
        "align-items:center;justify-content:center;";
      container.appendChild(btn);
      document.body.appendChild(container);
      containerMap.set(ta, container);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeRecognition && activeContainer === container) {
          stopActiveRecognition();
          return;
        }
        stopActiveRecognition();

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SR();
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
          if (activeRecognition === recognition) { activeRecognition = null; activeContainer = null; }
          idleStyle(btn);
          if (finalText.trim()) injectIntoTextarea(ta, finalText.trim());
        };
        recognition.onerror = (ev) => {
          if (ev.error !== "no-speech") console.warn("[audio-plugin]", ev.error);
          if (activeRecognition === recognition) { activeRecognition = null; activeContainer = null; }
          idleStyle(btn);
        };

        recognition.start();
        activeRecognition = recognition;
        activeContainer = container;
        recordingStyle(btn);
      });
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
      btn.addEventListener("touchstart", (e) => { e.preventDefault(); }, { passive: false });

      positionContainer(ta, container);
    }

    function repositionAll() {
      containerMap.forEach((container, ta) => positionContainer(ta, container));
    }

    function scanTextareas() {
      document.querySelectorAll("textarea").forEach((ta) => {
        if (ta.offsetParent !== null) addMicButton(ta);
      });
      repositionAll();
    }

    scanTextareas();
    window.addEventListener("resize", repositionAll);
    const observer = new MutationObserver(scanTextareas);
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
    const poll = setInterval(repositionAll, 1500);

    return () => {
      clearInterval(poll);
      window.removeEventListener("resize", repositionAll);
      observer.disconnect();
      stopActiveRecognition();
      containerMap.forEach((container) => {
        if (container.parentNode) container.parentNode.removeChild(container);
      });
    };
  }, [defaultLanguage]);

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
  const { entityId } = useHostContext();

  const [mode, setMode] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem(MODE_KEY) ?? "1", 10);
      return [1, 2, 3].includes(saved) ? saved : 1;
    } catch { return 1; }
  });

  // Mode 3 active state (within panel, not separate page)
  const [voiceChatActive, setVoiceChatActive] = useState(false);

  const handleModeChange = (m) => {
    setMode(m);
    try { localStorage.setItem(MODE_KEY, String(m)); } catch {}
    if (m === 3) setVoiceChatActive(true);
    else setVoiceChatActive(false);
  };

  // When mode 3 is selected but user hasn't clicked "Iniciar" yet
  const handleStartVoiceChat = () => setVoiceChatActive(true);
  const handleExitVoiceChat = () => { setVoiceChatActive(false); setMode(1); try { localStorage.setItem(MODE_KEY, "1"); } catch {} };

  return _jsxs("div", {
    style: style.panel,
    children: [
      // Header
      _jsxs("div", {
        style: { ...style.row, justifyContent: "space-between", marginBottom: 2 },
        children: [
          _jsx("span", { style: { fontSize: 13, fontWeight: 600, color: COLOR.text }, children: "Audio" }),
          workerAvailable
            ? _jsx("span", { style: { ...style.badge, background: "rgba(34,197,94,0.12)", color: COLOR.success, border: "1px solid rgba(34,197,94,0.25)" }, children: "Worker activo" })
            : _jsx("span", { style: { ...style.badge, background: "rgba(245,158,11,0.12)", color: COLOR.warning, border: "1px solid rgba(245,158,11,0.25)" }, children: "Solo Nivel 1" }),
        ],
      }),

      // Mode selector
      _jsx(ModeSelector, { mode, onChange: handleModeChange }),

      // Mode 1: Dictado
      mode === 1 && _jsx(DictadoSection, { defaultLanguage }),

      // Mode 2: Nota de voz con auto-send
      mode === 2 && _jsx(GrabacionSection, { workerAvailable, defaultLanguage, autoSend: true }),

      // Mode 3: Voice Chat — either CTA button or full VC panel
      mode === 3 && !voiceChatActive && _jsxs("div", {
        style: {
          ...style.section,
          background: "rgba(124,58,237,0.06)",
          border: `1px solid ${COLOR.voiceChatBorder}`,
          alignItems: "center",
          gap: 12,
          padding: "20px 16px",
        },
        children: [
          _jsx("p", { style: { ...style.sectionTitle, color: COLOR.accent, textAlign: "center" }, children: "Voice Chat Mode" }),
          _jsx("p", { style: { fontSize: 12, color: COLOR.textMuted, textAlign: "center", margin: 0 }, children: "Conversa con el agente completamente por voz. Habla y el agente te responderá en audio." }),
          _jsx("button", {
            onClick: handleStartVoiceChat,
            type: "button",
            style: {
              ...style.btn,
              ...style.btnPrimary,
              padding: "10px 24px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              gap: 8,
            },
            children: _jsxs(_Fragment, {
              children: [_jsx(MicIcon, { size: 16, color: "#fff" }), "Iniciar conversación por voz"],
            }),
          }),
          !workerAvailable && _jsx("p", {
            style: { fontSize: 11, color: COLOR.warning, margin: 0, textAlign: "center" },
            children: "Requiere worker de audio (Whisper + TTS).",
          }),
        ],
      }),

      mode === 3 && voiceChatActive && _jsx(VoiceChatMode, {
        workerAvailable,
        defaultLanguage,
        agentId: entityId ?? "",
        onExit: handleExitVoiceChat,
      }),

      // Show TTS section in Mode 1 & 2 for manual use
      (mode === 1 || mode === 2) && _jsx(TtsSection, { workerAvailable }),
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
