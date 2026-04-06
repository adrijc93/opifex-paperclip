/** Plugin configuration matching manifest schema. */
export interface AdaptiveConfig {
  enabled: boolean;
  cooldownSec: number;
  backlogDelaySec: number;
  heavyBacklogDelaySec: number;
  maxConcurrentInvocations: number;
  failBackoffBaseSec: number;
  failBackoffMaxSec: number;
}

/** Per-agent tracking state. */
export interface AgentScheduleState {
  lastInvokeAt: string | null;
  lastFailAt: string | null;
  pendingInvokeAt: string | null;
  lastBacklogCount: number;
  consecutiveFailures: number;
}

/** Company-wide scheduling state stored in plugin state. */
export interface SchedulerState {
  agents: Record<string, AgentScheduleState>;
  recentInvocations: InvocationRecord[];
}

/** Record of a single invocation for the activity feed. */
export interface InvocationRecord {
  agentId: string;
  agentName: string;
  reason: string;
  timestamp: string;
  backlogCount: number;
}
