// Plugin Audio — constants
// Fecha: 2026-04-09 | Issue: SEC-202

export const PLUGIN_ID = "paperclip-plugin-audio";
export const PLUGIN_VERSION = "0.1.0-opifex.1";

export const ACTION_KEYS = {
  transcribeAudio: "transcribeAudio",
  synthesizeSpeech: "synthesizeSpeech",
  synthesizeSpeechStream: "synthesizeSpeechStream",
  getConfig: "getConfig",
};

export const DEFAULT_CONFIG = {
  defaultLanguage: "es-ES",
  voices: {},
  autoPlayTTS: false,
  whisperModel: "base",
  elevenLabsApiKeyRef: "",
};

export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
export const WHISPER_BIN = "/usr/local/bin/whisper";
