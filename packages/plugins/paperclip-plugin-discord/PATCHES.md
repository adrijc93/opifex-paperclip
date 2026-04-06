# Discord Plugin OPIFEX Patches

This package is a vendored fork of `paperclip-plugin-discord` with OPIFEX-specific patches applied.

## Applied Patches

### Patch 5: handleAcpOutput reads event.text (session-registry.js)
**Problem**: The `handleAcpOutput` function only read `event.output`, but ACP plugin emits events with `event.text` field.
**Fix**: Changed to read `event.output || event.text` as fallback.

```js
// Before
const output = event.output || (event.error ? `Error: ${event.error}` : "") || "";

// After
const output = event.output || event.text || (event.error ? `Error: ${event.error}` : "") || "";
```

### Patch 6: resolveTopicChannel routes by assigneeAgentName (worker.js)
**Problem**: Channel routing only used project name to route events to Discord channels. When multiple agents work on the same project, all events went to the same channel.
**Fix**: Added routing by `assigneeAgentName` as priority over project name. Checks `payload.assigneeAgentName || payload.agentName` first, then falls back to project name.

```js
// In resolveTopicChannel():
const agentName = payload.assigneeAgentName || payload.agentName || null;
if (agentName && channelMap[agentName.toLowerCase()])
  return channelMap[agentName.toLowerCase()];

// Fallback to project name
const projectName = payload.projectName ? String(payload.projectName) : null;
if (projectName && channelMap[projectName])
  return channelMap[projectName];
```

This enables each agent (Forge, Pixel, Echo, etc.) to have their own Discord channel for notifications.
