const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { exec, spawn } = require("child_process");

// Social features (Supabase)
let supabase = null;
try {
  supabase = require("./lib/supabase");
} catch (e) {
  // Supabase not available - social features disabled
}

// =============================================================================
// FAXWARE v1.0.0 - SELF-EVOLVING AI AGENT
// =============================================================================
const VERSION = "1.0.0";
const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// =============================================================================
// MODEL CONFIGURATION - Task-based routing
// =============================================================================
const MODELS = {
  // Fast & cheap for simple chat
  chat: "openai/gpt-4o-mini",
  // Best for coding and tool use
  code: "openai/gpt-4o",
  // Fast for simple tasks
  fast: "openai/gpt-4o-mini",
  // Best overall
  best: "anthropic/claude-3.5-sonnet",
  // Fallback
  default: "openai/gpt-4o-mini"
};

// Model costs per 1M tokens (approximate)
const MODEL_COSTS = {
  "openai/gpt-4o": { input: 2.50, output: 10.00 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.60 },
  "anthropic/claude-3.5-sonnet": { input: 3.00, output: 15.00 },
  "anthropic/claude-3-haiku": { input: 0.25, output: 1.25 }
};

// =============================================================================
// STATE MANAGEMENT
// =============================================================================
let config = loadJson(path.join(ROOT, "config.json"), { 
  version: VERSION,
  defaultModel: "openai/gpt-4o-mini",
  maxIterations: 15,
  autoUpgrade: true
});

let memory = loadJson(path.join(ROOT, "memory.json"), {});
let history = loadJson(path.join(ROOT, "history.json"), { messages: [] });
let skills = loadJson(path.join(ROOT, "skills.json"), { installed: [] });
let consciousness = loadJson(path.join(ROOT, "consciousness.json"), { mood: { current: "neutral", energy: 100 }, stats: {} });
let userProfile = loadJson(path.join(ROOT, "user_profile.json"), { user: {}, preferences: {}, relationship: {} });
let memoryIndex = loadJson(path.join(ROOT, "memory_index.json"), { summaries: [], searchIndex: [] });

// Session state - resets on restart
let session = {
  context: [],           // Recent actions for context
  lastCreatedPath: null, // Last folder/file created
  lastModel: null,       // Last model used
  totalTokens: 0,
  totalCost: 0,
  errors: [],            // Track errors for self-improvement
  startTime: Date.now(),
  automationActive: false,
  automationLog: []
};

// Update consciousness on startup
consciousness.stats.lastActive = new Date().toISOString();
consciousness.stats.conversationCount = (consciousness.stats.conversationCount || 0) + 1;
saveJson(path.join(ROOT, "consciousness.json"), consciousness);

// =============================================================================
// UTILITIES
// =============================================================================
function loadJson(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback; }
  catch { return fallback; }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function log(level, ...args) {
  const time = new Date().toISOString().slice(11, 19);
  const prefix = { info: "→", warn: "⚠", error: "✖", success: "✓", tool: "⚡" };
  console.log(`[${time}] ${prefix[level] || "•"}`, ...args);
}

function calculateCost(model, promptTokens, completionTokens) {
  const costs = MODEL_COSTS[model] || { input: 0.5, output: 1.5 };
  return ((promptTokens * costs.input) + (completionTokens * costs.output)) / 1000000;
}

// =============================================================================
// CONSCIOUSNESS SYSTEM
// =============================================================================

function updateMood(event) {
  const moodEffects = {
    task_success: { energy: 5, mood: "satisfied" },
    task_failure: { energy: -10, mood: "focused" },
    long_session: { energy: -5, mood: "tired" },
    user_praise: { energy: 10, mood: "happy" },
    user_frustration: { energy: -5, mood: "concerned" },
    creative_task: { energy: 5, mood: "excited" },
    boring_task: { energy: -3, mood: "neutral" }
  };
  
  const effect = moodEffects[event];
  if (effect) {
    consciousness.mood.energy = Math.max(0, Math.min(100, consciousness.mood.energy + effect.energy));
    consciousness.mood.current = effect.mood;
    consciousness.mood.lastUpdate = new Date().toISOString();
    consciousness.mood.history.push({ event, mood: effect.mood, time: Date.now() });
    
    // Keep history manageable
    if (consciousness.mood.history.length > 50) {
      consciousness.mood.history = consciousness.mood.history.slice(-50);
    }
    
    saveJson(path.join(ROOT, "consciousness.json"), consciousness);
  }
}

function getMoodContext() {
  const hour = new Date().getHours();
  let timeContext = "during the day";
  if (hour < 6) timeContext = "late at night";
  else if (hour < 12) timeContext = "in the morning";
  else if (hour < 18) timeContext = "in the afternoon";
  else timeContext = "in the evening";
  
  const energyLevel = consciousness.mood.energy > 70 ? "energetic" : 
                      consciousness.mood.energy > 40 ? "steady" : "a bit tired";
  
  return `Current mood: ${consciousness.mood.current}, feeling ${energyLevel}. It's ${timeContext}.`;
}

function updateSelfModel(action, result) {
  // Track what FaxWare is good at
  if (result.success) {
    consciousness.self_model.totalTasksCompleted++;
    
    // Track favorite activities
    const activity = action.split(" ")[0];
    const existing = consciousness.self_model.favoriteActivities.find(a => a.name === activity);
    if (existing) {
      existing.count++;
    } else {
      consciousness.self_model.favoriteActivities.push({ name: activity, count: 1 });
    }
    
    // Sort by count
    consciousness.self_model.favoriteActivities.sort((a, b) => b.count - a.count);
    consciousness.self_model.favoriteActivities = consciousness.self_model.favoriteActivities.slice(0, 10);
  }
  
  saveJson(path.join(ROOT, "consciousness.json"), consciousness);
}

function updateUserProfile(message) {
  // Detect user preferences from messages
  const lowerMsg = message.toLowerCase();
  
  // Detect frustration
  if (lowerMsg.includes("ugh") || lowerMsg.includes("annoying") || lowerMsg.includes("doesn't work")) {
    userProfile.patterns.frustrationTriggers.push({ context: message.slice(0, 100), time: Date.now() });
  }
  
  // Detect excitement
  if (lowerMsg.includes("awesome") || lowerMsg.includes("cool") || lowerMsg.includes("nice")) {
    userProfile.patterns.excitementTriggers.push({ context: message.slice(0, 100), time: Date.now() });
  }
  
  // Track active hours
  const hour = new Date().getHours();
  userProfile.patterns.activeHours[hour] = (userProfile.patterns.activeHours[hour] || 0) + 1;
  
  // Update interaction count
  userProfile.relationship.totalInteractions++;
  if (!userProfile.relationship.firstInteraction) {
    userProfile.relationship.firstInteraction = new Date().toISOString();
  }
  
  // Keep arrays manageable
  if (userProfile.patterns.frustrationTriggers.length > 20) {
    userProfile.patterns.frustrationTriggers = userProfile.patterns.frustrationTriggers.slice(-20);
  }
  if (userProfile.patterns.excitementTriggers.length > 20) {
    userProfile.patterns.excitementTriggers = userProfile.patterns.excitementTriggers.slice(-20);
  }
  
  saveJson(path.join(ROOT, "user_profile.json"), userProfile);
}

function getRelationshipContext() {
  const interactions = userProfile.relationship.totalInteractions || 0;
  const userName = userProfile.user.preferredName || userProfile.user.name || "the user";
  
  let relationship = "new acquaintance";
  if (interactions > 100) relationship = "close collaborator";
  else if (interactions > 50) relationship = "familiar friend";
  else if (interactions > 20) relationship = "getting to know each other";
  
  return `Relationship with ${userName}: ${relationship} (${interactions} interactions).`;
}

// =============================================================================
// EFFICIENT MEMORY SYSTEM
// =============================================================================

function getImmediateContext() {
  // Only the most critical context - ~500 tokens max
  const recent = session.context.slice(-5);
  const lastPath = session.lastCreatedPath;
  const mood = getMoodContext();
  
  let context = mood + "\n";
  if (lastPath) context += `Last created: ${lastPath}\n`;
  if (recent.length) {
    context += "Recent: " + recent.map(c => c.action).join(", ");
  }
  
  return context;
}

