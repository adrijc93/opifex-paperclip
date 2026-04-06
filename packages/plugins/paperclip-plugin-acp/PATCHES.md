# ACP Plugin OPIFEX Patches

This package is a vendored fork of `paperclip-plugin-acp` with OPIFEX-specific patches applied.

## Applied Patches

### Patch 1: companyId from rawEvent (worker.js)
**Problem**: The original code read `companyId` from `rawEvent.payload.companyId`, which was undefined in many cases.
**Fix**: Changed to `rawEvent.companyId || rawEvent.payload?.companyId` to use the top-level event field.

```js
// Before
const event = rawEvent.payload;

// After
const event = { ...rawEvent.payload, companyId: rawEvent.companyId || rawEvent.payload?.companyId };
```

### Patch 2: Paperclip agent name mapping (worker.js)
**Problem**: When Discord sends an `acp-spawn` event with a Paperclip agent name (e.g., "Forge"), the ACP plugin couldn't find the CLI agent.
**Fix**: Added fallback mapping - if the agentName from the event doesn't match a known CLI agent, fall back to `config.defaultAgent`.

```js
// In handleSpawn():
let agentId = rawAgentId;
if (!getAgent(agentId)) {
  agentId = config.defaultAgent;
}
```

### Patch 3: session.initialPrompt passthrough (worker.js)
**Problem**: The initial prompt from `acp-spawn` events was not passed through to `spawnAgent`.
**Fix**: Set `session.initialPrompt = event.prompt` before calling `spawnAgent`.

### Patch 4: spawn args for claude CLI (acp-spawn.js)
**Problem**: When spawning claude with an initial prompt, the CLI args needed for non-interactive mode were missing.
**Fix**: When `session.initialPrompt` is set and `agent.id === "claude"`, append:
`--print --verbose -p <prompt> --output-format stream-json --permission-mode auto --allowedTools Bash(*) Read Write Edit Glob Grep WebFetch WebSearch`
