// Plugin Audio — UI source (TypeScript/TSX)
// Fecha: 2026-04-09 | Issue: SEC-203
// Estado: Pendiente aprobación Adrián
// Criterio de ejecución: compilar con tsc cuando se añada tsconfig.json para este paquete

/**
 * Plugin Audio — componentes de UI
 *
 * Nivel 1: Dictado por voz vía Web Speech API (sólo frontend, sin worker)
 * Nivel 2: Grabación tipo WhatsApp vía MediaRecorder + transcripción Whisper (worker SEC-202)
 *          + reproducción TTS vía ElevenLabs (worker SEC-202)
 *
 * NOTA: No existe slot chatInput en el SDK actual, por lo que la UI
 * se implementa como sidebarPanel. El texto transcrito se copia al portapapeles
 * para que el usuario lo pegue en el chat. Ver discusión en SEC-203.
 */

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import {
  useHostContext,
  usePluginData,
  usePluginAction,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";

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
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
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
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
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

function PlayIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5,3 19,12 5,21" />
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

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const S: Record<string, CSSProperties> = {
  panel: { display: "flex", flexDirection: "column", gap: 12, padding: "12px 10px", fontSize: 13, color: C.text },
  section: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 },
  title: { fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: C.muted, margin: 0 } as CSSProperties,
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
// DictadoSection — Level 1: Web Speech API
// ---------------------------------------------------------------------------

function DictadoSection({ defaultLanguage }: { defaultLanguage: string }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const finalRef = useRef("");

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
    finalRef.current = "";

    r.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalRef.current += chunk;
        else interim += chunk;
      }
      setTranscript(finalRef.current + interim);
    };

    r.onend = () => { setListening(false); if (finalRef.current) setTranscript(finalRef.current); };
    r.onerror = (e: any) => { setListening(false); if (e.error !== "no-speech") setError(`Error: ${e.error}`); };

    setError(null); setTranscript(""); r.start(); setListening(true);
  }, [listening, supported, defaultLanguage]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const handleCopy = async () => {
    try { await copyToClipboard(transcript); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Error al copiar"); }
  };

  if (!supported) {
    return (
      <div style={S.section}>
        <p style={S.title}>Dictado por voz</p>
        <p style={S.muted}>Tu navegador no soporta Web Speech API. Usa Chrome o Edge.</p>
      </div>
    );
  }

  return (
    <div style={S.section}>
      <p style={S.title}>Dictado por voz</p>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            {listening ? "Escuchando…" : transcript ? "Texto capturado" : `Idioma: ${defaultLanguage || "es-ES"}`}
          </span>
          {error && <span style={{ fontSize: 11, color: C.danger }}>{error}</span>}
        </div>
        <button onClick={toggle} aria-label={listening ? "Detener" : "Iniciar dictado"} style={{
          ...S.micBtn,
          background: listening ? C.dangerLight : C.bg,
          border: `2px solid ${listening ? C.danger : C.border}`,
          boxShadow: listening ? `0 0 0 4px rgba(239,68,68,0.15), 0 0 0 8px rgba(239,68,68,0.08)` : "none",
        }}>
          <MicIcon size={22} color={listening ? C.danger : C.muted} />
        </button>
      </div>
      {transcript && <textarea style={S.textarea} value={transcript} readOnly rows={3} aria-label="Texto transcrito" />}
      {transcript && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={S.btn} onClick={handleCopy}>
            <CopyIcon /> {copied ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      )}
      {!transcript && !listening && (
        <p style={S.muted}>Pulsa el micrófono y habla. El texto aparece aquí — cópialo al chat con Ctrl+V.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GrabacionSection — Level 2: MediaRecorder + Whisper
// ---------------------------------------------------------------------------

function GrabacionSection({ workerAvailable, defaultLanguage }: { workerAvailable: boolean; defaultLanguage: string }) {
  const transcribeAction = usePluginAction(ACTION_KEYS.transcribeAudio);
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<"idle" | "transcribing" | "done" | "error">("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const supported = isMediaRecorderSupported();

  const startRecording = useCallback(async () => {
    if (!supported || recording || !workerAvailable) return;
    setErrorMsg(null); setTranscript(""); setStatus("idle"); chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg("Permiso de micrófono denegado. Permite el acceso en tu navegador."); return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const audioBase64 = await blobToBase64(blob);
      setStatus("transcribing");
      try {
        const result = await transcribeAction({ audioBase64, mimeType }) as { text: string } | undefined;
        setTranscript(result?.text ?? ""); setStatus("done");
      } catch (err: any) {
        setErrorMsg(err?.message ?? "Error al transcribir"); setStatus("error");
      }
    };

    recorder.start(500);
    setRecording(true);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => setDuration(Date.now() - startRef.current), 200);
  }, [supported, recording, workerAvailable, transcribeAction]);

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

  const handleCopy = async () => {
    try { await copyToClipboard(transcript); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setErrorMsg("Error al copiar"); }
  };

  if (!supported) {
    return (
      <div style={S.section}>
        <p style={S.title}>Grabación (Nivel 2)</p>
        <p style={S.muted}>MediaRecorder no disponible en este navegador.</p>
      </div>
    );
  }

  const statusText = recording ? `Grabando… ${formatDuration(duration)}`
    : status === "transcribing" ? "Transcribiendo con Whisper…"
    : status === "done" ? "Transcripción lista"
    : status === "error" ? "Error en transcripción"
    : "Listo para grabar";

  return (
    <div style={S.section}>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <p style={S.title}>Grabación de voz</p>
        {!workerAvailable && <span style={{ ...S.badge, background: "rgba(245,158,11,0.15)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)" }}>Worker pendiente</span>}
      </div>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: recording ? C.danger : C.muted }}>{statusText}</span>
        <button
          onClick={recording ? stopRecording : startRecording}
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
      {transcript && (
        <>
          <textarea style={S.textarea} value={transcript} readOnly rows={3} aria-label="Texto transcrito" />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={S.btn} onClick={handleCopy}><CopyIcon /> {copied ? "¡Copiado!" : "Copiar"}</button>
          </div>
        </>
      )}
      {!workerAvailable && <p style={S.muted}>Requiere worker de audio (SEC-202). Disponible cuando Forge complete la integración Whisper.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TtsSection — Level 2: ElevenLabs TTS playback
// ---------------------------------------------------------------------------

function TtsSection({ workerAvailable }: { workerAvailable: boolean }) {
  const synthesizeAction = usePluginAction(ACTION_KEYS.synthesizeSpeech);
  const { entityId } = useHostContext();

  const [text, setText] = useState("");
  const [agentId, setAgentId] = useState(entityId ?? "");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(() => {
    try { return localStorage.getItem(AUTOPLAY_KEY) === "true"; } catch { return false; }
  });
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
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Error en TTS");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = () => { audioRef.current?.pause(); setPlaying(false); };

  return (
    <div style={S.section}>
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <p style={S.title}>Text-to-Speech</p>
        {!workerAvailable && <span style={{ ...S.badge, background: "rgba(245,158,11,0.15)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)" }}>Worker pendiente</span>}
      </div>
      <textarea
        style={{ ...S.textarea, opacity: workerAvailable ? 1 : 0.6 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Pega aquí el texto del agente para escucharlo…"
        rows={3}
        disabled={!workerAvailable}
        aria-label="Texto para sintetizar"
      />
      <div style={{ ...S.row, justifyContent: "space-between" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: C.muted, userSelect: "none" }}>
          <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)}
            style={{ accentColor: C.accent }} aria-label="Auto-reproducir respuestas" />
          Auto-play
        </label>
        {playing
          ? <button style={{ ...S.btn, ...S.btnDanger }} onClick={handleStop}><StopIcon /> Detener</button>
          : <button
              style={{ ...S.btn, ...(workerAvailable && text.trim() ? S.btnPrimary : {}), opacity: (!workerAvailable || !text.trim() || loading) ? 0.5 : 1 }}
              onClick={handlePlay}
              disabled={!workerAvailable || !text.trim() || loading}>
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
// AudioSidebarPanel — slot: sidebarPanel
// ---------------------------------------------------------------------------

export function AudioSidebarPanel() {
  const configResult = usePluginData<{ defaultLanguage: string; autoPlayTTS: boolean }>(DATA_KEYS.config);
  const config = configResult.data ?? { defaultLanguage: "es-ES", autoPlayTTS: false };
  const workerAvailable = !configResult.error && !configResult.loading;

  return (
    <div style={S.panel}>
      <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Audio</span>
        {workerAvailable
          ? <span style={{ ...S.badge, background: "rgba(34,197,94,0.12)", color: C.success, border: "1px solid rgba(34,197,94,0.25)" }}>Worker activo</span>
          : <span style={{ ...S.badge, background: "rgba(245,158,11,0.12)", color: C.warning, border: "1px solid rgba(245,158,11,0.25)" }}>Solo Nivel 1</span>
        }
      </div>
      <DictadoSection defaultLanguage={config.defaultLanguage} />
      <GrabacionSection workerAvailable={workerAvailable} defaultLanguage={config.defaultLanguage} />
      <TtsSection workerAvailable={workerAvailable} />
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
    <a
      href={companyPrefix ? `/${companyPrefix}/settings/plugins` : "/settings/plugins"}
      title="Panel de Audio"
      aria-current={isActive ? "page" : undefined}
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