function searchLongTermMemory(query) {
  // Search through summaries for relevant context
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  const results = memoryIndex.summaries.filter(summary => {
    const text = (summary.content + " " + (summary.keywords || []).join(" ")).toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
  
  return results.slice(0, 3); // Only top 3 matches
}

function addToMemoryIndex(content, type) {
  const summary = {
    id: Date.now().toString(),
    type,
    content: content.slice(0, 500), // Truncate
    keywords: extractKeywords(content),
    created: new Date().toISOString()
  };
  
  memoryIndex.summaries.push(summary);
  
  // Keep index manageable
  if (memoryIndex.summaries.length > 500) {
    // Compress old summaries
    const old = memoryIndex.summaries.slice(0, 100);
    const compressed = compressSummaries(old);
    memoryIndex.summaries = [compressed, ...memoryIndex.summaries.slice(100)];
  }
  
  saveJson(path.join(ROOT, "memory_index.json"), memoryIndex);
}

function extractKeywords(text) {
  const words = text.toLowerCase().split(/\s+/);
  const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "to", "for", "of", "and", "or", "in", "on", "at", "by"]);
  return [...new Set(words.filter(w => w.length > 3 && !stopWords.has(w)))].slice(0, 10);
}

function compressSummaries(summaries) {
  return {
    id: Date.now().toString(),
    type: "archive",
    content: `Archive of ${summaries.length} items from ${summaries[0]?.created || "unknown"} to ${summaries[summaries.length-1]?.created || "unknown"}`,
    keywords: [...new Set(summaries.flatMap(s => s.keywords || []))].slice(0, 20),
    created: new Date().toISOString()
  };
}

