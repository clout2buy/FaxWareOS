# FaxWare OS v1.0.0

**The Self-Evolving AI Agent with Full System Control**

FaxWare OS is an enterprise-grade personal AI assistant that can control your entire PC, learn from interactions, and evolve over time. It's like having a superintelligent assistant with root access to your machine.

---

## Quick Start

### Option 1: One-Click Install
```
Double-click INSTALL.bat
```

### Option 2: Command Line
```powershell
# Run the installer
powershell -ExecutionPolicy Bypass -File setup-faxware.ps1

# Start FaxWare
faxware start
```

### Option 3: Direct Run
```powershell
node server.js
```

Then open: **http://localhost:8787**

---

## API Key Setup

FaxWare uses OpenRouter for AI models. Set your API key:

```powershell
setx OPENROUTER_API_KEY "your_key_here"
```

Get a key at: https://openrouter.ai/keys

---

## Features

### AI Chat
- Natural language conversation
- Multiple AI models (GPT-4, Claude, etc.)
- Automatic tool execution
- Memory and context awareness

### PC Automation
- **Open Browser** - Navigate to any URL
- **Open Apps** - Launch Discord, Spotify, VSCode, etc.
- **Type Text** - Automated keyboard input
- **Press Keys** - Keyboard shortcuts and combos
- **Mouse Click** - Click anywhere on screen
- **Screenshot** - Capture your display

### Consciousness System
- Mood tracking and adaptation
- Self-awareness and evolution
- User relationship memory
- Behavioral learning

### Watch Mode
- Real-time automation visualization
- Action log with timestamps
- Screenshot gallery
- Saved recipes for repeated tasks

### Enterprise Features

#### Command Palette (Ctrl+K)
Quick access to all commands with fuzzy search. Navigate, automate, and control FaxWare instantly.

#### Toast Notifications
Beautiful, non-intrusive notifications for all actions with auto-dismiss and progress indicators.

#### Settings Panel (Ctrl+,)
Comprehensive settings for:
- General preferences
- AI model configuration
- Appearance customization
- Voice settings
- Automation options
- Account management

#### Onboarding Wizard
First-time setup experience that guides new users through configuration.

#### Auto-Update System
Automatic GitHub release checking with one-click updates from `clout2buy/FaxWareOS`.

#### Social Features (Supabase)
Optional cloud-based features:
- User accounts and profiles
- Friends system with requests
- Real-time messaging
- Share recipes, memories, and prompts
- Collaboration mode

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open Command Palette |
| `Ctrl+,` | Open Settings |
| `Ctrl+1-8` | Switch Panels |
| `V` | Voice Input |
| `?` | Quick Help |
| `ESC` | Close Modals |

---

## Commands

### Direct Commands (Always Work)
```
help      - Show help
status    - System status
memory    - View all memories
clear     - Clear history
models    - List available AI models
model X   - Switch to model X
errors    - Show recent errors
```

### Natural Language
Just type what you want:
- "Create a new web project called MyApp"
- "Open Discord and send a message to @friend"
- "Book a reservation at that restaurant"
- "Take a screenshot every 5 minutes"
- "Search the web for latest tech news"

---

## File Structure

```
FaxWare/
├── server.js           # Main server and AI logic
├── package.json        # Project configuration
├── faxware.cmd         # CLI wrapper
├── setup-faxware.ps1   # Global installer
├── INSTALL.bat         # One-click install
│
├── web/
│   └── index.html      # Full UI application
│
├── agent/
│   ├── identity.md     # FaxWare's identity
│   └── tools.md        # Tool documentation
│
├── lib/
│   ├── supabase.js     # Social features client
│   └── supabase-schema.sql # Database schema
│
├── build/
│   ├── build-installer.ps1 # Installer builder
│   └── BUILD.bat       # One-click build
│
├── assets/
│   └── logo.png        # FaxWare logo
│
└── screenshots/        # Captured screenshots
```

---

## Data Files

These files persist your FaxWare's data:

| File | Purpose |
|------|---------|
| `config.json` | Settings and preferences |
| `memory.json` | Persistent memories |
| `history.json` | Chat history |
| `consciousness.json` | Mood and self-model |
| `user_profile.json` | Info about you |
| `memory_index.json` | Long-term memory index |
| `recipes.json` | Saved automations |

---

## Building an Installer

### Create Distribution Package
```powershell
cd build
powershell -ExecutionPolicy Bypass -File build-installer.ps1
```

This creates:
- `dist/FaxWare-1.0.0.zip` - Portable distribution
- `dist/FaxWare-Setup-1.0.0.exe` - Windows installer (requires Inno Setup)

### Requirements for Building
- Node.js 18+
- npm (for dependencies)
- [Inno Setup 6](https://jrsoftware.org/isdl.php) (optional, for .exe installer)

---

## Social Features Setup (Optional)

To enable social features, set up a Supabase project:

1. Create account at https://supabase.com
2. Create new project
3. Run `lib/supabase-schema.sql` in SQL Editor
4. Set environment variables:

```powershell
setx SUPABASE_URL "https://your-project.supabase.co"
setx SUPABASE_ANON_KEY "your-anon-key"
```

---

## Requirements

- **Windows 10/11**
- **Node.js 18+**
- **OpenRouter API Key**
- 100MB disk space

---

## Troubleshooting

### "API key not set"
Run: `setx OPENROUTER_API_KEY "your_key"` then restart PowerShell.

### "Port 8787 in use"
Another instance is running. Run: `faxware stop` or kill the node process.

### "Cannot find module"
Run: `npm install` in the FaxWare directory.

### Automation not working
Some apps require Administrator privileges for keyboard/mouse control.

---

## License

MIT License - Use, modify, and distribute freely.

---

## Links

- **GitHub**: https://github.com/clout2buy/FaxWareOS
- **OpenRouter**: https://openrouter.ai
- **Supabase**: https://supabase.com

---

Made with intelligence by FaxWare OS
