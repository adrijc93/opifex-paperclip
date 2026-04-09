// Plugin Audio — UI source (TypeScript/TSX)
// Fecha: 2026-04-09 | Issue: SEC-215 (Modo 2 auto-send + Modo 3 Voice Chat Mode)
// Estado: Listo para producción
// Criterio de ejecución: compilar con tsc cuando se añada tsconfig.json para este paquete

/**
 * Plugin Audio — componentes de UI
 *
 * Modo 1: Dictado por voz vía Web Speech API (sólo frontend, sin worker)
 * Modo 2: Grabación tipo WhatsApp + transcripción Whisper + auto-send (worker SEC-202)
 * Modo 3: Voice Chat Mode — hold-to-talk + auto-TTS de respuestas del agente
 *
 * NOTA: No existe slot chatInput en el SDK actual, por lo que la UI
 * se implementa como sidebarPanel.
 */

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import {
  useHostContext,
  usePluginData,
  usePluginAction,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";

// ---------------------------------------------------------------------------
// Chat textarea helpers
// ---------------------------------------------------------------------------

function findChatTextarea(): HTMLTextAreaElement | null {
  const selectors = [
    'textarea[data-chat-input]',
    'textarea[data-testid="chat-input"]',
    '[data-chat-input] textarea',
    'textarea[placeholder]',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector<HTMLTextAreaElement>(sel);
      if (el && el.offsetParent !== null) return el;
    } catch {}
  }
  const all = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'));
  return all.reverse().find((el) => el.offsetParent !== null) ?? null;
}

function injectIntoTextarea(ta: HTMLTextAreaElement, text: string): void {
  if (!text || !ta) return;
  const current = ta.value;
  const newValue = current
    ? current.endsWith(' ') ? current + text : current + ' ' + text
    : text;
  try {
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

function injectIntoChat(text: string): void {
  if (!text) return;
  const ta = findChatTextarea();
  if (!ta) return;
  injectIntoTextarea(ta, text);
}

/**
 * Inject text into the chat textarea and auto-submit via Ctrl+Enter.
 */
function sendChatMessage(text: string): boolean {
  if (!text) return false;
  const ta = findChatTextarea();
  if (!ta) return false;

  try {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(ta, text);
    else ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.focus();
    ta.setSelectionRange(text.length, text.length);
  } catch {
    ta.value = text;
  }

  // Trigger Ctrl+Enter (Paperclip's submit shortcut)
  setTimeout(() => {
    ta.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ctrlKey: true,
    }));
  }, 50);

  return true;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_ID = "paperclip-plugin-audio";

const ACTION_KEYS = {
  transcribeAudio: "transcribeAudio",
  synthesizeSpeech: "synthesizeSpeech",
} as const;

const DATA_KEYS = {
  config: "audio-config",
} as const;

const MODE_KEY = `${PLUGIN_ID}:mode`;
const AUTOPLAY_KEY = `${PLUGIN_ID}:autoPlayTTS`;

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const C = {
  bg: "rgba(255,255,255,0.04)",
  bgHover: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  text: "rgba(255,255,255,0.90)",
  muted: "rgba(255,255,255,0.50)",
  accent: "#7c3aed",
  danger: "#ef4444",
  dangerLight: "rgba(239,68,68,0.15)",
  success: "#22c55e",
  warning: "#f59e0b",
  vcBorder: "rgba(124,58,237,0.35)",
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta); ta.select();
  document.execCommand("copy"); document.body.removeChild(ta);
}

function isSpeechSupported(): boolean {
  return typeof window !== "undefined" &&
    (typeof (window as any).SpeechRecognition !== "undefined" ||
      typeof (window as any).webkitSpeechRecognition !== "undefined");
}

function isMediaRecorderSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as any).MediaRecorder !== "undefined";
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function MicIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StopIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function PlayIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const S: Record<string, CSSProperties> = {
  panel: { display: "flex", flexDirection: "column", gap: 12, padding: "12px 10px", fontSize: 13, color: C.text, minHeight: 0, overflowY: "auto" },
  section: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 },
  title: { fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: C.muted, margin: 0 } as CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8 },
  btn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, fontWeight: 500, cursor: "pointer", outline: "none" },
  btnPrimary: { background: C.accent, borderColor: C.accent, color: "#fff" },
  btnDanger: { background: C.dangerLight, borderColor: C.danger, color: C.danger },
  micBtn: { width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", outline: "none", flexShrink: 0 },
  textarea: { width: "100%", minHeight: 70, padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 12, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" } as CSSProperties,
  muted: { fontSize: 11, color: C.muted, margin: 0, fontStyle: "italic" },
  badge: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em" },
};

// ---------------------------------------------------------------------------
// ModeSelector
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<number, string> = { 1: "Dictado", 2: "Nota+Send", 3: "Voice Chat" };

function ModeSelector({ mode, onChange }: { mode: number; onChange: (m: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: 4 }}
      aria-label="Seleccionar modo">
      {[1, 2, 3].map((m) => (
        <button key={m} onClick={() => onChange(m)} type="button" aria-pressed={mode === m}
          style={{
            flex: 1, padding: "5px 4px", borderRadius: 5, border: "none",
            background: mode === m ? (m === 3 ? C.accent : "rgba(255,255,255,0.10)") : "transparent",
            color: mode === m ? "#fff" : C.muted,
            fontSize: 10, fontWeight: 600, cursor: "pointer", outline: "none",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
          {`M${m}: ${MODE_LABELS[m]}`}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DictadoSection — Mode 1
// ---------------------------------------------------------------------------

function DictadoSection({ defaultLanguage }: { defaultLanguage: string }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const supported = isSpeechSupported();

  const toggle = useCallback(() => {
    if (!supported) return;
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new SR();
    r.lang = defaultLanguage || "es-ES";
    r.interimResults = true;
    r.continuous = false;
    recognitionRef.current = r;
    let final = "";

    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const c = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += c; else interim += c;
      }
      setTranscript(final + interim);
    };
    r.onend = () => { setListening(false); if (final) { setTranscript(final); injectIntoChat(final); } };
    r.onerror = (e: any) => { setListening(false); if (e.error !== "no-speech") setError(`Error: ${e.error}`); };

    setError(null); setTranscript(""); r.start(); setListening(true);
  }, [listening, supported, defaultLanguage]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  if (!supported) return (
    <div style={S.section}>
      <p style={S.title}>Dictado por voz</p>
      <p style={S.muted}>Tu navegador no soporta Web Speech API. Usa Chrome o Edge.</p>
    </div>
  );

  return (
    <div style={S.section}>
      <p style={S.title}>Dictado por voz</p>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            {listening ? "Escuchando…" : transcript ? "✓ Texto enviado al chat" : `Idioma: ${defaultLanguage || "es-ES"}`}
          </span>
          {error && <span style={{ fontSize: 11, color: C.danger }}>{error}</span>}
        </div>
        <button onClick={toggle} onContextMenu={(e) => e.preventDefault()}
          onTouchStart={(e) => { e.preventDefault(); toggle(); }} type="button"
          aria-label={listening ? "Detener dictado" : "Iniciar dictado"}
          style={{
            ...S.micBtn,
            background: listening ? C.dangerLight : C.bg,
            border: `2px solid ${listening ? C.danger : C.border}`,
            boxShadow: listening ? `0 0 0 4px rgba(239,68,68,0.15), 0 0 0 8px rgba(239,68,68,0.08)` : "none",
          }}>
          <MicIcon size={22} color={listening ? C.danger : C.muted} />
        </button>
      </div>
      {!listening && !transcript && <p style={S.muted}>Click para dictar. El texto aparecerá en el chat directamente.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GrabacionSection — Mode 2 (with optional autoSend)
// ---------------------------------------------------------------------------

function GrabacionSection({ workerAvailable, defaultLanguage, autoSend = false }:
  { workerAvailable: boolean; defaultLanguage: string; autoSend?: boolean }) {
  const transcribeAction = usePluginAction(ACTION_KEYS.transcribeAudio);
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<"idle" | "transcribing" | "done" | "error">("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const supported = isMediaRecorderSupported();

  const startRecording = useCallback(async () => {
    if (!supported || recording || !workerAvailable) return;
    setErrorMsg(null); setTranscript(""); setStatus("idle"); setSent(false); chunksRef.current = [];

    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setErrorMsg("Permiso de micrófono denegado."); return; }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const base64 = await blobToBase64(blob);
      setStatus("transcribing");
      try {
        const result = await transcribeAction({ audioBase64: base64, mimeType }) as { text: string } | undefined;
        const text = result?.text ?? "";
        setTranscript(text); setStatus("done");
        if (autoSend && text.trim()) { const ok = sendChatMessage(text.trim()); setSent(ok); }
        else if (text.trim()) injectIntoChat(text.trim());
      } catch (err: any) { setErrorMsg(err?.message ?? "Error al transcribir"); setStatus("error"); }
    };

    recorder.start(500);
    setRecording(true);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => setDuration(Date.now() - startRef.current), 200);
  }, [supported, recording, workerAvailable, transcribeAction, autoSend]);

  const stopRecording = useCallback(() => {
    if (!recording) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false); setDuration(0);
    recorderRef.current?.stop();
  }, [recording]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
  }, []);

  if (!supported) return (
    <div style={S.section}>
      <p style={S.title}>Grabación de voz</p>
      <p style={S.muted}>MediaRecorder no disponible en este navegador.</p>
    </div>
  );

  const statusText = recording ? `Grabando… ${formatDuration(duration)}`
    : status === "transcribing" ? "Transcribiendo con Whisper…"
    : status === "done" && sent ? "✓ Mensaje enviado"
    : status === "done" ? "✓ Transcripción lista"
    : status === "error" ? "Error en transcripción"
    : "Listo para grabar";

  return (
    <div style={S.section}>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <p style={S.title}>{autoSend ? "Nota de voz (auto-send)" : "Grabación de voz"}</p>
        {autoSend && workerAvailable && (
          <span style={{ ...S.badge, background: "rgba(124,58,237,0.15)", color: C.accent, border: "1px solid rgba(124,58,237,0.3)" }}>Auto-send</span>
        )}
        {!workerAvailable && (
          <span style={{ ...S.badge, background: "rgba(245,158,11,0.15)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)" }}>Worker pendiente</span>
        )}
      </div>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: recording ? C.danger : (status === "done" ? C.success : C.muted) }}>{statusText}</span>
        <button onClick={recording ? stopRecording : startRecording}
          disabled={!workerAvailable || status === "transcribing"}
          aria-label={recording ? "Detener grabación" : "Iniciar grabación"}
          style={{
            ...S.micBtn,
            background: recording ? C.dangerLight : C.bg,
            border: `2px solid ${recording ? C.danger : C.border}`,
            boxShadow: recording ? `0 0 0 4px rgba(239,68,68,0.15), 0 0 0 8px rgba(239,68,68,0.08)` : "none",
            opacity: (!workerAvailable || status === "transcribing") ? 0.5 : 1,
          }}>
          {recording ? <StopIcon size={18} /> : <MicIcon size={22} color={C.muted} />}
        </button>
      </div>
      {errorMsg && <span style={{ fontSize: 11, color: C.danger }}>{errorMsg}</span>}
      {transcript && !autoSend && (
        <>
          <textarea style={S.textarea} value={transcript} readOnly rows={3} aria-label="Texto transcrito" />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={S.btn} onClick={async () => { try { await copyToClipboard(transcript); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}>
              <CopyIcon /> {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
        </>
      )}
      {autoSend && transcript && (
        <p style={S.muted}>{`Transcrito: "${transcript.substring(0, 60)}${transcript.length > 60 ? "…" : ""}"`}</p>
      )}
      {!workerAvailable && <p style={S.muted}>Requiere worker de audio (SEC-202).</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TtsSection — manual TTS playback
// ---------------------------------------------------------------------------

function TtsSection({ workerAvailable }: { workerAvailable: boolean }) {
  const synthesizeAction = usePluginAction(ACTION_KEYS.synthesizeSpeech);
  const { entityId } = useHostContext();
  const [text, setText] = useState("");
  const [agentId, setAgentId] = useState(entityId ?? "");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(() => { try { return localStorage.getItem(AUTOPLAY_KEY) === "true"; } catch { return false; } });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { try { localStorage.setItem(AUTOPLAY_KEY, String(autoPlay)); } catch {} }, [autoPlay]);
  useEffect(() => { if (entityId) setAgentId(entityId); }, [entityId]);

  const handlePlay = async () => {
    if (!text.trim() || !workerAvailable) return;
    setErrorMsg(null); setLoading(true);
    try {
      const result = await synthesizeAction({ text: text.trim(), agentId }) as { audioBase64: string; mimeType: string } | undefined;
      if (!result?.audioBase64) throw new Error("No se recibió audio del servidor");
      const dataUrl = `data:${result.mimeType ?? "audio/mpeg"};base64,${result.audioBase64}`;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = dataUrl;
        audioRef.current.onplay = () => setPlaying(true);
        audioRef.current.onended = () => setPlaying(false);
        audioRef.current.onerror = () => { setPlaying(false); setErrorMsg("Error al reproducir el audio"); };
        await audioRef.current.play();
      }
    } catch (err: any) { setErrorMsg(err?.message ?? "Error en TTS"); }
    finally { setLoading(false); }
  };

  return (
    <div style={S.section}>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <p style={S.title}>Text-to-Speech</p>
        {!workerAvailable && <span style={{ ...S.badge, background: "rgba(245,158,11,0.15)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)" }}>Worker pendiente</span>}
      </div>
      <textarea style={{ ...S.textarea, opacity: workerAvailable ? 1 : 0.6 }} value={text}
        onChange={(e) => setText(e.target.value)} placeholder="Pega aquí el texto del agente…" rows={3}
        disabled={!workerAvailable} aria-label="Texto para sintetizar" />
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: C.muted, userSelect: "none" }}>
          <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} style={{ accentColor: C.accent }} />
          Auto-play
        </label>
        {playing
          ? <button style={{ ...S.btn, ...S.btnDanger }} onClick={() => { audioRef.current?.pause(); setPlaying(false); }}><StopIcon /> Detener</button>
          : <button style={{ ...S.btn, ...(workerAvailable && text.trim() ? S.btnPrimary : {}), opacity: (!workerAvailable || !text.trim() || loading) ? 0.5 : 1 }}
              onClick={handlePlay} disabled={!workerAvailable || !text.trim() || loading}>
              {loading ? "Generando…" : <><PlayIcon /> Reproducir</>}
            </button>
        }
      </div>
      {errorMsg && <span style={{ fontSize: 11, color: C.danger }}>{errorMsg}</span>}
      <audio ref={audioRef} style={{ display: "none" }} preload="none" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VoiceChatMode — Mode 3
// ---------------------------------------------------------------------------

type VCState = "idle" | "recording" | "processing" | "waiting" | "speaking";

const VC_STATE_CONFIG: Record<VCState, { label: string; color: string; ring: string }> = {
  idle:       { label: "Listo — mantén pulsado para hablar", color: "rgba(255,255,255,0.50)", ring: "rgba(255,255,255,0.10)" },
  recording:  { label: "Grabando…",                         color: "#ef4444",                ring: "#ef4444" },
  processing: { label: "Procesando…",                       color: "#f59e0b",                ring: "#f59e0b" },
  waiting:    { label: "Esperando respuesta…",              color: "#7c3aed",                ring: "#7c3aed" },
  speaking:   { label: "Reproduciendo respuesta…",          color: "#22c55e",                ring: "#22c55e" },
};

function VoiceChatMode({ workerAvailable, defaultLanguage, agentId, onExit }:
  { workerAvailable: boolean; defaultLanguage: string; agentId: string; onExit: () => void }) {
  const transcribeAction = usePluginAction(ACTION_KEYS.transcribeAudio);
  const synthesizeAction = usePluginAction(ACTION_KEYS.synthesizeSpeech);
  const [vcState, setVcState] = useState<VCState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState("");
  const [lastResponse, setLastResponse] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const holdingRef = useRef(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopObserver = useCallback(() => {
    observerRef.current?.disconnect(); observerRef.current = null;
    if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current);
  }, []);

  const startWaitingForResponse = useCallback((sentText: string) => {
    setVcState("waiting");
    const existingNodes = new Set(Array.from(document.querySelectorAll(".paperclip-markdown")));

    const synthesize = async (text: string) => {
      if (!text || !workerAvailable) { setVcState("idle"); return; }
      setVcState("speaking");
      setLastResponse(text);
      try {
        const result = await synthesizeAction({ text: text.substring(0, 500), agentId }) as { audioBase64: string; mimeType: string } | undefined;
        if (!result?.audioBase64) { setVcState("idle"); return; }
        const dataUrl = `data:${result.mimeType ?? "audio/mpeg"};base64,${result.audioBase64}`;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = dataUrl;
          audioRef.current.onended = () => setVcState("idle");
          audioRef.current.onerror = () => setVcState("idle");
          await audioRef.current.play();
        }
      } catch { setVcState("idle"); }
    };

    const observer = new MutationObserver(() => {
      const allNodes = document.querySelectorAll(".paperclip-markdown");
      for (const node of allNodes) {
        if (!existingNodes.has(node)) {
          const text = node.textContent?.trim() ?? "";
          if (text.length >= 20) {
            clearTimeout(responseTimeoutRef.current!);
            responseTimeoutRef.current = setTimeout(() => {
              const finalText = node.textContent?.trim() ?? "";
              if (finalText.length >= 20) {
                observer.disconnect(); observerRef.current = null;
                synthesize(finalText);
              }
            }, 1500);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    observerRef.current = observer;
    responseTimeoutRef.current = setTimeout(() => { observer.disconnect(); observerRef.current = null; setVcState("idle"); }, 30000);
  }, [workerAvailable, agentId, synthesizeAction]);

  const handlePointerDown = useCallback(async (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (vcState !== "idle") return;
    e.preventDefault();
    holdingRef.current = true;
    setErrorMsg(null);

    if (!workerAvailable) { setErrorMsg("Worker de audio no disponible."); return; }

    chunksRef.current = [];
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream; }
    catch { setErrorMsg("Permiso de micrófono denegado."); return; }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (chunksRef.current.length === 0) { setVcState("idle"); return; }
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const base64 = await blobToBase64(blob);
      setVcState("processing");
      try {
        const result = await transcribeAction({ audioBase64: base64, mimeType }) as { text: string } | undefined;
        const text = result?.text?.trim() ?? "";
        if (text) {
          setLastSent(text);
          const ok = sendChatMessage(text);
          if (ok) startWaitingForResponse(text);
          else { setVcState("idle"); setErrorMsg("No se encontró el chat. Abre una conversación."); }
        } else { setVcState("idle"); }
      } catch (err: any) { setErrorMsg(err?.message ?? "Error al transcribir"); setVcState("idle"); }
    };

    recorder.start(300);
    setVcState("recording");
  }, [vcState, workerAvailable, transcribeAction, startWaitingForResponse]);

  const handlePointerUp = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  useEffect(() => () => {
    stopObserver();
    audioRef.current?.pause();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [stopObserver]);

  useEffect(() => {
    const up = () => handlePointerUp();
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [handlePointerUp]);

  const cfg = VC_STATE_CONFIG[vcState];
  const disabled = vcState === "processing" || vcState === "waiting" || vcState === "speaking";

  return (
    <div style={{ ...S.section, background: "rgba(124,58,237,0.06)", border: `1px solid ${C.vcBorder}`, gap: 12 }}>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <p style={{ ...S.title, color: C.accent }}>Voice Chat Mode</p>
        <button onClick={() => { stopObserver(); audioRef.current?.pause(); streamRef.current?.getTracks().forEach((t) => t.stop()); if (recorderRef.current?.state === "recording") recorderRef.current.stop(); onExit(); }}
          type="button" style={{ ...S.btn, fontSize: 11, padding: "4px 10px" }}>✕ Salir</button>
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: cfg.color, fontWeight: 500, minHeight: 18 }} aria-live="polite">
        {cfg.label}
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        <button onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()} disabled={disabled} type="button"
          aria-label={vcState === "recording" ? "Suelta para enviar" : "Mantén pulsado para hablar"}
          style={{
            width: 80, height: 80, borderRadius: "50%",
            border: `2px solid ${cfg.ring}`,
            background: vcState === "recording" ? C.dangerLight : vcState === "speaking" ? "rgba(34,197,94,0.12)" : (disabled ? "rgba(124,58,237,0.12)" : C.bg),
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: disabled ? "default" : "pointer", outline: "none",
            boxShadow: vcState === "recording" ? `0 0 0 6px rgba(239,68,68,0.15), 0 0 0 12px rgba(239,68,68,0.07)` : vcState === "speaking" ? `0 0 0 6px rgba(34,197,94,0.12)` : "none",
            opacity: disabled && vcState !== "speaking" ? 0.7 : 1,
          }}>
          {vcState === "recording" ? <StopIcon size={28} /> : <MicIcon size={32} color={vcState === "idle" ? C.muted : cfg.color} />}
        </button>
      </div>
      <p style={{ ...S.muted, textAlign: "center" }}>
        {vcState === "idle" ? "Mantén pulsado para grabar. Suelta para enviar." : cfg.label}
      </p>
      {(lastSent || lastResponse) && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {lastSent && <div style={{ fontSize: 11, color: C.muted }}><span style={{ fontWeight: 600 }}>Tú: </span>{`"${lastSent.substring(0, 80)}${lastSent.length > 80 ? "…" : ""}"`}</div>}
          {lastResponse && <div style={{ fontSize: 11, color: C.muted }}><span style={{ fontWeight: 600 }}>Agente: </span>{`"${lastResponse.substring(0, 80)}${lastResponse.length > 80 ? "…" : ""}"`}</div>}
        </div>
      )}
      {errorMsg && <span style={{ fontSize: 11, color: C.danger }}>{errorMsg}</span>}
      {!workerAvailable && <p style={{ ...S.muted, color: C.warning }}>Worker de audio no disponible. Voice Chat requiere Whisper + TTS.</p>}
      <audio ref={audioRef} style={{ display: "none" }} preload="none" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AudioChatInputButton — slot: globalToolbarButton
// ---------------------------------------------------------------------------

export function AudioChatInputButton() {
  const configResult = usePluginData<{ defaultLanguage: string }>(DATA_KEYS.config);
  const defaultLanguage = configResult.data?.defaultLanguage ?? "es-ES";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      typeof (window as any).SpeechRecognition !== "undefined" ||
      typeof (window as any).webkitSpeechRecognition !== "undefined";
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

    const injected = new WeakSet<HTMLTextAreaElement>();
    const containerMap = new Map<HTMLTextAreaElement, HTMLDivElement>();
    let activeRecognition: any = null;
    let activeContainer: HTMLDivElement | null = null;

    const idleStyle = (btn: HTMLButtonElement) => {
      btn.style.cssText =
        `width:${BTN_SIZE}px;height:${BTN_SIZE}px;border-radius:50%;display:flex;align-items:center;justify-content:center;` +
        "cursor:pointer;border:1.5px solid rgba(255,255,255,0.18);background:rgba(30,30,40,0.85);" +
        "color:rgba(255,255,255,0.55);outline:none;padding:0;pointer-events:all;" +
        "box-shadow:0 1px 4px rgba(0,0,0,0.3);transition:background 0.15s,border-color 0.15s,box-shadow 0.2s;";
    };
    const recordingStyle = (btn: HTMLButtonElement) => {
      btn.style.cssText =
        `width:${BTN_SIZE}px;height:${BTN_SIZE}px;border-radius:50%;display:flex;align-items:center;justify-content:center;` +
        "cursor:pointer;border:1.5px solid #ef4444;background:rgba(239,68,68,0.18);" +
        "color:#ef4444;outline:none;padding:0;pointer-events:all;" +
        "box-shadow:0 0 0 3px rgba(239,68,68,0.22),0 1px 4px rgba(0,0,0,0.3);transition:background 0.15s,border-color 0.15s,box-shadow 0.2s;";
    };

    const stopActiveRecognition = () => {
      if (activeRecognition) { try { activeRecognition.stop(); } catch {} activeRecognition = null; }
      if (activeContainer) { const b = activeContainer.firstElementChild as HTMLButtonElement | null; if (b) idleStyle(b); activeContainer = null; }
    };

    const positionContainer = (ta: HTMLTextAreaElement, container: HTMLDivElement) => {
      if (!ta.isConnected || ta.offsetParent === null) { container.style.display = "none"; return; }
      const rect = ta.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { container.style.display = "none"; return; }
      container.style.display = "flex";
      container.style.left = rect.right - BTN_SIZE - MARGIN + "px";
      container.style.top = rect.bottom - BTN_SIZE - MARGIN + "px";
      container.style.width = BTN_SIZE + "px";
      container.style.height = BTN_SIZE + "px";
    };

    const addMicButton = (ta: HTMLTextAreaElement) => {
      if (injected.has(ta)) return;
      injected.add(ta);
      const btn = document.createElement("button");
      btn.type = "button"; btn.setAttribute("aria-label", "Dictado por voz"); btn.title = "Dictado por voz"; btn.innerHTML = MIC_SVG;
      idleStyle(btn);
      const container = document.createElement("div") as HTMLDivElement;
      container.className = "paperclip-audio-mic-float";
      container.style.cssText = "position:fixed;z-index:9999;pointer-events:none;display:none;align-items:center;justify-content:center;";
      container.appendChild(btn); document.body.appendChild(container); containerMap.set(ta, container);
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (activeRecognition && activeContainer === container) { stopActiveRecognition(); return; }
        stopActiveRecognition();
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SR();
        recognition.lang = defaultLanguage; recognition.interimResults = false; recognition.continuous = false;
        let finalText = "";
        recognition.onresult = (ev: any) => { for (let i = ev.resultIndex; i < ev.results.length; i++) { if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript; } };
        recognition.onend = () => { if (activeRecognition === recognition) { activeRecognition = null; activeContainer = null; } idleStyle(btn); if (finalText.trim()) injectIntoTextarea(ta, finalText.trim()); };
        recognition.onerror = (ev: any) => { if (ev.error !== "no-speech") console.warn("[audio-plugin]", ev.error); if (activeRecognition === recognition) { activeRecognition = null; activeContainer = null; } idleStyle(btn); };
        recognition.start(); activeRecognition = recognition; activeContainer = container; recordingStyle(btn);
      });
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
      btn.addEventListener("touchstart", (e) => { e.preventDefault(); }, { passive: false });
      positionContainer(ta, container);
    };

    const repositionAll = () => containerMap.forEach((container, ta) => positionContainer(ta, container));
    const scanTextareas = () => { document.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((ta) => { if (ta.offsetParent !== null) addMicButton(ta); }); repositionAll(); };
    scanTextareas();
    window.addEventListener("resize", repositionAll);
    const observer = new MutationObserver(scanTextareas);
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
    const poll = setInterval(repositionAll, 1500);
    return () => { clearInterval(poll); window.removeEventListener("resize", repositionAll); observer.disconnect(); stopActiveRecognition(); containerMap.forEach((container) => container.parentNode?.removeChild(container)); };
  }, [defaultLanguage]);

  return null;
}

// ---------------------------------------------------------------------------
// AudioSidebarPanel — main slot
// ---------------------------------------------------------------------------

export function AudioSidebarPanel() {
  const configResult = usePluginData<{ defaultLanguage: string; autoPlayTTS: boolean }>(DATA_KEYS.config);
  const config = configResult.data ?? { defaultLanguage: "es-ES", autoPlayTTS: false };
  const workerAvailable = !configResult.error && !configResult.loading;
  const { entityId } = useHostContext();

  const [mode, setMode] = useState<number>(() => {
    try { const s = parseInt(localStorage.getItem(MODE_KEY) ?? "1", 10); return [1, 2, 3].includes(s) ? s : 1; }
    catch { return 1; }
  });
  const [voiceChatActive, setVoiceChatActive] = useState(false);

  const handleModeChange = (m: number) => {
    setMode(m);
    try { localStorage.setItem(MODE_KEY, String(m)); } catch {}
    if (m === 3) setVoiceChatActive(true);
    else setVoiceChatActive(false);
  };

  const handleExitVoiceChat = () => {
    setVoiceChatActive(false);
    setMode(1);
    try { localStorage.setItem(MODE_KEY, "1"); } catch {}
  };

  return (
    <div style={S.panel}>
      <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Audio</span>
        {workerAvailable
          ? <span style={{ ...S.badge, background: "rgba(34,197,94,0.12)", color: C.success, border: "1px solid rgba(34,197,94,0.25)" }}>Worker activo</span>
          : <span style={{ ...S.badge, background: "rgba(245,158,11,0.12)", color: C.warning, border: "1px solid rgba(245,158,11,0.25)" }}>Solo Nivel 1</span>
        }
      </div>
      <ModeSelector mode={mode} onChange={handleModeChange} />
      {mode === 1 && <DictadoSection defaultLanguage={config.defaultLanguage} />}
      {mode === 2 && <GrabacionSection workerAvailable={workerAvailable} defaultLanguage={config.defaultLanguage} autoSend={true} />}
      {mode === 3 && !voiceChatActive && (
        <div style={{ ...S.section, background: "rgba(124,58,237,0.06)", border: `1px solid ${C.vcBorder}`, alignItems: "center", gap: 12, padding: "20px 16px" }}>
          <p style={{ ...S.title, color: C.accent, textAlign: "center" }}>Voice Chat Mode</p>
          <p style={{ fontSize: 12, color: C.muted, textAlign: "center", margin: 0 }}>Conversa con el agente completamente por voz.</p>
          <button onClick={() => setVoiceChatActive(true)} type="button"
            style={{ ...S.btn, ...S.btnPrimary, padding: "10px 24px", fontSize: 13, fontWeight: 600, borderRadius: 8, gap: 8 }}>
            <MicIcon size={16} color="#fff" /> Iniciar conversación por voz
          </button>
          {!workerAvailable && <p style={{ ...S.muted, color: C.warning, textAlign: "center" }}>Requiere worker de audio (Whisper + TTS).</p>}
        </div>
      )}
      {mode === 3 && voiceChatActive && (
        <VoiceChatMode workerAvailable={workerAvailable} defaultLanguage={config.defaultLanguage} agentId={entityId ?? ""} onExit={handleExitVoiceChat} />
      )}
      {(mode === 1 || mode === 2) && <TtsSection workerAvailable={workerAvailable} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AudioSidebarEntry — slot: sidebar
// ---------------------------------------------------------------------------

export function AudioSidebarEntry({ context }: PluginSidebarProps) {
  const companyPrefix = context.companyPrefix ?? "";
  const isActive = typeof window !== "undefined" && window.location.pathname.includes("audio");

  return (
    <a href={companyPrefix ? `/${companyPrefix}/settings/plugins` : "/settings/plugins"}
      title="Panel de Audio" aria-current={isActive ? "page" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
        borderRadius: 6, textDecoration: "none",
        color: isActive ? C.text : C.muted,
        background: isActive ? C.bgHover : "transparent",
        fontSize: 13, fontWeight: 500,
      }}>
      <MicIcon size={16} color="currentColor" />
      Audio
    </a>
  );
}
