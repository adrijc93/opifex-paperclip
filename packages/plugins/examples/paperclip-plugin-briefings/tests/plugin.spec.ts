import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import type { Briefing } from "../src/worker.js";

describe("paperclip-plugin-briefings", () => {
  it("health data handler returns ok status", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    const data = await harness.getData<{ status: string; totalBriefings: number }>("health");
    expect(data.status).toBe("ok");
    expect(data.totalBriefings).toBe(0);
  });

  it("listBriefings returns empty array initially", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    const briefings = await harness.getData<Briefing[]>("listBriefings", {});
    expect(briefings).toEqual([]);
  });

  it("createBriefing action stores a briefing and returns it", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<{ ok: boolean; briefing: Briefing }>(
      "createBriefing",
      {
        type: "daily",
        title: "Daily 2026-04-08",
        summary: "Todo bien, sin bloqueos.",
        actionItems: ["Revisar PR #42"],
        linkedIssueIds: ["SEC-100"],
        companyId: "company-test",
      }
    );

    expect(result.ok).toBe(true);
    expect(result.briefing.type).toBe("daily");
    expect(result.briefing.title).toBe("Daily 2026-04-08");
    expect(result.briefing.actionItems).toContain("Revisar PR #42");
    expect(result.briefing.linkedIssueIds).toContain("SEC-100");
    expect(result.briefing.id).toBeTruthy();
  });

  it("listBriefings returns created briefings sorted by date desc", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("createBriefing", {
      type: "daily",
      title: "Daily 1",
      summary: "Primero",
      companyId: "company-test",
    });

    await harness.performAction("createBriefing", {
      type: "weekly",
      title: "Weekly 1",
      summary: "Segundo",
      companyId: "company-test",
    });

    const all = await harness.getData<Briefing[]>("listBriefings", {});
    expect(all.length).toBe(2);
    // Most recent first
    expect(new Date(all[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(all[1]!.createdAt).getTime()
    );
  });

  it("listBriefings filters by type", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("createBriefing", {
      type: "daily",
      title: "Daily",
      summary: "D",
      companyId: "company-test",
    });
    await harness.performAction("createBriefing", {
      type: "sprint",
      title: "Sprint",
      summary: "S",
      companyId: "company-test",
    });

    const dailies = await harness.getData<Briefing[]>("listBriefings", { type: "daily" });
    expect(dailies.length).toBe(1);
    expect(dailies[0]!.type).toBe("daily");

    const sprints = await harness.getData<Briefing[]>("listBriefings", { type: "sprint" });
    expect(sprints.length).toBe(1);
    expect(sprints[0]!.type).toBe("sprint");
  });

  it("getBriefing returns a specific briefing by id", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    const { briefing } = await harness.performAction<{ ok: boolean; briefing: Briefing }>(
      "createBriefing",
      { type: "weekly", title: "Weekly", summary: "W", companyId: "company-test" }
    );

    const found = await harness.getData<Briefing>("getBriefing", { id: briefing.id });
    expect(found?.id).toBe(briefing.id);
    expect(found?.title).toBe("Weekly");

    const notFound = await harness.getData<Briefing | null>("getBriefing", { id: "nonexistent" });
    expect(notFound).toBeNull();
  });

  it("createBriefing tool stores a briefing with agent attribution", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    const toolResult = await harness.executeTool(
      "createBriefing",
      {
        type: "daily",
        title: "Daily desde APEX",
        summary: "Estado del equipo: todo verde.",
        actionItems: ["Deploy a staging"],
      },
      { agentId: "apex-agent-id", companyId: "company-test" }
    );

    const result = toolResult.data as { ok: boolean; briefing: Briefing };
    expect(result.ok).toBe(true);
    expect(result.briefing.type).toBe("daily");
    expect(result.briefing.authorAgentId).toBe("apex-agent-id");
    expect(toolResult.content).toContain("Daily desde APEX");
  });

  it("createBriefing action throws on missing required fields", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);

    await expect(
      harness.performAction("createBriefing", { type: "daily", companyId: "c" })
    ).rejects.toThrow();
  });
});
