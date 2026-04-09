// Plugin Audio — worker
// Fecha: 2026-04-09 | Issue: SEC-202
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
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs TTS error ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
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
      try {
        const text = await runWhisper(audioPath, model, language);
        ctx.logger.info("Transcription complete", { length: text.length });
        return { text };
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