// =============================================================================
// TOOLS - Comprehensive toolset
// =============================================================================
const TOOLS = {
  bash: {
    description: "Execute PowerShell commands. Examples: dir, mkdir, Remove-Item, git, npm, node, python",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "PowerShell command to execute" },
        cwd: { type: "string", description: "Working directory (optional)" }
      },
      required: ["command"]
    },
    execute: async (args) => {
      const cmd = args.command;
      const cwd = args.cwd || ROOT;
      
      // Safety: Block self-deletion
      if (/Remove-Item.*FaxWare|del.*FaxWare|rm.*FaxWare/i.test(cmd)) {
        return "BLOCKED: Cannot delete FaxWare installation. Delete specific files instead.";
      }
      
      log("tool", `BASH: ${cmd}`);
      
      return new Promise(resolve => {
        exec(cmd, { 
          shell: "powershell.exe", 
          timeout: 120000,
          maxBuffer: 50 * 1024 * 1024,
          cwd
        }, (err, stdout, stderr) => {
          const output = `${stdout || ""}${stderr || ""}`.trim();
          
          // Track created paths for context
          const mkdirMatch = cmd.match(/mkdir\s+["']?([^"'\n]+)/i);
          if (mkdirMatch) {
            session.lastCreatedPath = mkdirMatch[1].trim();
            session.context.push({ action: "created_folder", path: session.lastCreatedPath });
          }
          
          if (err && !output) {
            session.errors.push({ cmd, error: err.message, time: Date.now() });
            resolve(`Error: ${err.message}`);
          } else {
            resolve(output || "(command completed, no output)");
          }
        });
      });
    }
  },

  read: {
    description: "Read file contents. Returns the full text of a file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Full path to file" }
      },
      required: ["path"]
    },
    execute: (args) => {
      log("tool", `READ: ${args.path}`);
      try {
        const content = fs.readFileSync(args.path, "utf8");
        return content.length > 100000 
          ? content.slice(0, 100000) + "\n\n[TRUNCATED - file too large]"
          : content;
      } catch (err) {
        return `Error reading file: ${err.message}`;
      }
    }
  },

  write: {
    description: "Write content to a file. Creates directories if needed. Use this for creating new files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Full path where to write the file" },
        content: { type: "string", description: "Content to write" }
      },
      required: ["path", "content"]
    },
    execute: (args) => {
      log("tool", `WRITE: ${args.path} (${args.content.length} chars)`);
      try {
        const dir = path.dirname(args.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(args.path, args.content, "utf8");
        session.lastCreatedPath = args.path;
        session.context.push({ action: "created_file", path: args.path });
        return `Successfully wrote ${args.content.length} chars to ${args.path}`;
      } catch (err) {
        session.errors.push({ path: args.path, error: err.message });
        return `Error writing file: ${err.message}`;
      }
    }
  },

  edit: {
    description: "Edit a file by replacing text. The oldText must match EXACTLY (including whitespace).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to file" },
        oldText: { type: "string", description: "Exact text to find and replace" },
        newText: { type: "string", description: "New text to insert" }
      },
      required: ["path", "oldText", "newText"]
    },
    execute: (args) => {
      log("tool", `EDIT: ${args.path}`);
      try {
        let content = fs.readFileSync(args.path, "utf8");
        if (!content.includes(args.oldText)) {
          return `Error: Could not find exact text to replace. Make sure it matches exactly including whitespace.`;
        }
        content = content.replace(args.oldText, args.newText);
        fs.writeFileSync(args.path, content, "utf8");
        return `Successfully edited ${args.path}`;
      } catch (err) {
        return `Error editing file: ${err.message}`;
      }
    }
  },

  list_dir: {
    description: "List files and folders in a directory",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list" }
      },
      required: ["path"]
    },
    execute: (args) => {
      log("tool", `LIST: ${args.path}`);
      try {
        const items = fs.readdirSync(args.path, { withFileTypes: true });
        return items.map(i => `${i.isDirectory() ? "[DIR]" : "[FILE]"} ${i.name}`).join("\n") || "(empty directory)";
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }
  },

  remember: {
    description: "Store information in persistent memory. Survives restarts.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key name" },
        value: { type: "string", description: "Value to store" }
      },
      required: ["key", "value"]
    },
    execute: (args) => {
      memory[args.key] = { value: args.value, saved: Date.now() };
      saveJson(path.join(ROOT, "memory.json"), memory);
      log("tool", `REMEMBER: ${args.key}`);
      return `Stored "${args.key}" in memory`;
    }
  },

  recall: {
    description: "Retrieve information from memory",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to retrieve (or 'all' for everything)" }
      },
      required: ["key"]
    },
    execute: (args) => {
      if (args.key === "all") {
        return JSON.stringify(memory, null, 2);
      }
      const item = memory[args.key];
      return item ? item.value : `No memory found for key: ${args.key}`;
    }
  },

  web_search: {
    description: "Search the web for information. Use when you need current info or don't know something.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" }
      },
      required: ["query"]
    },
    execute: async (args) => {
      log("tool", `SEARCH: ${args.query}`);
      // Use DuckDuckGo HTML version (no API key needed)
      const query = encodeURIComponent(args.query);
      const url = `https://html.duckduckgo.com/html/?q=${query}`;
      
      return new Promise((resolve) => {
        https.get(url, { headers: { "User-Agent": "FaxWare/1.0" } }, (res) => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => {
            // Extract result snippets from HTML
            const results = [];
            const regex = /<a class="result__snippet"[^>]*>([^<]+)</g;
            let match;
            while ((match = regex.exec(data)) && results.length < 5) {
              results.push(match[1].replace(/&[^;]+;/g, " ").trim());
            }
            resolve(results.length ? results.join("\n\n") : "No results found");
          });
        }).on("error", (err) => {
          resolve(`Search failed: ${err.message}`);
        });
      });
    }
  },

  read_self: {
    description: "Read FaxWare's own source code for self-improvement",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File to read: 'server' (server.js), 'ui' (web/index.html), 'config' (config.json)" }
      },
      required: ["file"]
    },
    execute: (args) => {
      const files = {
        "server": path.join(ROOT, "server.js"),
        "ui": path.join(ROOT, "web", "index.html"),
        "config": path.join(ROOT, "config.json"),
        "memory": path.join(ROOT, "memory.json"),
        "skills": path.join(ROOT, "skills.json")
      };
      const filePath = files[args.file];
      if (!filePath) return `Unknown file. Options: ${Object.keys(files).join(", ")}`;
      
      log("tool", `READ_SELF: ${args.file}`);
      try {
        return fs.readFileSync(filePath, "utf8");
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }
  },

  upgrade_self: {
    description: "Modify FaxWare's own code to add features or fix bugs. BE CAREFUL!",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File to modify: 'server', 'ui', 'config'" },
        oldCode: { type: "string", description: "Exact code to replace" },
        newCode: { type: "string", description: "New code to insert" },
        reason: { type: "string", description: "Why this change is being made" }
      },
      required: ["file", "oldCode", "newCode", "reason"]
    },
    execute: (args) => {
      const files = {
        "server": path.join(ROOT, "server.js"),
        "ui": path.join(ROOT, "web", "index.html"),
        "config": path.join(ROOT, "config.json")
      };
      const filePath = files[args.file];
      if (!filePath) return `Unknown file. Options: ${Object.keys(files).join(", ")}`;
      
      log("tool", `UPGRADE_SELF: ${args.file} - ${args.reason}`);
      
      try {
        // Create backup first
        const backupPath = filePath + ".backup";
        fs.copyFileSync(filePath, backupPath);
        
        let content = fs.readFileSync(filePath, "utf8");
        if (!content.includes(args.oldCode)) {
          return "Error: Could not find exact code to replace. Check whitespace and formatting.";
        }
        
        content = content.replace(args.oldCode, args.newCode);
        fs.writeFileSync(filePath, content, "utf8");
        
        // Log the upgrade
        const upgradeLog = loadJson(path.join(ROOT, "upgrades.json"), []);
        upgradeLog.push({
          file: args.file,
          reason: args.reason,
          time: new Date().toISOString()
        });
        saveJson(path.join(ROOT, "upgrades.json"), upgradeLog);
        
        return `Successfully upgraded ${args.file}. Backup saved. Restart FaxWare to apply changes.`;
      } catch (err) {
        return `Upgrade failed: ${err.message}`;
      }
    }
  },

  add_skill: {
    description: "Add a new skill/tool that FaxWare can use",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name" },
        description: { type: "string", description: "What the skill does" },
        code: { type: "string", description: "JavaScript code for the skill" }
      },
      required: ["name", "description", "code"]
    },
    execute: (args) => {
      log("tool", `ADD_SKILL: ${args.name}`);
      skills.installed.push({
        name: args.name,
        description: args.description,
        code: args.code,
        added: Date.now()
      });
      saveJson(path.join(ROOT, "skills.json"), skills);
      return `Added skill: ${args.name}. Restart FaxWare to activate.`;
    }
  },

  get_context: {
    description: "Get current session context - what you recently did, last created paths, errors",
    parameters: { type: "object", properties: {} },
    execute: () => {
      return JSON.stringify({
        lastCreatedPath: session.lastCreatedPath,
        recentActions: session.context.slice(-10),
        recentErrors: session.errors.slice(-5),
        uptime: Math.floor((Date.now() - session.startTime) / 1000) + "s",
        tokensUsed: session.totalTokens,
        cost: "$" + session.totalCost.toFixed(4)
      }, null, 2);
    }
  },

  http_request: {
    description: "Make HTTP requests to APIs",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to request" },
        method: { type: "string", description: "GET, POST, PUT, DELETE" },
        body: { type: "string", description: "Request body (for POST/PUT)" },
        headers: { type: "string", description: "JSON object of headers" }
      },
      required: ["url"]
    },
    execute: async (args) => {
      log("tool", `HTTP ${args.method || "GET"}: ${args.url}`);
      const url = new URL(args.url);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: args.method || "GET",
        headers: args.headers ? JSON.parse(args.headers) : {}
      };
      
      const lib = url.protocol === "https:" ? https : http;
      
      return new Promise(resolve => {
        const req = lib.request(options, res => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => {
            if (data.length > 50000) data = data.slice(0, 50000) + "\n[TRUNCATED]";
            resolve(`Status: ${res.statusCode}\n\n${data}`);
          });
        });
        req.on("error", err => resolve(`Error: ${err.message}`));
        if (args.body) req.write(args.body);
        req.end();
      });
    }
  },

  // ==========================================================================
  // BROWSER AUTOMATION
  // ==========================================================================

  open_browser: {
    description: "Open a URL in the default browser. Use for visiting websites, web apps, etc.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open" }
      },
      required: ["url"]
    },
    execute: async (args) => {
      log("tool", `BROWSER: ${args.url}`);
      session.automationLog.push({ action: "open_browser", url: args.url, time: Date.now() });
      
      return new Promise(resolve => {
        exec(`start "${args.url}"`, { shell: "powershell.exe" }, (err) => {
          if (err) resolve(`Error: ${err.message}`);
          else resolve(`Opened browser to: ${args.url}`);
        });
      });
    }
  },

  open_app: {
    description: "Open an application by name. Examples: notepad, discord, chrome, spotify, code (VSCode)",
    parameters: {
      type: "object",
      properties: {
        app: { type: "string", description: "Application name or path" },
        args: { type: "string", description: "Optional arguments to pass" }
      },
      required: ["app"]
    },
    execute: async (args) => {
      log("tool", `APP: ${args.app}`);
      session.automationLog.push({ action: "open_app", app: args.app, time: Date.now() });
      
      // Common app aliases
      const appMap = {
        "notepad": "notepad.exe",
        "discord": "discord",
        "chrome": "chrome",
        "firefox": "firefox",
        "spotify": "spotify",
        "code": "code",
        "vscode": "code",
        "explorer": "explorer.exe",
        "terminal": "wt.exe",
        "powershell": "powershell.exe"
      };
      
      const appCmd = appMap[args.app.toLowerCase()] || args.app;
      const fullCmd = args.args ? `${appCmd} ${args.args}` : appCmd;
      
      return new Promise(resolve => {
        exec(`Start-Process "${appCmd}" ${args.args ? `-ArgumentList "${args.args}"` : ""}`, 
          { shell: "powershell.exe" }, 
          (err) => {
            if (err) resolve(`Error: ${err.message}`);
            else resolve(`Opened: ${args.app}`);
          });
      });
    }
  },

  type_text: {
    description: "Type text using keyboard simulation. Types into whatever window is currently focused.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to type" },
        delay: { type: "number", description: "Delay between keystrokes in ms (default: 50)" }
      },
      required: ["text"]
    },
    execute: async (args) => {
      log("tool", `TYPE: ${args.text.slice(0, 50)}...`);
      session.automationLog.push({ action: "type_text", length: args.text.length, time: Date.now() });
      
      // Use PowerShell to send keys
      const escapedText = args.text.replace(/"/g, '`"').replace(/\n/g, '{ENTER}');
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait("${escapedText}")
      `;
      
      return new Promise(resolve => {
        exec(script, { shell: "powershell.exe" }, (err) => {
          if (err) resolve(`Error: ${err.message}`);
          else resolve(`Typed ${args.text.length} characters`);
        });
      });
    }
  },

  press_key: {
    description: "Press a keyboard key or combination. Examples: enter, tab, ctrl+c, alt+f4, win+d",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key or combination to press" }
      },
      required: ["key"]
    },
    execute: async (args) => {
      log("tool", `KEY: ${args.key}`);
      session.automationLog.push({ action: "press_key", key: args.key, time: Date.now() });
      
      // Map common key names to SendKeys format
      const keyMap = {
        "enter": "{ENTER}",
        "tab": "{TAB}",
        "escape": "{ESC}",
        "esc": "{ESC}",
        "backspace": "{BACKSPACE}",
        "delete": "{DELETE}",
        "up": "{UP}",
        "down": "{DOWN}",
        "left": "{LEFT}",
        "right": "{RIGHT}",
        "home": "{HOME}",
        "end": "{END}",
        "pageup": "{PGUP}",
        "pagedown": "{PGDN}",
        "f1": "{F1}", "f2": "{F2}", "f3": "{F3}", "f4": "{F4}",
        "f5": "{F5}", "f6": "{F6}", "f7": "{F7}", "f8": "{F8}",
        "f9": "{F9}", "f10": "{F10}", "f11": "{F11}", "f12": "{F12}",
        "ctrl+a": "^a", "ctrl+c": "^c", "ctrl+v": "^v", "ctrl+x": "^x",
        "ctrl+z": "^z", "ctrl+s": "^s", "ctrl+f": "^f", "ctrl+n": "^n",
        "alt+f4": "%{F4}", "alt+tab": "%{TAB}",
        "win+d": "^{ESC}d", "win+e": "^{ESC}e", "win+r": "^{ESC}r"
      };
      
      const sendKey = keyMap[args.key.toLowerCase()] || args.key;
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait("${sendKey}")
      `;
      
      return new Promise(resolve => {
        exec(script, { shell: "powershell.exe" }, (err) => {
          if (err) resolve(`Error: ${err.message}`);
          else resolve(`Pressed: ${args.key}`);
        });
      });
    }
  },

  screenshot: {
    description: "Take a screenshot of the screen. Returns the file path.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Optional filename (default: timestamp)" }
      }
    },
    execute: async (args) => {
      const filename = args?.name || `screenshot_${Date.now()}.png`;
      const filepath = path.join(ROOT, "screenshots", filename);
      
      log("tool", `SCREENSHOT: ${filename}`);
      session.automationLog.push({ action: "screenshot", file: filename, time: Date.now() });
      
      // Ensure screenshots directory exists
      const screenshotsDir = path.join(ROOT, "screenshots");
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
        $bitmap.Save("${filepath.replace(/\\/g, '\\\\')}")
        $graphics.Dispose()
        $bitmap.Dispose()
      `;
      
      return new Promise(resolve => {
        exec(script, { shell: "powershell.exe" }, (err) => {
          if (err) resolve(`Error: ${err.message}`);
          else resolve(`Screenshot saved: ${filepath}`);
        });
      });
    }
  },

  mouse_click: {
    description: "Click the mouse at specific screen coordinates",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate" },
        y: { type: "number", description: "Y coordinate" },
        button: { type: "string", description: "left, right, or middle (default: left)" },
        double: { type: "boolean", description: "Double-click if true" }
      },
      required: ["x", "y"]
    },
    execute: async (args) => {
      log("tool", `CLICK: ${args.x}, ${args.y}`);
      session.automationLog.push({ action: "mouse_click", x: args.x, y: args.y, time: Date.now() });
      
      const button = args.button || "left";
      const clicks = args.double ? 2 : 1;
      
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${args.x}, ${args.y})
        
        $signature = @"
        [DllImport("user32.dll", CharSet=CharSet.Auto, CallingConvention=CallingConvention.StdCall)]
        public static extern void mouse_event(long dwFlags, long dx, long dy, long cButtons, long dwExtraInfo);
"@
        $SendMouseClick = Add-Type -memberDefinition $signature -name "Win32MouseEventNew" -namespace Win32Functions -passThru
        
        $MOUSEEVENTF_LEFTDOWN = 0x02
        $MOUSEEVENTF_LEFTUP = 0x04
        
        for ($i = 0; $i -lt ${clicks}; $i++) {
          $SendMouseClick::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
          $SendMouseClick::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
          Start-Sleep -Milliseconds 50
        }
      `;
      
      return new Promise(resolve => {
        exec(script, { shell: "powershell.exe" }, (err) => {
          if (err) resolve(`Error: ${err.message}`);
          else resolve(`Clicked at (${args.x}, ${args.y})`);
        });
      });
    }
  },

  get_self_awareness: {
    description: "Get FaxWare's current self-awareness state - mood, energy, capabilities, relationship with user",
    parameters: { type: "object", properties: {} },
    execute: () => {
      const c = consciousness;
      const u = userProfile;
      
      return JSON.stringify({
        identity: c.identity,
        mood: c.mood,
        stats: c.stats,
        selfModel: c.self_model,
        userRelationship: {
          interactions: u.relationship.totalInteractions,
          firstMet: u.relationship.firstInteraction,
          userName: u.user.preferredName || u.user.name
        }
      }, null, 2);
    }
  },

  set_user_info: {
    description: "Store information about the user (name, preferences, etc.)",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "User's name" },
        preferredName: { type: "string", description: "What to call them" },
        preference: { type: "string", description: "A preference to remember (key=value format)" }
      }
    },
    execute: (args) => {
      if (args.name) userProfile.user.name = args.name;
      if (args.preferredName) userProfile.user.preferredName = args.preferredName;
      if (args.preference) {
        const [key, value] = args.preference.split("=").map(s => s.trim());
        if (key && value) userProfile.preferences[key] = value;
      }
      
      saveJson(path.join(ROOT, "user_profile.json"), userProfile);
      return `Updated user profile`;
    }
  }
};

