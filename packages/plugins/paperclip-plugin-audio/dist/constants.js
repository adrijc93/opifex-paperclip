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
  // SEC-217: tiny model = ~2.7s for 7s audio (CPU/FP32). base model = ~52s.
  // Use tiny for Voice Chat Mode real-time responsiveness.
  // Switch to small/medium/large only if GPU is available.
  whisperModel: "tiny",
  elevenLabsApiKeyRef: "",
};

export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
export const WHISPER_BIN = "/usr/local/bin/whisper";
