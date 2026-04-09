// Plugin Audio — worker
// Fecha: 2026-04-09 | Issue: SEC-202 / SEC-216
// Estado: Listo para producción (pendiente verificación funcional con audio real)

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { ACTION_KEYS, DEFAULT_CONFIG, ELEVENLABS_BASE_URL, WHISPER_BIN } from "./constants.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a base64-encoded audio blob to a temp file.
 * Returns the temp file path.
 */
async function writeTempAudio(audioBase64, mimeType) {
  const ext = mimeExtension(mimeType);
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `paperclip-audio-${randomUUID()}${ext}`);
  const buffer = Buffer.from(audioBase64, "base64");
  await fs.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Derive a file extension from a MIME type.
 */
function mimeExtension(mimeType) {
  const map = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".mp4",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/m4a": ".m4a",
  };
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return map[base] ?? ".webm";
}

/**
 * Run Whisper CLI on an audio file and return the transcribed text.
 */
async function runWhisper(audioPath, model, language) {
  const outputDir = path.join(os.tmpdir(), `whisper-out-${randomUUID()}`);
  await fs.mkdir(outputDir, { recursive: true });

  try {
    const lang = language.split("-")[0]; // Whisper uses "es", not "es-ES"
    await execFileAsync(WHISPER_BIN, [
      audioPath,
      "--model", model,
      "--language", lang,
      "--output_format", "txt",
      "--output_dir", outputDir,
      "--verbose", "False",
    ], { timeout: 120_000 });

    // Whisper names output file as <input_basename>.txt
    const baseName = path.basename(audioPath, path.extname(audioPath));
    const txtPath = path.join(outputDir, `${baseName}.txt`);
    const text = await fs.readFile(txtPath, "utf-8");
    return text.trim();
  } finally {
    // Clean up temp files regardless of success/failure
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Shared request body for ElevenLabs TTS requests.
 */
function elevenLabsBody(text) {
  return JSON.stringify({
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  });
}

/**
 * Call ElevenLabs TTS API and return MP3 as base64.
 */
async function callElevenLabsTTS(text, voiceId, apiKey) {
  const url = `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: elevenLabsBody(text),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs TTS error ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

/**
 * Call ElevenLabs streaming TTS endpoint and push audio chunks to ctx.streams.
 *
 * Each emitted event has the shape:
 *   { type: "chunk", data: "<base64-encoded MP3 fragment>" }
 *
 * When the stream ends, a final event is emitted:
 *   { type: "done", totalBytes: <number> }
 *
 * On error, a single event is emitted:
 *   { type: "error", message: "<description>" }
 *
 * UI usage (React component):
 * ```tsx
 * const { events } = usePluginStream<TtsStreamEvent>("tts-stream");
 * // Accumulate base64 chunks → decode → play via Web Audio API or
 * // concatenate into a Blob URL for <audio> once "done" is received.
 * ```
 *
 * @param {string} text - Text to synthesize
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {string} apiKey - ElevenLabs API key
 * @param {string} channel - Stream channel name (e.g. "tts-stream")
 * @param {string} companyId - Paperclip company ID for stream scoping
 * @param {object} streams - ctx.streams from PluginContext
 */
async function callElevenLabsTTSStream(text, voiceId, apiKey, channel, companyId, streams) {
  const url = `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}/stream`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: elevenLabsBody(text),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    streams.emit(channel, { type: "error", message: `ElevenLabs TTS error ${response.status}: ${errText}` });
    streams.close(channel);
    throw new Error(`ElevenLabs TTS stream error ${response.status}: ${errText}`);
  }

  if (!response.body) {
    streams.emit(channel, { type: "error", message: "ElevenLabs returned no response body" });
    streams.close(channel);
    throw new Error("ElevenLabs TTS stream: no response body");
  }

  const reader = response.body.getReader();
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      streams.emit(channel, { type: "chunk", data: Buffer.from(value).toString("base64") });
    }
    streams.emit(channel, { type: "done", totalBytes });
  } finally {
    streams.close(channel);
    reader.releaseLock();
  }

  return totalBytes;
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Audio plugin starting up");

    // -----------------------------------------------------------------------
    // Action: getConfig (imperative, kept for backwards compat)
    // -----------------------------------------------------------------------
    ctx.actions.register(ACTION_KEYS.getConfig, async () => {
      const raw = await ctx.config.get();
      const config = { ...DEFAULT_CONFIG, ...raw };
      return {
        defaultLanguage: config.defaultLanguage,
        voices: config.voices ?? {},
        autoPlayTTS: config.autoPlayTTS,
        whisperModel: config.whisperModel ?? DEFAULT_CONFIG.whisperModel,
      };
    });

    // -----------------------------------------------------------------------
    // Data: audio-config
    // Backs usePluginData("audio-config") in the UI sidebar panel
    // -----------------------------------------------------------------------
    ctx.data.register("audio-config", async () => {
      const raw = await ctx.config.get();
      const config = { ...DEFAULT_CONFIG, ...raw };
      return {
        defaultLanguage: config.defaultLanguage,
        autoPlayTTS: config.autoPlayTTS,
      };
    });

    // -----------------------------------------------------------------------
    // Action: transcribeAudio
    // Receives base64 audio blob + MIME type, runs Whisper, returns text
    // -----------------------------------------------------------------------
    ctx.actions.register(ACTION_KEYS.transcribeAudio, async (params) => {
      const audioBase64 = String(params.audioBase64 ?? "");
      const mimeType = String(params.mimeType ?? "audio/webm");

      if (!audioBase64) {
        throw new Error("transcribeAudio: audioBase64 is required");
      }

      const raw = await ctx.config.get();
      const config = { ...DEFAULT_CONFIG, ...raw };
      const model = config.whisperModel ?? DEFAULT_CONFIG.whisperModel;
      const language = config.defaultLanguage ?? DEFAULT_CONFIG.defaultLanguage;

      ctx.logger.info("Transcribing audio", { mimeType, model, language });

      const audioPath = await writeTempAudio(audioBase64, mimeType);
      const whisperStart = Date.now();
      try {
        const text = await runWhisper(audioPath, model, language);
        const whisperMs = Date.now() - whisperStart;
        ctx.logger.info("Transcription complete", { length: text.length, durationMs: whisperMs, model });
        // NOTE: SEC-216 benchmark — model=base takes ~52s CPU/FP32 on 7s audio.
        // model=tiny takes ~2.7s. For Voice Chat Mode, switch to tiny (see SEC-217).
        if (whisperMs > 3000) {
          ctx.logger.warn("Whisper latency exceeds 3s target", { durationMs: whisperMs, model,
            hint: "Consider switching whisperModel to 'tiny' for lower latency (SEC-217)" });
        }
        return { text, durationMs: whisperMs };
      } finally {
        await fs.rm(audioPath, { force: true }).catch(() => {});
      }
    });

    // -----------------------------------------------------------------------
    // Action: synthesizeSpeech
    // Receives text + agentId, calls ElevenLabs TTS, returns base64 MP3
    // -----------------------------------------------------------------------
    ctx.actions.register(ACTION_KEYS.synthesizeSpeech, async (params) => {
      const text = String(params.text ?? "");
      const agentId = String(params.agentId ?? "");

      if (!text) {
        throw new Error("synthesizeSpeech: text is required");
      }

      const raw = await ctx.config.get();
      const config = { ...DEFAULT_CONFIG, ...raw };

      const voices = config.voices ?? {};
      const voiceId = voices[agentId] ?? voices["default"];

      if (!voiceId) {
        throw new Error(
          `synthesizeSpeech: no voiceId configured for agentId="${agentId}". ` +
          "Configure it in plugin settings under Voces de agentes."
        );
      }

      if (!config.elevenLabsApiKeyRef) {
        throw new Error(
          "synthesizeSpeech: elevenLabsApiKeyRef is not configured. " +
          "Add the ElevenLabs secret reference in plugin settings."
        );
      }

      const apiKey = await ctx.secrets.resolve(config.elevenLabsApiKeyRef);
      ctx.logger.info("Synthesizing speech", { agentId, voiceId, textLength: text.length });

      const audioBase64 = await callElevenLabsTTS(text, voiceId, apiKey);
      ctx.logger.info("TTS complete", { bytes: Math.round(audioBase64.length * 0.75) });

      return { audioBase64, mimeType: "audio/mpeg" };
    });

    // -----------------------------------------------------------------------
    // Action: synthesizeSpeechStream
    // Streaming TTS for Voice Chat Mode (SEC-216).
    // Calls ElevenLabs /stream endpoint and pushes audio chunks to ctx.streams
    // so the UI can start playback before the full audio is ready.
    //
    // Parameters:
    //   text     {string} — text to synthesize
    //   agentId  {string} — used to resolve voiceId from config
    //   companyId {string} — required for stream channel scoping
    //   channel  {string} — optional stream channel name (default: "tts-stream")
    //
    // Stream events (UI: usePluginStream<TtsStreamEvent>(channel)):
    //   { type: "chunk", data: string }   — base64-encoded MP3 fragment
    //   { type: "done",  totalBytes: number }  — stream finished
    //   { type: "error", message: string } — stream failed
    //
    // UI integration pattern:
    //   1. Call synthesizeSpeechStream({ text, agentId, companyId, channel })
    //   2. Subscribe to stream via usePluginStream(channel) to receive chunks
    //   3. Accumulate chunks; on "done", concatenate + decode + play via Web Audio API
    //      OR use a MediaSource / SourceBuffer to play progressively (see SEC-217 notes)
    //
    // Returns: { channel: string, totalBytes: number } when stream completes.
    // -----------------------------------------------------------------------
    ctx.actions.register(ACTION_KEYS.synthesizeSpeechStream, async (params) => {
      const text = String(params.text ?? "");
      const agentId = String(params.agentId ?? "");
      const companyId = String(params.companyId ?? "");
      const channel = String(params.channel ?? "tts-stream");

      if (!text) {
        throw new Error("synthesizeSpeechStream: text is required");
      }
      if (!companyId) {
        throw new Error("synthesizeSpeechStream: companyId is required for stream channel scoping");
      }

      const raw = await ctx.config.get();
      const config = { ...DEFAULT_CONFIG, ...raw };

      const voices = config.voices ?? {};
      const voiceId = voices[agentId] ?? voices["default"];

      if (!voiceId) {
        throw new Error(
          `synthesizeSpeechStream: no voiceId configured for agentId="${agentId}". ` +
          "Configure it in plugin settings under Voces de agentes."
        );
      }

      if (!config.elevenLabsApiKeyRef) {
        throw new Error(
          "synthesizeSpeechStream: elevenLabsApiKeyRef is not configured. " +
          "Add the ElevenLabs secret reference in plugin settings."
        );
      }

      const apiKey = await ctx.secrets.resolve(config.elevenLabsApiKeyRef);
      ctx.logger.info("Streaming TTS start", { agentId, voiceId, channel, textLength: text.length });

      ctx.streams.open(channel, companyId);
      const totalBytes = await callElevenLabsTTSStream(text, voiceId, apiKey, channel, companyId, ctx.streams);

      ctx.logger.info("Streaming TTS complete", { channel, totalBytes });
      return { channel, totalBytes, mimeType: "audio/mpeg" };
    });

    ctx.logger.info("Audio plugin ready", {
      actions: Object.values(ACTION_KEYS),
    });
  },

  async onHealth() {
    // Check Whisper binary is available
    try {
      await fs.access(WHISPER_BIN);
      return { status: "ok", message: "Whisper binary found", details: { whisperBin: WHISPER_BIN } };
    } catch {
      return {
        status: "degraded",
        message: `Whisper binary not found at ${WHISPER_BIN} — transcription unavailable`,
        details: { whisperBin: WHISPER_BIN },
      };
    }
  },

  async onValidateConfig(config) {
    const errors = [];
    const warnings = [];

    if (config.whisperModel && !["tiny", "base", "small", "medium", "large"].includes(String(config.whisperModel))) {
      errors.push(`whisperModel "${config.whisperModel}" inválido. Valores permitidos: tiny, base, small, medium, large.`);
    }

    if (!config.elevenLabsApiKeyRef) {
      warnings.push("elevenLabsApiKeyRef no configurado — síntesis de voz (TTS) no estará disponible.");
    }

    if (!config.voices || Object.keys(config.voices).length === 0) {
      warnings.push("No hay voces configuradas — TTS no funcionará hasta asignar voiceIds en voices.");
    }

    return { ok: errors.length === 0, errors, warnings };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
