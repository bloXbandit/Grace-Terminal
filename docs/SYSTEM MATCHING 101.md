
Prevention Checklist
Before Commits
Verify Data Shapes Match
bash
# Backend
grep -r "ctx\.body" src/routers/

# Frontend
grep -r "useUserStore" frontend/src/
Clear Build Artifacts
bash
make clean-frontend
Test Hard Refresh
Open Incognito window → http://localhost:5005
When Adding New Fields
Backend First
Add field to API response before frontend uses it.
Store Defaults
Initialize Pinia store with same structure:
javascript
// Good
state: { points: { total: 0 } }

// Bad
state: { points: {} }  // ← Causes undefined errors
UI Guards
Use v-if for optional data:
vue
<div v-if="points?.total !== undefined">
  {{ points.total }}
</div>
Emergency Fix Protocol
bash
# 1. Nuke old builds
rm -rf public/assets/* frontend/node_modules/.vite

# 2. Rebuild 
cd frontend && npm run build && cd ..

# 3. Restart Docker
docker compose restart

# 4. Clear browser cache
# Chrome: chrome://settings/clearBrowserData
Key Files to Monitor
File	Purpose
src/routers/user/users.js
Dev mode auth response
frontend/vite.config.js	Build output directory
frontend/src/store/modules/user.js
Frontend data expectations
docker-compose.yml
Volume mounts
Golden Rule:
Backend defines the contract → Frontend implements to match.
Always modify backend first, then update frontend to consume new fields.

Git Commit Changes & System Calibration
When moving between commits in GRACEai, here's what automatically adjusts vs what requires manual intervention:

✅ Auto-Calibrated (No Action Needed)
Source Code
Git handles all file changes instantly
No need to manually reset files
Database Schema
Sequelize automatically migrates schema forward
Example: If new commit adds a column, it gets added on startup
Docker Containers
Volume mounts (/app/src) reflect new code immediately
Hot-reload works for most backend changes
⚠️ Manual Steps Required
Frontend Build Artifacts
bash
# MUST clean public folder after checkout
rm -rf public/assets/*
cd frontend && npm run build
Node Modules
bash
# If package.json changed:
rm -rf node_modules frontend/node_modules
npm install && cd frontend && npm install
Database Rollbacks
Sequelize does NOT auto-rollback schema changes
Use backup or manual SQL:
bash
docker exec grace-app sqlite3 /app/data/database.sqlite "ALTER TABLE DROP COLUMN..."
Docker Images
bash
# If Dockerfile changed:
docker compose build --no-cache
Safe Git Workflow
bash
# 1. Stash changes if needed
git stash

# 2. Move to target commit
git checkout <commit-hash>

# 3. Clean frontend
rm -rf public/assets/* frontend/node_modules/.vite

# 4. Rebuild if needed
cd frontend && npm run build && cd ..

# 5. Restart containers
docker compose restart

# 6. Verify database state
docker exec grace-app sqlite3 /app/data/database.sqlite ".schema"
Critical Watchpoints
Change Type	Check	Command
Frontend code	Build hash matches	ls -l public/assets/ChatPanel-*.js
Database schema	Columns exist	sqlite3 database.sqlite ".schema users"
Node modules	Dependencies match	npm ls
Docker images	Image ID changed	docker images grace-ai
Pro Tip:
Keep a reset-dev-env.sh script with:

bash
#!/bin/bash
git checkout main
rm -rf public/assets/* node_modules frontend/node_modules
docker compose down
docker compose build --no-cache
docker compose up -d

