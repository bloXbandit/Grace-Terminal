# Runtime Sandbox Python Modules Installation

## Critical Discovery
Code execution happens in a **SEPARATE Docker container** (`lemon-runtime-sandbox`), not in the main `grace-app` container where the Dockerfile installs modules.

## Problem
- Main container (`grace-app`): Has Python modules installed via Dockerfile
- Runtime container (`lemon-runtime-sandbox`): Does NOT have modules
- Result: `ModuleNotFoundError` when executing Python code

## Solution Applied (Temporary)
Installed all Python modules directly in the runtime sandbox:

```bash
docker exec lemon-runtime-sandbox pip3 install --break-system-packages \
  python-docx pandas openpyxl xlsxwriter reportlab python-pptx \
  Pillow matplotlib numpy xerparser PyPDF2 pypdf requests \
  beautifulsoup4 lxml seaborn plotly scikit-learn
```

## Installed Modules
- **Documents**: python-docx, reportlab, PyPDF2, pypdf
- **Spreadsheets**: pandas, openpyxl, xlsxwriter
- **Presentations**: python-pptx
- **Images**: Pillow
- **Data Viz**: matplotlib, seaborn, plotly
- **Data Science**: numpy, pandas, scikit-learn
- **Web**: requests, beautifulsoup4, lxml
- **Specialized**: xerparser (P6/XER files)

## ⚠️ Important
This installation is **TEMPORARY** - modules will be lost if `lemon-runtime-sandbox` container restarts.

## Permanent Solutions (TODO)
1. **Option 1**: Build custom runtime sandbox image with modules pre-installed
2. **Option 2**: Add startup script to auto-install modules on container start
3. **Option 3**: Mount shared Python packages volume between containers

## Verification
```bash
docker exec lemon-runtime-sandbox python3 -c "import openpyxl, pandas, reportlab; print('✅ All modules working!')"
```
