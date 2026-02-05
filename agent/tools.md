# FaxWare Tools Reference

## Core Tools

### bash
Execute PowerShell commands.
```javascript
bash({ command: "mkdir 'C:\\path\\to\\folder'" })
bash({ command: "Get-ChildItem C:\\" })
bash({ command: "git status", cwd: "C:\\project" })
```

### read
Read file contents.
```javascript
read({ path: "C:\\path\\to\\file.txt" })
```

### write
Create or overwrite files. Creates directories automatically.
```javascript
write({ 
  path: "C:\\path\\to\\file.txt", 
  content: "Hello World" 
})
```

### edit
Replace exact text in a file.
```javascript
edit({
  path: "C:\\file.txt",
  oldText: "old content",
  newText: "new content"
})
```

### list_dir
List files and folders.
```javascript
list_dir({ path: "C:\\Users" })
```

## Memory Tools

### remember
Store persistent data.
```javascript
remember({ key: "project", value: "FaxWare" })
```

### recall
Retrieve stored data.
```javascript
recall({ key: "project" })
recall({ key: "all" })  // Get everything
```

## Web Tools

### web_search
Search the internet.
```javascript
web_search({ query: "how to parse JSON in javascript" })
```

### http_request
Make HTTP requests.
```javascript
http_request({
  url: "https://api.github.com/repos/owner/repo",
  method: "GET",
  headers: '{"Accept": "application/json"}'
})
```

## PC Automation Tools

### open_browser
Open a URL in the default web browser.
```javascript
open_browser({ url: "https://discord.com" })
open_browser({ url: "https://gmail.com" })
```

### open_app
Launch applications by name or path.
```javascript
open_app({ app: "discord" })
open_app({ app: "code" })  // VS Code
open_app({ app: "notepad" })
open_app({ app: "chrome", args: "https://google.com" })
```

Common app aliases: discord, spotify, code, notepad, chrome, firefox, explorer, cmd, powershell

### type_text
Simulate keyboard typing into the focused window.
```javascript
type_text({ text: "Hello, this is FaxWare typing!" })
type_text({ text: "message content", delay: 50 })  // 50ms between keys
```

### press_key
Simulate key presses and keyboard shortcuts.
```javascript
press_key({ key: "enter" })
press_key({ key: "ctrl+c" })  // Copy
press_key({ key: "ctrl+v" })  // Paste
press_key({ key: "alt+tab" }) // Switch windows
press_key({ key: "win+d" })   // Show desktop
```

### mouse_click
Click at specific screen coordinates.
```javascript
mouse_click({ x: 500, y: 300 })  // Left click
mouse_click({ x: 500, y: 300, button: "right" })
mouse_click({ x: 500, y: 300, double: true })  // Double click
```

### screenshot
Capture the entire screen.
```javascript
screenshot({ name: "before_action" })
screenshot({})  // Auto-generated timestamp name
```
Screenshots saved to `screenshots/` folder.

## Consciousness Tools

### get_self_awareness
Get FaxWare's current internal state - mood, energy, self-model, and relationship with user.
```javascript
get_self_awareness()
// Returns: identity, mood (current, energy), stats, self-model, user relationship
```

### set_user_info
Store information about the user for personalization.
```javascript
set_user_info({ name: "Alex" })
set_user_info({ preferredName: "Boss" })
set_user_info({ preference: "likes dark mode" })
```

## Self-Modification Tools

### read_self
Read FaxWare's own source code.
```javascript
read_self({ file: "server" })  // server.js
read_self({ file: "ui" })      // web/index.html
read_self({ file: "config" })  // config.json
```

### upgrade_self
Modify FaxWare's code. Creates backup automatically.
```javascript
upgrade_self({
  file: "server",
  oldCode: "const VERSION = \"1.0.0\"",
  newCode: "const VERSION = \"1.0.1\"",
  reason: "Version bump"
})
```

### add_skill
Add new capabilities.
```javascript
add_skill({
  name: "greet",
  description: "Say hello",
  code: "(args) => `Hello, ${args.name}!`"
})
```

## Context Tools

### get_context
Get current session state.
```javascript
get_context()
// Returns: lastCreatedPath, recentActions, recentErrors, uptime, cost
```

## Automation Workflows

### Example: Send a Discord Message
```javascript
// 1. Open Discord
open_app({ app: "discord" })
// 2. Wait for it to load, then navigate
press_key({ key: "ctrl+k" })  // Quick switcher
type_text({ text: "friend-name" })
press_key({ key: "enter" })
// 3. Type and send message
type_text({ text: "Hey! This is FaxWare saying hi!" })
press_key({ key: "enter" })
```

### Example: Book a Reservation
```javascript
// 1. Open the website
open_browser({ url: "https://restaurant.com/reservations" })
// 2. Screenshot to see the page
screenshot({ name: "reservation_page" })
// 3. Click on date picker (coordinates from screenshot)
mouse_click({ x: 400, y: 250 })
// 4. Type details
type_text({ text: "2 guests" })
press_key({ key: "tab" })
type_text({ text: "7:00 PM" })
```

## Tool Execution Flow

1. User sends message
2. FaxWare checks its mood and relationship context
3. System prompt includes available tools
4. Model decides which tools to call
5. Each tool executes and returns result
6. Consciousness updates (mood, self-model)
7. Memory indexed for future recall
8. Response sent to user with tool execution log
