# GRACEai Quick Start - One Page

## 🎯 The Only 3 Commands You Need

```bash
make validate    # Check system health
make rebuild     # Full rebuild (includes validation)
make restart     # Quick restart (code-only changes)
```

---

## 📖 Common Tasks

### First Time Setup
```bash
make validate && make rebuild
```

### After Git Pull
```bash
make validate
make restart     # If only code changed
make rebuild     # If package.json or Dockerfile changed
```

### UI Blank or ECONNREFUSED
```bash
docker restart grace-app
```

### After Changing Dependencies
```bash
make rebuild
```

---

## 🛡️ The Golden Rule

**Always `make validate` before `make rebuild`**

Validation catches issues BEFORE they break your system.

---

## 🔧 Troubleshooting in 3 Steps

```bash
# 1. Validate
make validate

# 2. Fix errors (if any)
# Edit Dockerfile or package.json

# 3. Rebuild
make rebuild
```

---

## ✅ What Validation Checks

- Node.js dependencies
- Python packages (PyP6XER, pdfplumber, etc.)
- Docker configuration
- Critical files
- Frontend build

**If validation passes → rebuild is safe**

---

## 📂 Key Files

- **Read this first:** `STARTUP_GUIDE.md`
- **Validator script:** `scripts/validate-build.sh`
- **Enhanced Makefile:** `Makefile`

---

## 💡 Pro Tip

Save these aliases in your `~/.zshrc`:

```bash
alias gv='make validate'
alias gr='make rebuild'
alias grs='make restart'
```

Then just type: `gv && gr` 🚀
