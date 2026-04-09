// Plugin Audio — manifest
// Fecha: 2026-04-09 | Issues: SEC-202 (worker) + SEC-203 (UI)

import { DEFAULT_CONFIG, PLUGIN_ID, PLUGIN_VERSION } from "./constants.js";

const manifest = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Audio (Whisper + ElevenLabs)",
  description:
    "Plugin de audio para el fork OPIFEX de Paperclip. " +
    "Nivel 1: dictado vía Web Speech API (frontend). " +
    "Nivel 2: transcripción con Whisper local y síntesis de voz con ElevenLabs TTS.",
  author: "forge",
  categories: ["ui", "automation"],
  capabilities: [
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "ui.sidebar.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      defaultLanguage: {
        type: "string",
        title: "Idioma por defecto",
        description: "Código BCP-47 para Web Speech API y Whisper (ej. es-ES, en-US).",
        default: DEFAULT_CONFIG.defaultLanguage,
      },
      voices: {
        type: "object",
        title: "Voces de agentes (ElevenLabs)",
        description: "Mapa agentId → ElevenLabs voiceId para síntesis de voz.",
        additionalProperties: { type: "string" },
        default: DEFAULT_CONFIG.voices,
      },
      autoPlayTTS: {
        type: "boolean",
        title: "Auto-reproducir respuestas TTS",
        description: "Si está activo, las respuestas del agente se leen en voz alta automáticamente.",
        default: DEFAULT_CONFIG.autoPlayTTS,
      },
      whisperModel: {
        type: "string",
        title: "Modelo Whisper",
        description: "Modelo Whisper local a usar: tiny, base, small, medium, large.",
        enum: ["tiny", "base", "small", "medium", "large"],
        default: DEFAULT_CONFIG.whisperModel,
      },
      elevenLabsApiKeyRef: {
        type: "string",
        format: "secret-ref",
        title: "ElevenLabs API Key (referencia de secreto)",
        description: "UUID del secreto que contiene la API key de ElevenLabs. Crear en Configuración → Secretos.",
        default: DEFAULT_CONFIG.elevenLabsApiKeyRef,
      },
    },
  },
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "audio-sidebar-entry",
        displayName: "Audio",
        exportName: "AudioSidebarEntry",
      },
      {
        type: "sidebarPanel",
        id: "audio-sidebar-panel",
        displayName: "Audio",
        exportName: "AudioSidebarPanel",
      },
    ],
  },
};

export default manifest;
