import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "opifex.paperclip-plugin-evol";
export const PLUGIN_VERSION = "0.1.0";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "EVOL · Learnings Reminder",
  description:
    "Tras cada run de un agente, crea automáticamente un follow-up de prioridad low para revisar si hay algo que registrar en .learnings/",
  author: "OPIFEX",
  categories: ["automation"],
  capabilities: [
    "events.subscribe",
    "agents.read",
    "issues.read",
    "issues.create",
    "plugin.state.read",
    "plugin.state.write",
    "ui.dashboardWidget.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "evol-pending-widget",
        displayName: "EVOL · pendientes",
        exportName: "EvolPendingWidget",
      },
    ],
  },
};

export default manifest;