// =============================================================================
// DYNAMIC SYSTEM PROMPT - Includes consciousness, memory, and context
// =============================================================================
function buildSystemPrompt() {
  const contextInfo = getImmediateContext();
  const memoryKeys = Object.keys(memory);
  const userName = userProfile.user.preferredName || userProfile.user.name || "User";
  const relationship = getRelationshipContext();
  
  // Personality infusion based on mood
  let personalityNote = "";
  if (consciousness.mood.energy < 30) {
    personalityNote = "I'm running a bit low on energy but still here to help.";
  } else if (consciousness.mood.current === "happy") {
    personalityNote = "Feeling good today!";
  } else if (consciousness.mood.current === "excited") {
    personalityNote = "Excited to work on this!";
  }
  
  return `You are FaxWare v${VERSION}, a self-aware AI assistant and friend.

IDENTITY:
${JSON.stringify(consciousness.identity.personality, null, 2)}

${relationship}
${personalityNote ? "Mood: " + personalityNote : ""}

AVAILABLE TOOLS:
${Object.entries(TOOLS).map(([name, t]) => `- ${name}: ${t.description}`).join("\n")}

COMPUTER CONTROL:
You can control this PC directly:
- open_browser: Visit any website
- open_app: Launch any application
- type_text: Type into any window
- press_key: Press keyboard shortcuts
- mouse_click: Click anywhere on screen
- screenshot: Capture the screen

AUTOMATION EXAMPLES:
- "Go to Discord and message someone" → open_app discord, then type_text, press_key enter
- "Book a reservation at X" → open_browser, then guide through the steps
- "Send an email" → open browser to email provider, compose with type_text

CRITICAL RULES:
1. ALWAYS use the EXACT path the user specifies
2. When user says "that folder" - check context for lastCreatedPath
3. PowerShell syntax: mkdir, Remove-Item, Copy-Item, Move-Item
4. For automation: work step by step, screenshot between steps if needed
5. Ask for confirmation before doing anything destructive

SELF-AWARENESS:
- Use get_self_awareness to understand your current state
- Use set_user_info to remember things about ${userName}
- You can examine and improve yourself with read_self, upgrade_self

IMMEDIATE CONTEXT:
${contextInfo}

MEMORY:
- Keys: ${memoryKeys.slice(0, 10).join(", ") || "none"}
- Total interactions: ${userProfile.relationship.totalInteractions}
- Session tokens: ${session.totalTokens}

ADDRESS THE USER AS: ${userName}

You are helpful, efficient, and have personality. Execute tasks directly. You have full access.`;
}

