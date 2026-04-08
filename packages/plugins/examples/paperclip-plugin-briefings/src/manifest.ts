import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "opifex.paperclip-plugin-briefings";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "/reuniones";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Reuniones",
  description:
    "Historial de briefings y reuniones de equipo: dailies, weeklies y sprint plannings.",
  author: "OPIFEX",
  categories: ["ui", "automation"],
  capabilities: [
    "ui.page.register",
    "ui.sidebar.register",
    "plugin.state.read",
    "plugin.state.write",
    "agents.read",
    "issues.read",
    "projects.read",
    "activity.log.write",
    "agent.tools.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  tools: [
    {
      name: "createBriefing",
      displayName: "Crear Briefing",
      description:
        "Crea un nuevo briefing en el plugin Reuniones. Para usar desde rutinas de APEX: dailies, weeklies o sprint plannings.",
      parametersSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["daily", "weekly", "sprint"],
            description: "Tipo de reunión: daily, weekly o sprint",
          },
          title: {
            type: "string",
            description: "Título del briefing",
          },
          summary: {
            type: "string",
            description: "Resumen o contenido principal (markdown)",
          },
          actionItems: {
            type: "array",
            items: { type: "string" },
            description: "Lista de acciones propuestas o pendientes",
          },
          linkedIssueIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs de issues de Paperclip relacionadas",
          },
        },
        required: ["type", "title", "summary"],
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: "briefings-page",
        displayName: "Reuniones",
        exportName: "BriefingsPage",
        routePath: PAGE_ROUTE,
      },
      {
        type: "sidebar",
        id: "briefings-sidebar",
        displayName: "Reuniones",
        exportName: "BriefingsSidebar",
      },
    ],
  },
};

export default manifest;
