import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVOL_TITLE_PREFIX = "[EVOL]";
// agent-ops project — home of all EVOL follow-up issues
const DEFAULT_PROJECT_ID = "e52fcc5c-c554-48b0-ae3a-36dc566c6ecd";
const MIN_RUN_DURATION_SEC = 60;
const MAX_RECENT_FOLLOWUPS = 20;
const STATE_KEY_RECENT = "evol:recent-followups";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecentFollowup = {
  runId: string;
  agentId: string;
  agentName: string;
  followUpIssueId: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

async function isAlreadyProcessed(ctx: PluginContext, runId: string): Promise<boolean> {
  const val = await ctx.state.get({
    scopeKind: "instance",
    stateKey: `evol:processed:${runId}`,
  });
  return !!val;
}

async function markProcessed(
  ctx: PluginContext,
  runId: string,
  followUpIssueId: string,
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: `evol:processed:${runId}` },
    { followUpIssueId, processedAt: new Date().toISOString() },
  );
}

async function addRecentFollowup(ctx: PluginContext, entry: RecentFollowup): Promise<void> {
  const existing = ((await ctx.state.get({
    scopeKind: "instance",
    stateKey: STATE_KEY_RECENT,
  })) ?? []) as RecentFollowup[];
  const updated = [entry, ...existing].slice(0, MAX_RECENT_FOLLOWUPS);
  await ctx.state.set({ scopeKind: "instance", stateKey: STATE_KEY_RECENT }, updated);
}

// ---------------------------------------------------------------------------
// Duration helper
// ---------------------------------------------------------------------------

function computeDurationSec(payload: Record<string, unknown>): number | null {
  const startedAt = typeof payload.startedAt === "string" ? payload.startedAt : null;
  const finishedAt = typeof payload.finishedAt === "string" ? payload.finishedAt : null;
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const durationMs = end - start;
  if (isNaN(durationMs) || durationMs < 0) return null;
  return Math.round(durationMs / 1000);
}

// ---------------------------------------------------------------------------
// Follow-up issue description builder
// ---------------------------------------------------------------------------

function buildFollowUpDescription(opts: {
  runId: string;
  agentId: string;
  agentName: string;
  durationSec: number | null;
  isFailed: boolean;
}): string {
  const { runId, agentId, agentName, durationSec, isFailed } = opts;
  const runLink = `/OPI/agents/${agentId}/runs/${runId}`;
  const status = isFailed ? "FALLIDO" : "completado";
  const agentWorkspace = `/root/${agentName.toLowerCase()}-workspace`;

  const lines = [
    `**Run**: [${runId.slice(0, 12)}…](${runLink}) — ${status}`,
    `**Agente**: ${agentName}`,
    durationSec != null ? `**Duración**: ${durationSec}s` : null,
    ``,
    `## ¿Aprendí algo en este run?`,
    ``,
    `Revisa los 6 triggers del skill EVOL y registra si aplica alguno:`,
    ``,
    `1. Una operación falló y encontraste la solución (error + fix = aprendizaje)`,
    `2. Adrián o un agente te corrigió explícitamente ("no hagas X", "hazlo así")`,
    `3. Descubriste un mejor approach para algo que ya hacías de otra forma`,
    `4. Una API / tool falló de forma inesperada y encontraste el workaround`,
    `5. Tu conocimiento sobre el sistema estaba desactualizado (config, path, comportamiento)`,
    `6. Alguien hizo un feature request recurrente que podría formalizarse`,
    ``,
    `**Si no aplica ninguno** → cierra esta issue directamente (dismissed).`,
    ``,
    `**Si aplica alguno** → ejecuta el skill \`/evol\` o escribe la entrada en \`.learnings/\` y cierra con resumen.`,
    ``,
    `**Archivos a editar** (si corresponde):`,
    `- \`${agentWorkspace}/.learnings/LEARNINGS.md\``,
    `- \`${agentWorkspace}/.learnings/ERRORS.md\``,
    `- \`${agentWorkspace}/.learnings/FEATURE_REQUESTS.md\``,
  ];

  return lines.filter((l) => l !== null).join("\n");
}

// ---------------------------------------------------------------------------
// Core run processor
// ---------------------------------------------------------------------------