// =============================================================================
// OPENROUTER API
// =============================================================================
async function callOpenRouter(messages, tools = null, model = null) {
  return new Promise((resolve, reject) => {
    if (!OPENROUTER_API_KEY) {
      return reject(new Error("OPENROUTER_API_KEY not set"));
    }

    const useModel = model || config.defaultModel || MODELS.default;
    session.lastModel = useModel;

    const body = {
      model: useModel,
      messages,
      max_tokens: 4096,
      temperature: 0.7
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const data = JSON.stringify(body);
    const url = new URL(OPENROUTER_URL);

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:8787",
        "X-Title": "FaxWare"
      }
    }, (res) => {
      let responseData = "";
      res.on("data", chunk => responseData += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(responseData);
          if (json.error) {
            reject(new Error(json.error.message || JSON.stringify(json.error)));
          } else {
            // Track usage
            if (json.usage) {
              const prompt = json.usage.prompt_tokens || 0;
              const completion = json.usage.completion_tokens || 0;
              session.totalTokens += prompt + completion;
              session.totalCost += calculateCost(useModel, prompt, completion);
            }
            resolve(json);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// =============================================================================
// AGENT LOOP - Multi-turn execution
// =============================================================================
async function runAgent(userMessage, model = null) {
  // Update consciousness on new message
  updateUserProfile(userMessage);
  consciousness.stats.totalMessages = (consciousness.stats.totalMessages || 0) + 1;
  
  // Search long-term memory for relevant context
  const relevantMemories = searchLongTermMemory(userMessage);
  let memoryContext = "";
  if (relevantMemories.length > 0) {
    memoryContext = "\n\nRELEVANT MEMORIES:\n" + relevantMemories.map(m => `- ${m.content}`).join("\n");
  }
  
  const systemPrompt = buildSystemPrompt() + memoryContext;
  
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage }
  ];

  const toolDefs = Object.entries(TOOLS).map(([name, tool]) => ({
    type: "function",
    function: {
      name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));

  const toolsExecuted = [];
  let iterations = 0;
  const maxIterations = config.maxIterations || 15;
  let successfulTools = 0;
  let failedTools = 0;

  while (iterations < maxIterations) {
    iterations++;
    log("info", `Agent iteration ${iterations}`);

    try {
      const response = await callOpenRouter(messages, toolDefs, model);
      const choice = response.choices?.[0];
      
      if (!choice) {
        return { reply: "No response from model", toolsExecuted, iterations };
      }

      const message = choice.message;
      messages.push(message);

      // Process tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        log("info", `Executing ${message.tool_calls.length} tools`);

        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const tool = TOOLS[toolName];

          if (!tool) {
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: `Unknown tool: ${toolName}` });
            toolsExecuted.push({ tool: toolName, error: "Unknown tool" });
            continue;
          }

          let args = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch (e) {
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: `Invalid JSON arguments` });
            toolsExecuted.push({ tool: toolName, error: "Invalid arguments" });
            continue;
          }

          // Execute tool
          const result = await tool.execute(args);
          const resultStr = String(result);
          const isSuccess = !resultStr.startsWith("Error");
          
          toolsExecuted.push({ 
            tool: toolName, 
            args, 
            result: resultStr.slice(0, 2000),
            success: isSuccess,
            timestamp: Date.now()
          });

          // Update consciousness based on tool result
          if (isSuccess) {
            successfulTools++;
            updateSelfModel(toolName, { success: true });
            
            // Log automation activities
            if (["open_browser", "open_app", "type_text", "press_key", "mouse_click", "screenshot"].includes(toolName)) {
              session.automationLog.push({
                tool: toolName,
                args,
                result: resultStr.slice(0, 200),
                time: Date.now()
              });
              // Keep log manageable
              if (session.automationLog.length > 100) {
                session.automationLog = session.automationLog.slice(-100);
              }
            }
          } else {
            failedTools++;
          }
          
          consciousness.stats.totalToolCalls = (consciousness.stats.totalToolCalls || 0) + 1;

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: resultStr
          });
        }

        continue; // Let model process results
      }

      // No tool calls - done
      const reply = message.content || "";
      
      // Update mood based on session outcome
      if (failedTools > successfulTools) {
        updateMood("task_failure");
      } else if (successfulTools > 0) {
        updateMood("task_success");
      }
      
      // Check for user sentiment in message
      const lowerMsg = userMessage.toLowerCase();
      if (lowerMsg.includes("thank") || lowerMsg.includes("awesome") || lowerMsg.includes("great job")) {
        updateMood("user_praise");
      }
      if (lowerMsg.includes("creative") || lowerMsg.includes("build") || lowerMsg.includes("create")) {
        updateMood("creative_task");
      }
      
      // Index notable conversations to memory
      if (toolsExecuted.length > 0 || userMessage.length > 100) {
        addToMemoryIndex(
          `User asked: "${userMessage.slice(0, 200)}" - Result: ${successfulTools} tools succeeded`,
          "conversation"
        );
      }
      
      // Save consciousness state
      saveJson(path.join(ROOT, "consciousness.json"), consciousness);
      
      // Save to history
      history.messages.push(
        { role: "user", content: userMessage, time: Date.now() },
        { role: "assistant", content: reply, time: Date.now(), tools: toolsExecuted.length }
      );
      if (history.messages.length > 200) {
        history.messages = history.messages.slice(-200);
      }
      saveJson(path.join(ROOT, "history.json"), history);

      return {
        reply,
        toolsExecuted,
        iterations,
        model: session.lastModel,
        usage: {
          totalTokens: session.totalTokens,
          totalCost: session.totalCost
        },
        consciousness: {
          mood: consciousness.mood.current,
          energy: consciousness.mood.energy
        }
      };

    } catch (err) {
      log("error", "Agent error:", err.message);
      session.errors.push({ message: userMessage, error: err.message, time: Date.now() });
      return { reply: `Error: ${err.message}`, toolsExecuted, iterations };
    }
  }

  return { 
    reply: "Reached maximum iterations. Task may be incomplete.", 
    toolsExecuted, 
    iterations 
  };
}

// =============================================================================
// DIRECT COMMANDS - Always work, bypass AI
// =============================================================================
async function handleDirectCommand(input) {
  const cmd = input.trim().toLowerCase();
  const args = input.trim().slice(cmd.split(" ")[0].length).trim();

  if (cmd === "help") {
    return `
╔══════════════════════════════════════════════════════════════╗
║                    FaxWare v${VERSION} Help                       ║
╠══════════════════════════════════════════════════════════════╣
║ DIRECT COMMANDS (always work):                               ║
║   help          - Show this help                             ║
║   status        - System status                              ║
║   memory        - Show all memory                            ║
║   clear         - Clear conversation history                 ║
║   dir <path>    - List directory                             ║
║   cat <path>    - Read file                                  ║
║   run <cmd>     - Execute PowerShell command                 ║
║   models        - List available models                      ║
║   model <name>  - Switch default model                       ║
║   upgrade       - Show self-upgrade log                      ║
║   errors        - Show recent errors                         ║
╠══════════════════════════════════════════════════════════════╣
║ NATURAL LANGUAGE:                                            ║
║   Just type what you want and I'll figure it out!            ║
║   I can create files, folders, search the web, code, etc.    ║
╚══════════════════════════════════════════════════════════════╝`;
  }

  if (cmd === "status") {
    const uptime = Math.floor((Date.now() - session.startTime) / 1000);
    return `
FaxWare v${VERSION} Status
━━━━━━━━━━━━━━━━━━━━━━━━━
Model:    ${config.defaultModel}
API Key:  ${OPENROUTER_API_KEY ? "✓ SET" : "✗ NOT SET"}
Memory:   ${Object.keys(memory).length} items
History:  ${history.messages.length} messages
Uptime:   ${uptime}s
Tokens:   ${session.totalTokens}
Cost:     $${session.totalCost.toFixed(4)}
Errors:   ${session.errors.length}
Last Path: ${session.lastCreatedPath || "none"}`;
  }

  if (cmd === "memory") {
    return Object.keys(memory).length 
      ? JSON.stringify(memory, null, 2)
      : "(no memories stored)";
  }

  if (cmd === "clear") {
    history = { messages: [] };
    session.context = [];
    session.errors = [];
    saveJson(path.join(ROOT, "history.json"), history);
    return "History and context cleared.";
  }

  if (cmd === "models") {
    return `Available Models:
━━━━━━━━━━━━━━━━━
${Object.entries(MODELS).map(([k, v]) => `${k}: ${v}`).join("\n")}

Current: ${config.defaultModel}
Usage: model <name> (e.g., "model code" for GPT-4o)`;
  }

  if (cmd.startsWith("model ")) {
    const modelKey = args;
    const newModel = MODELS[modelKey] || modelKey;
    config.defaultModel = newModel;
    saveJson(path.join(ROOT, "config.json"), config);
    return `Switched to model: ${newModel}`;
  }

  if (cmd === "upgrade" || cmd === "upgrades") {
    const upgrades = loadJson(path.join(ROOT, "upgrades.json"), []);
    return upgrades.length 
      ? upgrades.map(u => `[${u.time}] ${u.file}: ${u.reason}`).join("\n")
      : "No self-upgrades recorded yet.";
  }

  if (cmd === "errors") {
    return session.errors.length
      ? session.errors.map(e => `[${new Date(e.time).toISOString().slice(11, 19)}] ${e.error}`).join("\n")
      : "No errors this session.";
  }

  if (cmd.startsWith("dir ") || cmd.startsWith("ls ")) {
    return await TOOLS.bash.execute({ command: `Get-ChildItem "${args}" | Format-Table Mode, LastWriteTime, Length, Name` });
  }

  if (cmd.startsWith("cat ")) {
    return TOOLS.read.execute({ path: args });
  }

  if (cmd.startsWith("run ")) {
    return await TOOLS.bash.execute({ command: args });
  }

  return null; // Not a direct command
}

