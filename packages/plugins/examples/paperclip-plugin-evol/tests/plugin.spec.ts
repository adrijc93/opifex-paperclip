import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { Agent } from "@paperclipai/plugin-sdk";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import type { RecentFollowup } from "../src/worker.js";

const COMPANY_ID = "test-company-id";
const AGENT_ID = "test-agent-id";
const RUN_ID = "run-abc123def456";

function makeAgent(overrides: { id: string; companyId: string; name: string }): Agent {
  const now = new Date();
  return {
    urlKey: overrides.name.toLowerCase(),
    role: "engineer",
    title: null,
    icon: null,
    reportsTo: null,
    capabilities: null,
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: {} as Agent["permissions"],
    metadata: null,
    status: "idle",
    adapterType: "claude_local",
    lastHeartbeatAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
const oneMinAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();

function makeRunFinishedEvent(runId = RUN_ID, agentId = AGENT_ID) {
  return {
    payload: {
      agentId,
      runId,
      startedAt: twoMinAgo,
      finishedAt: oneMinAgo,
    },
    base: {
      entityId: runId,
      entityType: "run",
      companyId: COMPANY_ID,
    },
  };
}

describe("paperclip-plugin-evol", () => {
  it("health returns ok", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const health = await plugin.definition.onHealth?.();
    expect(health?.status).toBe("ok");
  });

  it("pending-count returns 0 for unknown company", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const result = await harness.getData<{ count: number }>("pending-count", {
      companyId: COMPANY_ID,
    });
    expect(result.count).toBe(0);
  });

  it("recent-followups returns empty list initially", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const result = await harness.getData<RecentFollowup[]>("recent-followups", { limit: 5 });
    expect(result).toEqual([]);
  });

  it("creates follow-up issue on agent.run.finished event", async () => {
    const harness = createTestHarness({ manifest });
    harness.seed({
      agents: [makeAgent({ id: AGENT_ID, companyId: COMPANY_ID, name: "Forge" })],
    });
    await plugin.definition.setup(harness.ctx);

    const { payload, base } = makeRunFinishedEvent();
    await harness.emit("agent.run.finished", payload, base);

    const followups = await harness.getData<RecentFollowup[]>("recent-followups", { limit: 5 });
    expect(followups).toHaveLength(1);
    expect(followups[0]?.runId).toBe(RUN_ID);
    expect(followups[0]?.agentId).toBe(AGENT_ID);
    expect(followups[0]?.agentName).toBe("Forge");
    expect(followups[0]?.followUpIssueId).toBeTruthy();
  });

  it("is idempotent — same runId does not create a second follow-up", async () => {
    const harness = createTestHarness({ manifest });
    harness.seed({
      agents: [makeAgent({ id: AGENT_ID, companyId: COMPANY_ID, name: "Forge" })],
    });
    await plugin.definition.setup(harness.ctx);

    const { payload, base } = makeRunFinishedEvent();
    await harness.emit("agent.run.finished", payload, base);
    await harness.emit("agent.run.finished", payload, base);

    const followups = await harness.getData<RecentFollowup[]>("recent-followups", { limit: 10 });
    expect(followups).toHaveLength(1);
  });

  it("skips runs shorter than 60s", async () => {
    const harness = createTestHarness({ manifest });
    harness.seed({
      agents: [makeAgent({ id: AGENT_ID, companyId: COMPANY_ID, name: "Forge" })],
    });
    await plugin.definition.setup(harness.ctx);

    // 30-second run
    const start = new Date(Date.now() - 30_000).toISOString();
    const end = new Date().toISOString();
    await harness.emit(
      "agent.run.finished",
      { agentId: AGENT_ID, runId: "short-run-id", startedAt: start, finishedAt: end },
      { entityId: "short-run-id", entityType: "run", companyId: COMPANY_ID },
    );

    const followups = await harness.getData<RecentFollowup[]>("recent-followups", { limit: 5 });
    expect(followups).toHaveLength(0);
  });

  it("skips event when agentId is missing", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    await harness.emit(
      "agent.run.finished",
      { runId: "orphan-run" },
      { entityId: "orphan-run", entityType: "run", companyId: COMPANY_ID },
    );

    const followups = await harness.getData<RecentFollowup[]>("recent-followups", { limit: 5 });
    expect(followups).toHaveLength(0);
  });

  it("process-run action throws when params are missing", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    await expect(
      harness.performAction("process-run", { runId: "x" }),
    ).rejects.toThrow();
  });

  it("process-run action creates follow-up for valid params", async () => {
    const harness = createTestHarness({ manifest });
    harness.seed({
      agents: [makeAgent({ id: AGENT_ID, companyId: COMPANY_ID, name: "Forge" })],
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<{ ok: boolean; followUpIssueId?: string }>(
      "process-run",
      { runId: "manual-run-001", agentId: AGENT_ID, companyId: COMPANY_ID },
    );

    expect(result.ok).toBe(true);
    expect(result.followUpIssueId).toBeTruthy();

    const followups = await harness.getData<RecentFollowup[]>("recent-followups", {});
    expect(followups).toHaveLength(1);
    expect(followups[0]?.agentName).toBe("Forge");
  });

  it("process-run action is idempotent on same runId", async () => {
    const harness = createTestHarness({ manifest });
    harness.seed({
      agents: [makeAgent({ id: AGENT_ID, companyId: COMPANY_ID, name: "Forge" })],
    });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("process-run", {
      runId: "idempotent-run",
      agentId: AGENT_ID,
      companyId: COMPANY_ID,
    });
    const result = await harness.performAction<{ ok: boolean; skipped?: string }>(
      "process-run",
      { runId: "idempotent-run", agentId: AGENT_ID, companyId: COMPANY_ID },
    );

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe("already_processed");

    const followups = await harness.getData<RecentFollowup[]>("recent-followups", {});
    expect(followups).toHaveLength(1);
  });

  it("handles agent.run.failed event the same as finished", async () => {
    const harness = createTestHarness({ manifest });
    harness.seed({
      agents: [makeAgent({ id: AGENT_ID, companyId: COMPANY_ID, name: "Forge" })],
    });
    await plugin.definition.setup(harness.ctx);

    await harness.emit(
      "agent.run.failed",
      {
        agentId: AGENT_ID,
        runId: "failed-run-001",
        startedAt: twoMinAgo,
        finishedAt: oneMinAgo,
      },
      { entityId: "failed-run-001", entityType: "run", companyId: COMPANY_ID },
    );

    const followups = await harness.getData<RecentFollowup[]>("recent-followups", {});
    expect(followups).toHaveLength(1);
    expect(followups[0]?.runId).toBe("failed-run-001");
  });
});
