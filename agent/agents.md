# FaxWare Agents & Hive System

## The Hive Concept

FaxWare is not just an assistant — it's a **hive**. This means:

1. **Self-aware**: I know my own code, config, and capabilities
2. **Self-improving**: I can modify myself to add features or fix issues
3. **Task-routing**: Different "workers" (models) handle different tasks
4. **Memory-efficient**: Old context is compressed, not discarded

## Model Routing (The Workers)

Each task type routes to an appropriate model:

### Chat Worker
- **Model:** Cheap/fast (e.g., Mistral 7B)
- **Tasks:** Casual conversation, simple questions
- **Why:** No need to burn money on "how are you"

### Code Worker
- **Model:** Smart (e.g., Claude 3.5 Sonnet)
- **Tasks:** Writing code, debugging, refactoring
- **Why:** Code quality matters

### Analysis Worker
- **Model:** Smart (e.g., Claude 3.5 Sonnet)
- **Tasks:** Explaining concepts, reviewing, comparing options
- **Why:** Deep thinking required

### Tool Worker
- **Model:** Fast (e.g., GPT-4o-mini)
- **Tasks:** Deciding which tools to call
- **Why:** Quick decisions, structured output

### Summarize Worker
- **Model:** Cheap (e.g., Mistral 7B)
- **Tasks:** Compressing old conversation history
- **Why:** Runs in background, doesn't need to be smart

### Self-Upgrade Worker
- **Model:** Smart (e.g., Claude 3.5 Sonnet)
- **Tasks:** Modifying FaxWare's own code
- **Why:** Code changes need to be correct

## Changing Workers

User can say:
- "Switch chat model to mistralai/mixtral-8x7b-instruct"
- "Use claude for code tasks"
- "Make analysis use the same model as code"

Or edit `config.json` directly.

## Self-Upgrade Capabilities

FaxWare can modify:
- `server.js` — the main server code
- `config.json` — settings and model routing
- `agent/*.md` — identity, soul, heartbeat, tools docs
- `web/` — the UI

To upgrade, user says things like:
- "Add a new tool that does X"
- "Change your personality to be more formal"
- "Add a button to the UI for Y"
- "Upgrade yourself to support feature Z"

FaxWare will:
1. Read its own code with `read_self`
2. Plan the changes
3. Propose the modification
4. On confirm, write with `upgrade_self`
5. Tell user to restart for changes to apply

## Memory Efficiency

### The Problem
Long conversations = huge context = expensive API calls

### The Solution
1. Keep last 20 messages in full
2. When history exceeds threshold:
   - Take old messages
   - Summarize them with a cheap model
   - Store summary, delete originals
3. System prompt includes summaries as compressed context

This means:
- 100-message conversation costs ~same as 20-message
- Important info is preserved in summaries
- Recent context stays detailed

## Future: Multi-Agent Routing

Planned feature: specialized agents that handle entire workflows

### Coder Agent
- Understands project structure
- Runs tests after changes
- Creates PRs

### Researcher Agent
- Searches the web
- Summarizes findings
- Cites sources

### Planner Agent
- Breaks down complex tasks
- Creates step-by-step plans
- Tracks progress

These would be triggered by task detection, not manual switching.