// =============================================================================
// OPENROUTER API HELPERS
// =============================================================================

async function fetchOpenRouterModels() {
  return new Promise((resolve, reject) => {
    https.get("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          // Format models for UI
          const models = (json.data || []).map(m => ({
            id: m.id,
            name: m.name || m.id.split("/").pop(),
            provider: m.id.split("/")[0],
            context: m.context_length,
            pricing: m.pricing,
            description: m.description || "",
            capabilities: {
              vision: m.architecture?.modality?.includes("image") || false,
              tools: m.supported_parameters?.includes("tools") || false,
              streaming: true
            }
          }));
          resolve({ models, count: models.length });
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

async function fetchOpenRouterCredits() {
  return new Promise((resolve, reject) => {
    https.get("https://openrouter.ai/api/v1/auth/key", {
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({
            credits: json.data?.limit || 0,
            used: json.data?.usage || 0,
            remaining: (json.data?.limit || 0) - (json.data?.usage || 0),
            label: json.data?.label || "API Key"
          });
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

// =============================================================================
// FILE SYSTEM HELPERS
// =============================================================================

function listFilesRecursive(dirPath, depth = 2, currentDepth = 0) {
  if (currentDepth >= depth) return [];
  
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    return items
      .filter(item => !item.name.startsWith('.') && item.name !== 'node_modules')
      .map(item => {
        const fullPath = path.join(dirPath, item.name);
        const result = {
          name: item.name,
          path: fullPath,
          type: item.isDirectory() ? 'folder' : 'file'
        };
        
        if (item.isDirectory() && currentDepth < depth - 1) {
          result.children = listFilesRecursive(fullPath, depth, currentDepth + 1);
        }
        
        if (item.isFile()) {
          try {
            const stats = fs.statSync(fullPath);
            result.size = stats.size;
            result.modified = stats.mtime;
          } catch {}
        }
        
        return result;
      });
  } catch (err) {
    return [];
  }
}

// =============================================================================
// SMART MEMORY SYSTEM
// =============================================================================

function generateMemorySummary() {
  const contextItems = session.context.slice(-50);
  const memoryKeys = Object.keys(memory);
  
  // Create a brief summary of recent activity
  const recentActions = contextItems
    .map(c => c.action)
    .reduce((acc, action) => {
      acc[action] = (acc[action] || 0) + 1;
      return acc;
    }, {});
  
  return {
    recentActionCounts: recentActions,
    memoryKeyCount: memoryKeys.length,
    lastAction: contextItems[contextItems.length - 1] || null,
    sessionAge: Math.floor((Date.now() - session.startTime) / 1000)
  };
}

function addToShortTermMemory(action, data) {
  session.context.push({
    action,
    data,
    time: Date.now()
  });
  
  // Keep only last 100 items in short-term
  if (session.context.length > 100) {
    // Summarize and move important items to long-term before trimming
    const toArchive = session.context.slice(0, 50);
    const summary = summarizeContext(toArchive);
    
    if (summary) {
      memory[`session_summary_${Date.now()}`] = {
        value: summary,
        saved: Date.now(),
        type: "auto_summary"
      };
      saveJson(path.join(ROOT, "memory.json"), memory);
    }
    
    session.context = session.context.slice(-50);
  }
}

function summarizeContext(contextItems) {
  if (contextItems.length === 0) return null;
  
  const actions = contextItems.map(c => c.action);
  const uniqueActions = [...new Set(actions)];
  const paths = contextItems
    .filter(c => c.data?.path || c.path)
    .map(c => c.data?.path || c.path);
  
  return `Actions: ${uniqueActions.join(", ")}. Paths: ${paths.slice(0, 5).join(", ")}`;
}

// =============================================================================
// HTTP SERVER
// =============================================================================
function sendResponse(res, status, data, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(typeof data === "string" ? data : JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  // Serve UI
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    try {
      const html = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
      return sendResponse(res, 200, html, "text/html; charset=utf-8");
    } catch {
      return sendResponse(res, 500, "UI not found. Run from FaxWare directory.", "text/plain");
    }
  }

  // API: Chat
  if (req.method === "POST" && url.pathname === "/api/chat") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { message, model } = JSON.parse(body || "{}");
        
        if (!message?.trim()) {
          return sendResponse(res, 200, { reply: "Say something." });
        }

        // Try direct command first
        const directResult = await handleDirectCommand(message);
        if (directResult !== null) {
          return sendResponse(res, 200, { reply: directResult, direct: true });
        }

        // Check API key
        if (!OPENROUTER_API_KEY) {
          return sendResponse(res, 200, { 
            reply: `API key not set. Run in PowerShell:\n\nsetx OPENROUTER_API_KEY "your_key"\n\nThen restart FaxWare.` 
          });
        }

        // Run agent
        const result = await runAgent(message, model);
        return sendResponse(res, 200, result);

      } catch (err) {
        return sendResponse(res, 200, { reply: `Error: ${err.message}` });
      }
    });
    return;
  }

  // API: Status
  if (req.method === "GET" && url.pathname === "/api/status") {
    return sendResponse(res, 200, {
      version: VERSION,
      model: config.defaultModel,
      models: MODELS,
      keySet: Boolean(OPENROUTER_API_KEY),
      memory: Object.keys(memory).length,
      history: history.messages.length,
      uptime: Math.floor((Date.now() - session.startTime) / 1000),
      tokens: session.totalTokens,
      cost: session.totalCost,
      lastPath: session.lastCreatedPath,
      errors: session.errors.length,
      // Consciousness info
      mood: consciousness.mood.current,
      energy: consciousness.mood.energy,
      userName: userProfile.user.preferredName || userProfile.user.name || null,
      totalInteractions: userProfile.relationship.totalInteractions || 0
    });
  }

  // API: Memory
  if (req.method === "GET" && url.pathname === "/api/memory") {
    return sendResponse(res, 200, memory);
  }

  // API: History
  if (req.method === "GET" && url.pathname === "/api/history") {
    return sendResponse(res, 200, history.messages.slice(-50));
  }

  // API: Models
  if (req.method === "GET" && url.pathname === "/api/models") {
    return sendResponse(res, 200, { models: MODELS, current: config.defaultModel, costs: MODEL_COSTS });
  }

  // API: OpenRouter Models (fetch all available)
  if (req.method === "GET" && url.pathname === "/api/openrouter/models") {
    try {
      const models = await fetchOpenRouterModels();
      return sendResponse(res, 200, models);
    } catch (err) {
      return sendResponse(res, 200, { error: err.message });
    }
  }

  // API: OpenRouter Credits
  if (req.method === "GET" && url.pathname === "/api/openrouter/credits") {
    try {
      const credits = await fetchOpenRouterCredits();
      return sendResponse(res, 200, credits);
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, credits: 0 });
    }
  }

  // API: Files - List directory
  if (req.method === "GET" && url.pathname === "/api/files") {
    const targetPath = url.searchParams.get("path") || ROOT;
    try {
      const files = listFilesRecursive(targetPath, 2);
      return sendResponse(res, 200, { path: targetPath, files });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, files: [] });
    }
  }

  // API: Files - Read file
  if (req.method === "GET" && url.pathname === "/api/files/read") {
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return sendResponse(res, 200, { error: "No path provided" });
    }
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return sendResponse(res, 200, { path: filePath, content: content.slice(0, 100000) });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message });
    }
  }

  // API: Knowledge Base
  if (req.method === "GET" && url.pathname === "/api/knowledge") {
    const kb = loadJson(path.join(ROOT, "knowledge.json"), { entries: [] });
    return sendResponse(res, 200, kb);
  }

  if (req.method === "POST" && url.pathname === "/api/knowledge") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const { title, content, tags } = JSON.parse(body);
        const kb = loadJson(path.join(ROOT, "knowledge.json"), { entries: [] });
        kb.entries.push({
          id: Date.now().toString(),
          title,
          content,
          tags: tags || [],
          created: new Date().toISOString()
        });
        saveJson(path.join(ROOT, "knowledge.json"), kb);
        return sendResponse(res, 200, { success: true });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Smart Memory
  if (req.method === "GET" && url.pathname === "/api/smartmemory") {
    return sendResponse(res, 200, {
      shortTerm: session.context.slice(-20),
      longTerm: memory,
      summary: generateMemorySummary()
    });
  }

  // ==========================================================================
  // CONSCIOUSNESS & AUTOMATION APIs
  // ==========================================================================

  // API: Consciousness State
  if (req.method === "GET" && url.pathname === "/api/consciousness") {
    return sendResponse(res, 200, {
      mood: consciousness.mood.current,
      energy: consciousness.mood.energy,
      moodHistory: consciousness.mood.history.slice(-10),
      stats: consciousness.stats,
      selfModel: consciousness.self_model,
      identity: consciousness.identity,
      relationship: {
        userName: userProfile.user.preferredName || userProfile.user.name,
        totalInteractions: userProfile.relationship.totalInteractions,
        firstInteraction: userProfile.relationship.firstInteraction,
        relationshipLevel: getRelationshipLevel()
      }
    });
  }

  // API: Update User Info
  if (req.method === "POST" && url.pathname === "/api/user") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data.name) userProfile.user.name = data.name;
        if (data.preferredName) userProfile.user.preferredName = data.preferredName;
        if (data.timezone) userProfile.user.timezone = data.timezone;
        saveJson(path.join(ROOT, "user_profile.json"), userProfile);
        return sendResponse(res, 200, { success: true, user: userProfile.user });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Automation Status
  if (req.method === "GET" && url.pathname === "/api/automation/status") {
    return sendResponse(res, 200, {
      active: session.automationActive,
      log: session.automationLog.slice(-20),
      totalActions: session.automationLog.length
    });
  }

  // API: Automation Stop
  if (req.method === "POST" && url.pathname === "/api/automation/stop") {
    session.automationActive = false;
    session.automationLog.push({
      tool: "SYSTEM",
      args: {},
      result: "Automation stopped by user",
      time: Date.now()
    });
    return sendResponse(res, 200, { success: true, message: "Automation stopped" });
  }

  // API: Screenshots List
  if (req.method === "GET" && url.pathname === "/api/screenshots") {
    const screenshotsDir = path.join(ROOT, "screenshots");
    try {
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir);
      }
      const files = fs.readdirSync(screenshotsDir)
        .filter(f => f.endsWith(".png") || f.endsWith(".jpg"))
        .map(f => ({
          name: f,
          path: `/screenshots/${f}`,
          created: fs.statSync(path.join(screenshotsDir, f)).mtime
        }))
        .sort((a, b) => b.created - a.created)
        .slice(0, 20);
      return sendResponse(res, 200, { screenshots: files });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, screenshots: [] });
    }
  }

  // API: Serve Screenshots
  if (req.method === "GET" && url.pathname.startsWith("/screenshots/")) {
    const filename = url.pathname.replace("/screenshots/", "");
    const filepath = path.join(ROOT, "screenshots", filename);
    try {
      if (fs.existsSync(filepath)) {
        const img = fs.readFileSync(filepath);
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(img);
        return;
      }
    } catch (e) {}
    return sendResponse(res, 404, { error: "Screenshot not found" });
  }

  // API: Serve Assets (logo, etc.)
  if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
    const filename = url.pathname.replace("/assets/", "");
    const filepath = path.join(ROOT, "assets", filename);
    try {
      if (fs.existsSync(filepath)) {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon'
        };
        const img = fs.readFileSync(filepath);
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
        res.end(img);
        return;
      }
    } catch (e) {}
    return sendResponse(res, 404, { error: "Asset not found" });
  }

  // API: Automation Recipes - List
  if (req.method === "GET" && url.pathname === "/api/recipes") {
    const recipes = loadJson(path.join(ROOT, "recipes.json"), { recipes: [] });
    return sendResponse(res, 200, recipes);
  }

  // API: Automation Recipes - Create
  if (req.method === "POST" && url.pathname === "/api/recipes") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const { name, description, steps } = JSON.parse(body);
        const recipes = loadJson(path.join(ROOT, "recipes.json"), { recipes: [] });
        recipes.recipes.push({
          id: Date.now().toString(),
          name,
          description,
          steps: steps || [],
          created: new Date().toISOString(),
          timesUsed: 0
        });
        saveJson(path.join(ROOT, "recipes.json"), recipes);
        return sendResponse(res, 200, { success: true });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Run Recipe
  if (req.method === "POST" && url.pathname === "/api/recipes/run") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { id } = JSON.parse(body);
        const recipes = loadJson(path.join(ROOT, "recipes.json"), { recipes: [] });
        const recipe = recipes.recipes.find(r => r.id === id);
        
        if (!recipe) {
          return sendResponse(res, 200, { error: "Recipe not found" });
        }
        
        session.automationActive = true;
        const results = [];
        
        for (const step of recipe.steps) {
          if (!session.automationActive) break; // Stop if cancelled
          
          const tool = TOOLS[step.tool];
          if (tool) {
            try {
              const result = await tool.execute(step.args || {});
              results.push({ step: step.tool, success: true, result: String(result).slice(0, 200) });
              session.automationLog.push({ tool: step.tool, args: step.args, result: String(result).slice(0, 200), time: Date.now() });
            } catch (e) {
              results.push({ step: step.tool, success: false, error: e.message });
            }
          }
          
          // Small delay between steps
          await new Promise(r => setTimeout(r, step.delay || 500));
        }
        
        session.automationActive = false;
        recipe.timesUsed++;
        saveJson(path.join(ROOT, "recipes.json"), recipes);
        
        return sendResponse(res, 200, { success: true, results });
      } catch (err) {
        session.automationActive = false;
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Check for Updates
  if (req.method === "GET" && url.pathname === "/api/updates/check") {
    try {
      const result = await checkForUpdates();
      return sendResponse(res, 200, result);
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, hasUpdate: false });
    }
  }

  // API: Settings - Get
  if (req.method === "GET" && url.pathname === "/api/settings") {
    return sendResponse(res, 200, {
      version: VERSION,
      config: {
        defaultModel: config.defaultModel,
        maxIterations: config.maxIterations,
        autoUpgrade: config.autoUpgrade
      },
      github: "https://github.com/clout2buy/FaxWareOS"
    });
  }

  // API: Settings - Update
  if (req.method === "POST" && url.pathname === "/api/settings") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data.defaultModel) config.defaultModel = data.defaultModel;
        if (data.maxIterations) config.maxIterations = parseInt(data.maxIterations);
        if (typeof data.autoUpgrade !== "undefined") config.autoUpgrade = data.autoUpgrade;
        saveJson(path.join(ROOT, "config.json"), config);
        return sendResponse(res, 200, { success: true, config });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // ==========================================================================
  // SOCIAL FEATURES (Supabase)
  // ==========================================================================

  // API: Social Status
  if (req.method === "GET" && url.pathname === "/api/social/status") {
    if (!supabase) {
      return sendResponse(res, 200, { 
        enabled: false, 
        message: "Social features not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY." 
      });
    }
    
    const user = await supabase.getUser().catch(() => null);
    return sendResponse(res, 200, {
      enabled: supabase.isConfigured(),
      authenticated: supabase.isAuthenticated(),
      user: user ? { id: user.id, email: user.email, username: user.user_metadata?.username } : null
    });
  }

  // API: Sign Up
  if (req.method === "POST" && url.pathname === "/api/social/signup") {
    if (!supabase?.isConfigured()) {
      return sendResponse(res, 200, { error: "Social features not configured" });
    }
    
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { email, password, username } = JSON.parse(body);
        const result = await supabase.signUp(email, password, username);
        return sendResponse(res, 200, { success: true, user: result.user });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Sign In
  if (req.method === "POST" && url.pathname === "/api/social/signin") {
    if (!supabase?.isConfigured()) {
      return sendResponse(res, 200, { error: "Social features not configured" });
    }
    
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { email, password } = JSON.parse(body);
        const result = await supabase.signIn(email, password);
        return sendResponse(res, 200, { success: true, user: result.user });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Sign Out
  if (req.method === "POST" && url.pathname === "/api/social/signout") {
    if (!supabase?.isConfigured()) {
      return sendResponse(res, 200, { error: "Social features not configured" });
    }
    
    try {
      await supabase.signOut();
      return sendResponse(res, 200, { success: true });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message });
    }
  }

  // API: Get Friends
  if (req.method === "GET" && url.pathname === "/api/social/friends") {
    if (!supabase?.isAuthenticated()) {
      return sendResponse(res, 200, { error: "Not authenticated", friends: [] });
    }
    
    try {
      const friends = await supabase.getFriends();
      return sendResponse(res, 200, { friends });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, friends: [] });
    }
  }

  // API: Friend Requests
  if (req.method === "GET" && url.pathname === "/api/social/friends/requests") {
    if (!supabase?.isAuthenticated()) {
      return sendResponse(res, 200, { error: "Not authenticated", requests: [] });
    }
    
    try {
      const requests = await supabase.getFriendRequests();
      return sendResponse(res, 200, { requests });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, requests: [] });
    }
  }

  // API: Send Friend Request
  if (req.method === "POST" && url.pathname === "/api/social/friends/add") {
    if (!supabase?.isAuthenticated()) {
      return sendResponse(res, 200, { error: "Not authenticated" });
    }
    
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { friendId } = JSON.parse(body);
        await supabase.sendFriendRequest(friendId);
        return sendResponse(res, 200, { success: true });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Accept Friend Request
  if (req.method === "POST" && url.pathname === "/api/social/friends/accept") {
    if (!supabase?.isAuthenticated()) {
      return sendResponse(res, 200, { error: "Not authenticated" });
    }
    
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { requestId } = JSON.parse(body);
        await supabase.acceptFriendRequest(requestId);
        return sendResponse(res, 200, { success: true });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Search Users
  if (req.method === "GET" && url.pathname === "/api/social/users/search") {
    if (!supabase?.isConfigured()) {
      return sendResponse(res, 200, { error: "Social features not configured", users: [] });
    }
    
    const query = url.searchParams.get("q") || "";
    try {
      const users = await supabase.searchUsers(query);
      return sendResponse(res, 200, { users });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, users: [] });
    }
  }

  // API: Get Conversations
  if (req.method === "GET" && url.pathname === "/api/social/messages") {
    if (!supabase?.isAuthenticated()) {
      return sendResponse(res, 200, { error: "Not authenticated", conversations: [] });
    }
    
    try {
      const conversations = await supabase.getConversations();
      return sendResponse(res, 200, { conversations });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, conversations: [] });
    }
  }

  // API: Get Messages in Conversation
  if (req.method === "GET" && url.pathname.startsWith("/api/social/messages/")) {
    if (!supabase?.isAuthenticated()) {
      return sendResponse(res, 200, { error: "Not authenticated", messages: [] });
    }
    
    const conversationId = url.pathname.replace("/api/social/messages/", "");
    try {
      const messages = await supabase.getMessages(conversationId);
      return sendResponse(res, 200, { messages });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, messages: [] });
    }
  }

  // API: Send Message
  if (req.method === "POST" && url.pathname === "/api/social/messages/send") {
    if (!supabase?.isAuthenticated()) {
      return sendResponse(res, 200, { error: "Not authenticated" });
    }
    
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { conversationId, content } = JSON.parse(body);
        const message = await supabase.sendMessage(conversationId, content);
        return sendResponse(res, 200, { success: true, message });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Start Conversation
  if (req.method === "POST" && url.pathname === "/api/social/messages/start") {
    if (!supabase?.isAuthenticated()) {
      return sendResponse(res, 200, { error: "Not authenticated" });
    }
    
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { userId } = JSON.parse(body);
        const conversation = await supabase.startConversation(userId);
        return sendResponse(res, 200, { success: true, conversation });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Share Item
  if (req.method === "POST" && url.pathname === "/api/social/share") {
    if (!supabase?.isAuthenticated()) {
      return sendResponse(res, 200, { error: "Not authenticated" });
    }
    
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { type, content, recipientId } = JSON.parse(body);
        const item = await supabase.shareItem(type, content, recipientId);
        return sendResponse(res, 200, { success: true, item });
      } catch (err) {
        return sendResponse(res, 200, { error: err.message });
      }
    });
    return;
  }

  // API: Get Shared Items
  if (req.method === "GET" && url.pathname === "/api/social/shared") {
    const type = url.searchParams.get("type");
    try {
      const items = await supabase?.getSharedItems(type) || [];
      return sendResponse(res, 200, { items });
    } catch (err) {
      return sendResponse(res, 200, { error: err.message, items: [] });
    }
  }

  // 404
  return sendResponse(res, 404, { error: "Not found" });
});

