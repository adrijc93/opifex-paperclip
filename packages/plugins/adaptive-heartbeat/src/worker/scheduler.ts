import type { ScopeKey } from "@paperclipai/plugin-sdk";
import type { SchedulerState, AgentScheduleState, InvocationRecord, AdaptiveConfig } from "./types.js";

const MAX_RECENT_INVOCATIONS = 50;

export function stateKey(companyId: string): ScopeKey {
  return { scopeKind: "company", scopeId: companyId, stateKey: "scheduler-state" };
}

export function emptyState(): SchedulerState {
  return { agents: {}, recentInvocations: [] };
}

function getAgent(state: SchedulerState, agentId: string): AgentScheduleState {
  if (!state.agents[agentId]) {
    state.agents[agentId] = { lastInvokeAt: null, lastFailAt: null, pendingInvokeAt: null, lastBacklogCount: 0, consecutiveFailures: 0 };
  }
  // Migrate old state missing new fields
  const a = state.agents[agentId];
  if (a.lastFailAt === undefined) a.lastFailAt = null;
  if (a.consecutiveFailures === undefined) a.consecutiveFailures = 0;
  return a;
}

/** Check if an agent is within the cooldown period (considers failure backoff). */
export function isInCooldown(
  state: SchedulerState,
  agentId: string,
  cooldownSec: number,
  cfg?: AdaptiveConfig,
): boolean {
  const agent = getAgent(state, agentId);

  // Check invoke cooldown
  if (agent.lastInvokeAt) {
    const elapsed = (Date.now() - new Date(agent.lastInvokeAt).getTime()) / 1000;
    if (elapsed < cooldownSec) return true;
  }

  // Check failure backoff — exponential: baseSec * 2^(failures-1), capped at maxSec
  if (agent.lastFailAt && agent.consecutiveFailures > 0 && cfg) {
    const backoff = Math.min(
      cfg.failBackoffBaseSec * Math.pow(2, agent.consecutiveFailures - 1),
      cfg.failBackoffMaxSec,
    );
    const elapsed = (Date.now() - new Date(agent.lastFailAt).getTime()) / 1000;
    if (elapsed < backoff) return true;
  }

  return false;
}

/** Mark an agent invocation as failed (applies backoff). */
export function markFailed(state: SchedulerState, agentId: string): void {
  const agent = getAgent(state, agentId);
  agent.lastFailAt = new Date().toISOString();
  agent.consecutiveFailures += 1;
}

/** Reset failure tracking after a successful invocation. */
export function clearFailures(state: SchedulerState, agentId: string): void {
  const agent = getAgent(state, agentId);
  agent.lastFailAt = null;
  agent.consecutiveFailures = 0;
}

/** Mark an agent as just invoked. */
export function markInvoked(
  state: SchedulerState,
  agentId: string,
  agentName: string,
  reason: string,
  backlogCount: number,
): void {
  const agent = getAgent(state, agentId);
  agent.lastInvokeAt = new Date().toISOString();
  agent.pendingInvokeAt = null;
  agent.lastBacklogCount = backlogCount;

  state.recentInvocations.unshift({
    agentId,
    agentName,
    reason,
    timestamp: new Date().toISOString(),
    backlogCount,
  });
  if (state.recentInvocations.length > MAX_RECENT_INVOCATIONS) {
    state.recentInvocations = state.recentInvocations.slice(0, MAX_RECENT_INVOCATIONS);
  }
}

/** Schedule a delayed re-invocation for an agent. */
export function scheduleReinvoke(
  state: SchedulerState,
  agentId: string,
  backlogCount: number,
  cfg: AdaptiveConfig,
): void {
  const agent = getAgent(state, agentId);
  const delaySec = backlogCount >= 3 ? cfg.heavyBacklogDelaySec : cfg.backlogDelaySec;
  agent.pendingInvokeAt = new Date(Date.now() + delaySec * 1000).toISOString();
  agent.lastBacklogCount = backlogCount;
}

/** Get all agents with pending invocations that are due. */
export function getDueInvocations(state: SchedulerState): string[] {
  const now = Date.now();
  const due: string[] = [];
  for (const [agentId, agent] of Object.entries(state.agents)) {
    if (agent.pendingInvokeAt && new Date(agent.pendingInvokeAt).getTime() <= now) {
      due.push(agentId);
    }
  }
  return due;
}

/** Clear pending invocation for an agent. */
export function clearPending(state: SchedulerState, agentId: string): void {
  const agent = getAgent(state, agentId);
  agent.pendingInvokeAt = null;
}