async function processRun(
  ctx: PluginContext,
  opts: {
    runId: string;
    agentId: string;
    companyId: string;
    payload: Record<string, unknown>;
    isFailed: boolean;
  },
): Promise<{ ok: boolean; skipped?: string; followUpIssueId?: string }> {
  const { runId, agentId, companyId, payload, isFailed } = opts;

  // Idempotency
  if (await isAlreadyProcessed(ctx, runId)) {
    ctx.logger.debug("EVOL: run already processed, skipping", { runId });
    return { ok: true, skipped: "already_processed" };
  }

  // Duration filter — skip trivial runs (health-checks, pings)
  const durationSec = computeDurationSec(payload);
  if (durationSec !== null && durationSec < MIN_RUN_DURATION_SEC) {
    ctx.logger.debug("EVOL: run duration too short, skipping", { runId, durationSec });
    return { ok: true, skipped: "duration_too_short" };
  }

  // Resolve agent name for the issue title
  let agentName = agentId;
  try {
    const agent = await ctx.agents.get(agentId, companyId);
    if (agent?.name) agentName = agent.name;
  } catch {
    // non-fatal — use agentId as fallback
  }

  const description = buildFollowUpDescription({ runId, agentId, agentName, durationSec, isFailed });

  const followUp = await ctx.issues.create({
    companyId,
    projectId: DEFAULT_PROJECT_ID,
    title: `${EVOL_TITLE_PREFIX} Revisar run ${runId.slice(0, 8)}… — ${agentName}`,
    description,
    priority: "low",
    assigneeAgentId: agentId,
  });

  await markProcessed(ctx, runId, followUp.id);

  await addRecentFollowup(ctx, {
    runId,
    agentId,
    agentName,
    followUpIssueId: followUp.id,
    createdAt: new Date().toISOString(),
  });

  ctx.logger.info("EVOL: follow-up issue created", {
    runId,
    agentId,
    agentName,
    followUpIssueId: followUp.id,
  });

  return { ok: true, followUpIssueId: followUp.id };
}

// ---------------------------------------------------------------------------
// Event handler
// ---------------------------------------------------------------------------

async function handleRunEvent(ctx: PluginContext, event: PluginEvent): Promise<void> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  const runId =
    event.entityId ??
    (typeof payload.runId === "string" ? payload.runId : null);
  const agentId =
    typeof payload.agentId === "string" ? payload.agentId : null;
  const companyId = event.companyId;

  if (!runId || !agentId || !companyId) {
    ctx.logger.warn("EVOL: event missing required fields, skipping", {
      eventType: event.eventType,
      hasRunId: !!runId,
      hasAgentId: !!agentId,
      hasCompanyId: !!companyId,
    });
    return;
  }

  const isFailed = event.eventType === "agent.run.failed";

  await processRun(ctx, { runId, agentId, companyId, payload, isFailed });
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const plugin = definePlugin({
  async setup(ctx) {
    // Subscribe to run completion events
    ctx.events.on("agent.run.finished", (event: PluginEvent) => handleRunEvent(ctx, event));
    ctx.events.on("agent.run.failed", (event: PluginEvent) => handleRunEvent(ctx, event));

    // Manual action: force-process a specific run (for tests and retries)
    ctx.actions.register("process-run", async (params) => {
      const runId = typeof params.runId === "string" ? params.runId : null;
      const agentId = typeof params.agentId === "string" ? params.agentId : null;
      const companyId = typeof params.companyId === "string" ? params.companyId : null;

      if (!runId || !agentId || !companyId) {
        throw new Error("Se requieren: runId, agentId, companyId");
      }

      const result = await processRun(ctx, {
        runId,
        agentId,
        companyId,
        payload: {},
        isFailed: false,
      });

      return result;
    });

    // Data: count pending EVOL issues (for dashboard widget)
    ctx.data.register("pending-count", async (params) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : null;
      if (!companyId) return { count: 0 };

      try {
        const allIssues = await ctx.issues.list({
          companyId,
          projectId: DEFAULT_PROJECT_ID,
        });
        const count = (allIssues as unknown as Array<Record<string, unknown>>).filter(
          (i) =>
            (i.status === "todo" || i.status === "in_progress") &&
            typeof i.title === "string" &&
            i.title.startsWith(EVOL_TITLE_PREFIX),
        ).length;
        return { count };
      } catch {
        return { count: 0 };
      }
    });

    // Data: recent follow-ups created (for debug)
    ctx.data.register("recent-followups", async (params) => {
      const limit = typeof params.limit === "number" ? Math.min(params.limit, 50) : 10;
      const existing = ((await ctx.state.get({
        scopeKind: "instance",
        stateKey: STATE_KEY_RECENT,
      })) ?? []) as RecentFollowup[];
      return existing.slice(0, limit);
    });
  },

  async onHealth() {
    return { status: "ok", message: "EVOL plugin activo — monitorizando runs" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
