# 📁 Volume Mounts - Grace Self-Modification Persistence

## ✅ **Setup Complete!**

Grace's self-modifications now **persist to your host machine**!

---

## 🎯 **What's Mounted:**

### **1. Source Code (`./src` → `/app/src`)**
- Grace modifies files here
- Changes appear in your local `src/` folder
- Includes: prompts, tools, agents, utils

### **2. Frontend (`./frontend` → `/app/frontend`)**
- Grace can modify UI components
- Changes appear in your local `frontend/` folder

### **3. Backups (`./.backups` → `/app/.backups`)**
- All modification backups stored here
- Timestamped copies of changed files
- Modification logs

### **4. Workspace (`./workspace` → `/app/workspace`)**
- User project files
- Code Grace generates for you

### **5. Data (`./data` → `/app/data`)**
- Database files
- Persistent storage

---

## 🔄 **How It Works:**

```
You: /dev
You: "Improve your code generation"

Grace's Process:
1. Reads /app/src/agent/prompt/thinking.prompt.js (in container)
2. Modifies the file
3. Writes to /app/src/agent/prompt/thinking.prompt.js
4. ✅ Change INSTANTLY appears in your local src/ folder!
5. Creates backup in .backups/
```

---

## 📂 **File Structure:**

```
/Users/wonkasworld/Downloads/GRACEai/
├── src/                          ← Grace modifies these
│   ├── agent/
│   │   ├── prompt/              ← Prompt improvements
│   │   ├── seal/                ← SEAL system
│   │   └── modes/               ← Dev mode logic
│   ├── tools/                   ← New tools Grace creates
│   └── utils/                   ← Utility improvements
├── frontend/                     ← UI modifications
│   └── src/
│       └── components/          ← Component updates
├── .backups/                     ← All backups stored here
│   ├── thinking.prompt.js.1234567890.backup
│   ├── modifications.log
│   └── env_modifications.log
├── workspace/                    ← Your project files
└── data/                         ← Database
```

---

## 🎯 **Example Workflow:**

### **1. Grace Improves Her Prompt:**
```
You: /dev
You: "Add better error handling to your code generation"

Grace:
- Modifies: /app/src/agent/prompt/thinking.prompt.js
- ✅ Your local file updates: src/agent/prompt/thinking.prompt.js
- Backup created: .backups/thinking.prompt.js.1234567890.backup
```

### **2. Grace Creates New Tool:**
```
You: /dev
You: "Create a tool to generate QR codes"

Grace:
- Creates: /app/src/tools/QRCode.js
- ✅ New file appears: src/tools/QRCode.js
- Logged in: .backups/modifications.log
```

### **3. Grace Updates UI:**
```
You: /dev
You: "Make the chat input larger"

Grace:
- Modifies: /app/frontend/src/components/ChatInput.vue
- ✅ Your local file updates: frontend/src/components/ChatInput.vue
- Backup created: .backups/ChatInput.vue.1234567890.backup
```

---

## 🔍 **Verify It's Working:**

### **After Grace makes a change:**

```bash
# Check your local files
ls -la src/agent/prompt/

# Check backups
ls -la .backups/

# View modification log
cat .backups/modifications.log
```

---

## 🚀 **Using Docker Compose (Recommended):**

```bash
# Start with volume mounts
docker-compose up -d

# Grace's changes persist to:
# - ./src/
# - ./frontend/
# - ./.backups/
```

---

## 🛠️ **Manual Docker Run (Alternative):**

```bash
docker run -d \
  --name grace-ai-app \
  -p 5005:5005 \
  -e DOCKER_HOST_ADDR=host.docker.internal \
  -e ACTUAL_HOST_WORKSPACE_PATH=/Users/wonkasworld/Downloads/GRACEai/workspace \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ~/.cache:/.cache \
  -v /Users/wonkasworld/Downloads/GRACEai/workspace:/app/workspace \
  -v /Users/wonkasworld/Downloads/GRACEai/data:/app/data \
  -v /Users/wonkasworld/Downloads/GRACEai/src:/app/src \
  -v /Users/wonkasworld/Downloads/GRACEai/frontend:/app/frontend \
  -v /Users/wonkasworld/Downloads/GRACEai/.backups:/app/.backups \
  --env-file .env \
  grace-ai:custom make run
```

---

## ⚡ **Hot Reloading:**

Most changes take effect immediately:
- ✅ **Prompts** - Next message uses new prompt
- ✅ **Tools** - Available in next task
- ✅ **Utils** - Reloaded automatically

Some need restart:
- ⚠️ **Routes** - API endpoints
- ⚠️ **Models** - Database schemas

---

## 📊 **Benefits:**

### **For Development:**
- ✅ See Grace's changes in real-time
- ✅ Version control with git
- ✅ Easy to review modifications
- ✅ Backups are accessible

### **For Safety:**
- ✅ All changes backed up
- ✅ Can manually revert if needed
- ✅ Modification log for audit
- ✅ No data loss on container restart

---

## 🎯 **Real Example:**

```
You: /dev
You: "You're too verbose. Be more concise."

Grace: "Analyzing my response patterns..."
       "Updating chat prompt..."
       
       ✅ Modified: /app/src/agent/prompt/chat.js
       📦 Backup: .backups/chat.js.1234567890.backup

You: *Checks local file*
$ cat src/agent/prompt/chat.js
// Updated with conciseness instructions!

You: "Perfect! Exit dev mode"
Grace: "👍 Normal mode"

You: *Commits to git*
$ git add src/agent/prompt/chat.js
$ git commit -m "Grace improved her conciseness"
```

---

## 🔥 **Pro Tips:**

1. **Watch changes live:**
   ```bash
   watch -n 1 'ls -lt src/agent/prompt/ | head -10'
   ```

2. **Monitor backups:**
   ```bash
   tail -f .backups/modifications.log
   ```

3. **Version control:**
   ```bash
   git status  # See what Grace changed
   git diff    # Review her modifications
   git commit  # Save improvements
   ```

4. **Rollback if needed:**
   ```bash
   # Grace made a bad change?
   cp .backups/chat.js.1234567890.backup src/agent/prompt/chat.js
   docker restart grace-ai-app
   ```

---

## ✅ **Summary:**

| What Grace Modifies | Where It Appears | Backed Up? |
|---------------------|------------------|------------|
| Prompts | `./src/agent/prompt/` | ✅ Yes |
| Tools | `./src/tools/` | ✅ Yes |
| Utils | `./src/utils/` | ✅ Yes |
| Frontend | `./frontend/src/` | ✅ Yes |
| ENV vars | `./.env` | ✅ Yes |

**Grace's changes are now REAL and PERSISTENT!** 🎉

---

**With volume mounts, Grace truly evolves your codebase!** 🧠✨
