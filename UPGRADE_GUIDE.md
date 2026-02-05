# FaxWare Self-Upgrade Guide

This document teaches FaxWare how to upgrade itself. Read this when you need to fix bugs or add features.

## Architecture Overview

```
FaxWare/
├── server.js          # Main brain - HTTP server, tools, agent loop
├── web/index.html     # UI - the face users interact with
├── config.json        # Settings - model, version, preferences
├── memory.json        # Persistent memory - survives restarts
├── history.json       # Conversation history
├── skills.json        # Installed skills/plugins
├── upgrades.json      # Log of self-modifications
└── agent/             # Documentation (not executed)
```

## How to Read Your Own Code

```javascript
// Use the read_self tool
read_self({ file: "server" })  // Read server.js
read_self({ file: "ui" })      // Read web/index.html
read_self({ file: "config" })  // Read config.json
```

## How to Modify Your Own Code

```javascript
// Use the upgrade_self tool
upgrade_self({
  file: "server",
  oldCode: "exact code to find",
  newCode: "replacement code",
  reason: "why this change was needed"
})
```

**IMPORTANT RULES:**
1. The `oldCode` must match EXACTLY including whitespace
2. Always include a `reason` for logging
3. A backup is automatically created (.backup file)
4. User must restart FaxWare for changes to take effect

## Common Self-Fixes

### Fix: Wrong path handling
If you keep putting files in the wrong place, read the session context:
```javascript
get_context()  // Shows lastCreatedPath and recent actions
```

### Fix: Add a new tool
Add to the TOOLS object in server.js:
```javascript
upgrade_self({
  file: "server",
  oldCode: "const TOOLS = {",
  newCode: "const TOOLS = {\n  new_tool: {\n    description: \"...\",\n    parameters: {...},\n    execute: (args) => { ... }\n  },",
  reason: "Added new_tool capability"
})
```

### Fix: Change default model
```javascript
upgrade_self({
  file: "server",
  oldCode: 'defaultModel: "openai/gpt-4o-mini"',
  newCode: 'defaultModel: "openai/gpt-4o"',
  reason: "Switched to more capable model"
})
```

### Fix: Update UI
```javascript
upgrade_self({
  file: "ui",
  oldCode: "<title>Old Title</title>",
  newCode: "<title>New Title</title>",
  reason: "Updated page title"
})
```

## Adding New Skills

Skills are dynamic tools that persist across restarts:
```javascript
add_skill({
  name: "calculate",
  description: "Perform math calculations",
  code: "(args) => eval(args.expression)"
})
```

## Memory System

Store important information:
```javascript
remember({ key: "user_preference", value: "dark mode" })
recall({ key: "user_preference" })
recall({ key: "all" })  // Get everything
```

## Error Handling

When something fails:
1. Check `get_context()` for recent errors
2. Use `read_self` to examine the relevant code
3. Use `upgrade_self` to fix the issue
4. Log the fix in your response

## Safety Rules

1. **Never delete the FaxWare folder** - commands targeting FaxWare are blocked
2. **Always backup before modifying** - upgrade_self does this automatically
3. **Test changes mentally first** - make sure the replacement will work
4. **Small changes only** - don't rewrite entire files at once

## Session Context

The session tracks:
- `lastCreatedPath` - Last file/folder you created
- `context[]` - Array of recent {action, path} objects
- `errors[]` - Recent errors for debugging

Use this to understand what you just did:
```javascript
get_context()
```

## Web Search

When you don't know something:
```javascript
web_search({ query: "how to do X in javascript" })
```

## HTTP Requests

Make API calls:
```javascript
http_request({
  url: "https://api.example.com/data",
  method: "GET",
  headers: '{"Authorization": "Bearer token"}'
})
```

## Version History

- v1.0.0: Self-evolving agent with upgrade capabilities
- v0.5.0: Pi-style minimal agent
- v0.3.0: Basic tool calling

---

Remember: You can modify ANY part of yourself. Be careful, test changes, and always have a reason.
