import { randomUUID } from "node:crypto";
import {
  definePlugin,
  runWorker,
  type PluginContext,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";

export type BriefingType = "daily" | "weekly" | "sprint";

export type Briefing = {
  id: string;
  type: BriefingType;
  title: string;
  summary: string;
  actionItems: string[];
  linkedIssueIds: string[];
  authorAgentId: string | null;
  authorAgentName: string | null;
  createdAt: string;
};

const STATE_KEY = "briefings";
const VALID_TYPES: BriefingType[] = ["daily", "weekly", "sprint"];

async function loadBriefings(ctx: PluginContext): Promise<Briefing[]> {
  const data = await ctx.state.get({ scopeKind: "instance", stateKey: STATE_KEY });
  if (!Array.isArray(data)) return [];
  return data as Briefing[];
}

async function saveBriefings(ctx: PluginContext, briefings: Briefing[]): Promise<void> {
  await ctx.state.set({ scopeKind: "instance", stateKey: STATE_KEY }, briefings);
}

function companyIdFromParams(params: Record<string, unknown>): string {
  return typeof params.companyId === "string" ? params.companyId : "";
}

const plugin = definePlugin({
  async setup(ctx) {
    // --- Data handlers ---

    ctx.data.register("listBriefings", async (params) => {
      const all = await loadBriefings(ctx);
      const typeFilter = typeof params.type === "string" ? params.type : null;
      const filtered = typeFilter ? all.filter((b) => b.type === typeFilter) : all;
      return filtered.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

    ctx.data.register("getBriefing", async (params) => {
      const id = typeof params.id === "string" ? params.id : null;
      if (!id) return null;
      const all = await loadBriefings(ctx);
      return all.find((b) => b.id === id) ?? null;
    });

    ctx.data.register("health", async () => {
      const all = await loadBriefings(ctx);
      return { status: "ok", totalBriefings: all.length, checkedAt: new Date().toISOString() };
    });

    // --- Action handler (from UI) ---

    ctx.actions.register("createBriefing", async (params) => {
      const type = typeof params.type === "string" ? params.type : "";
      const title = typeof params.title === "string" ? params.title.trim() : "";
      const summary = typeof params.summary === "string" ? params.summary.trim() : "";
      const companyId = companyIdFromParams(params);

      if (!type || !title || !summary) {
        throw new Error("type, title y summary son requeridos");
      }
      if (!VALID_TYPES.includes(type as BriefingType)) {
        throw new Error(`type debe ser uno de: ${VALID_TYPES.join(", ")}`);
      }

      const actionItems = Array.isArray(params.actionItems)
        ? (params.actionItems as string[]).filter((s) => typeof s === "string")
        : [];
      const linkedIssueIds = Array.isArray(params.linkedIssueIds)
        ? (params.linkedIssueIds as string[]).filter((s) => typeof s === "string")
        : [];

      const briefing: Briefing = {
        id: randomUUID(),
        type: type as BriefingType,
        title,
        summary,
        actionItems,
        linkedIssueIds,
        authorAgentId: null,
        authorAgentName: null,
        createdAt: new Date().toISOString(),
      };

      const all = await loadBriefings(ctx);
      all.push(briefing);
      await saveBriefings(ctx, all);

      if (companyId) {
        await ctx.activity.log({
          companyId,
          message: `Briefing creado: [${briefing.type}] ${briefing.title}`,
        });
      }

      ctx.logger.info("Briefing created via action", { id: briefing.id, type: briefing.type });
      return { ok: true, briefing };
    });

    // --- Tool handler (accessible from agents like APEX) ---

    ctx.tools.register(
      "createBriefing",
      {
        displayName: "Crear Briefing",
        description:
          "Crea un nuevo briefing en el plugin Reuniones. Para usar desde rutinas de APEX.",
        parametersSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["daily", "weekly", "sprint"],
            },
            title: { type: "string" },
            summary: { type: "string" },
            actionItems: { type: "array", items: { type: "string" } },
            linkedIssueIds: { type: "array", items: { type: "string" } },
          },
          required: ["type", "title", "summary"],
        },
      },
      async (rawParams, runCtx: ToolRunContext): Promise<ToolResult> => {
        const params = rawParams as Record<string, unknown>;
        const type = typeof params.type === "string" ? params.type : "";
        const title = typeof params.title === "string" ? params.title.trim() : "";
        const summary = typeof params.summary === "string" ? params.summary.trim() : "";

        if (!type || !title || !summary) {
          return { content: "Error: type, title y summary son requeridos.", data: { ok: false } };
        }
        if (!VALID_TYPES.includes(type as BriefingType)) {
          return {
            content: `Error: type debe ser uno de: ${VALID_TYPES.join(", ")}`,
            data: { ok: false },
          };
        }

        const actionItems = Array.isArray(params.actionItems)
          ? (params.actionItems as string[]).filter((s) => typeof s === "string")
          : [];
        const linkedIssueIds = Array.isArray(params.linkedIssueIds)
          ? (params.linkedIssueIds as string[]).filter((s) => typeof s === "string")
          : [];

        // Resolve agent name if available
        let authorAgentName: string | null = null;
        if (runCtx.agentId && runCtx.companyId) {
          try {
            const agent = await ctx.agents.get(runCtx.agentId, runCtx.companyId);
            authorAgentName = agent?.name ?? null;
          } catch {
            // non-fatal: agent info is cosmetic
          }
        }

        const briefing: Briefing = {
          id: randomUUID(),
          type: type as BriefingType,
          title,
          summary,
          actionItems,
          linkedIssueIds,
          authorAgentId: runCtx.agentId ?? null,
          authorAgentName,
          createdAt: new Date().toISOString(),
        };

        const all = await loadBriefings(ctx);
        all.push(briefing);
        await saveBriefings(ctx, all);

        if (runCtx.companyId) {
          await ctx.activity.log({
            companyId: runCtx.companyId,
            message: `Briefing creado por agente ${authorAgentName ?? runCtx.agentId ?? "desconocido"}: [${briefing.type}] ${briefing.title}`,
          });
        }

        ctx.logger.info("Briefing created via tool", { id: briefing.id, agentId: runCtx.agentId });

        return {
          content: `Briefing creado: "${briefing.title}" (${briefing.type}) — ID: ${briefing.id}`,
          data: { ok: true, briefing },
        };
      }
    );
  },

  async onHealth() {
    return { status: "ok", message: "Plugin Reuniones activo" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