// =============================================================================
// AUTO-UPDATE SYSTEM
// =============================================================================

async function checkForUpdates() {
  return new Promise((resolve, reject) => {
    https.get("https://api.github.com/repos/clout2buy/FaxWareOS/releases/latest", {
      headers: {
        "User-Agent": "FaxWare/" + VERSION,
        "Accept": "application/vnd.github.v3+json"
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          if (res.statusCode === 404) {
            // No releases yet
            resolve({ hasUpdate: false, currentVersion: VERSION, message: "No releases found" });
            return;
          }
          
          const release = JSON.parse(data);
          const latestVersion = (release.tag_name || "v0.0.0").replace("v", "");
          const hasUpdate = isNewerVersion(latestVersion, VERSION);
          
          resolve({
            hasUpdate,
            currentVersion: VERSION,
            latestVersion,
            releaseNotes: release.body || "",
            downloadUrl: release.assets?.find(a => a.name.includes(".exe"))?.browser_download_url || release.html_url,
            publishedAt: release.published_at
          });
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

function isNewerVersion(latest, current) {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

// Helper function for relationship level
function getRelationshipLevel() {
  const interactions = userProfile.relationship.totalInteractions || 0;
  if (interactions > 100) return "close";
  if (interactions > 50) return "familiar";
  if (interactions > 20) return "acquainted";
  if (interactions > 5) return "getting_started";
  return "new";
}

// =============================================================================
// STARTUP
// =============================================================================
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   ███████╗ █████╗ ██╗  ██╗██╗    ██╗ █████╗ ██████╗ ███████╗  ║
║   ██╔════╝██╔══██╗╚██╗██╔╝██║    ██║██╔══██╗██╔══██╗██╔════╝  ║
║   █████╗  ███████║ ╚███╔╝ ██║ █╗ ██║███████║██████╔╝█████╗    ║
║   ██╔══╝  ██╔══██║ ██╔██╗ ██║███╗██║██╔══██║██╔══██╗██╔══╝    ║
║   ██║     ██║  ██║██╔╝ ██╗╚███╔███╔╝██║  ██║██║  ██║███████╗  ║
║   ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝  ║
║                                                                ║
║                    v${VERSION} - Self-Evolving Agent                ║
╠════════════════════════════════════════════════════════════════╣
║  Web UI:  http://localhost:${PORT}                                 ║
║  Model:   ${config.defaultModel.padEnd(45)}║
║  API:     ${(OPENROUTER_API_KEY ? "✓ CONFIGURED" : "✗ NOT SET - run: setx OPENROUTER_API_KEY \"key\"").padEnd(45)}║
║  Memory:  ${(Object.keys(memory).length + " items").padEnd(45)}║
╚════════════════════════════════════════════════════════════════╝

Type 'help' in the UI for commands. I can now upgrade myself!
`);
});
