# Ultra Document Types - Feasibility Analysis

## 🎯 Current Implementation

### Supported Types
Currently, Ultra fast-path supports:
1. ✅ **Word Documents (.docx)** - Full implementation with structured sections
2. ✅ **Excel Spreadsheets (.xlsx)** - Basic implementation with sample data

### How It Works

**Location:** `src/agent/auto-reply/index.js` (lines 380-850)

**Architecture:**
1. **Pattern Matching** (line 387-398):
   - Regex detects user intent: "create word doc", "make excel file", etc.
   - Extracts file type: `isWordDoc` or `isExcel`
   - Extracts title and topics from user input

2. **Content Generation** (line 461-616):
   - **For DOCX**: LLM generates structured JSON schema (title + sections)
   - **For XLSX**: Uses deterministic template (no LLM)
   - Fallback content if LLM fails

3. **Python Script Generation** (line 656-817):
   - Creates Python script with embedded content
   - Uses libraries: `python-docx`, `openpyxl`
   - Wraps in `<write_code>` + `<terminal_run>` XML actions

4. **Execution**:
   - Bypasses planning and thinking phases
   - Directly executes Python script
   - File appears in UI instantly

## 📦 Available Python Libraries

**Already installed in runtime sandbox:**
- ✅ `python-docx` - Word documents
- ✅ `openpyxl` - Excel spreadsheets  
- ✅ `python-pptx` - PowerPoint presentations
- ✅ `reportlab` - PDF generation
- ✅ `pypdf` / `pypdf2` - PDF manipulation

**Source:** `containers/runtime-sandbox/Dockerfile` lines 6-15

## 🚀 Feasibility Assessment

### ✅ EASY - Can Add Immediately

#### 1. PowerPoint (.pptx)
**Difficulty:** ⭐ Easy  
**Library:** `python-pptx` (already installed)  
**Effort:** ~2-3 hours

**What's needed:**
- Add `isPowerPoint` detection to pattern matching (line 398)
- Create PPT Python template similar to DOCX (line 663-744)
- Generate slides from sections (title slide + content slides)

**Example structure:**
```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()
# Title slide
title_slide = prs.slides.add_slide(prs.slide_layouts[0])
title_slide.shapes.title.text = "Title"

# Content slides
for section in sections:
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = section['heading']
    slide.shapes.placeholders[1].text = section['body']

prs.save('output.pptx')
```

#### 2. PDF Documents
**Difficulty:** ⭐⭐ Moderate  
**Library:** `reportlab` (already installed)  
**Effort:** ~4-6 hours

**What's needed:**
- Add `isPDF` detection
- Create PDF Python template using reportlab
- Handle text formatting, paragraphs, headings

**Challenges:**
- reportlab has different API than python-docx
- Need to handle page breaks, margins, fonts manually
- More complex than DOCX

**Alternative:** Convert DOCX → PDF using `python-docx-pdf` or `docx2pdf`

#### 3. Plain Text / Markdown
**Difficulty:** ⭐ Very Easy  
**Effort:** ~1 hour

**What's needed:**
- Add `.txt` or `.md` detection
- Simple file write with sections formatted as text/markdown

### ⚠️ MODERATE - Requires More Work

#### 4. CSV Files
**Difficulty:** ⭐⭐ Moderate  
**Library:** Built-in `csv` module  
**Effort:** ~3-4 hours

**What's needed:**
- Different content structure (tabular vs document)
- Need to generate sample data or parse user's data requirements
- May need LLM to structure data into rows/columns

#### 5. Python Scripts (.py)
**Difficulty:** ⭐⭐⭐ Complex  
**Library:** None needed (just file write)  
**Effort:** ~6-8 hours

**What's needed:**
- LLM generates actual Python code (not document content)
- Need code validation/syntax checking
- Different prompt engineering for code vs content
- Security considerations (executing user-generated code)

**Challenge:** This is fundamentally different from document generation!

### ❌ DIFFICULT - Not Recommended for Ultra

#### 6. XER Files (Primavera P6)
**Difficulty:** ⭐⭐⭐⭐⭐ Very Complex  
**Library:** None available (proprietary format)  
**Effort:** Weeks to months

**Why difficult:**
- XER is a proprietary Oracle Primavera format
- No standard Python library
- Requires deep understanding of project management data structures
- Would need custom parser/generator
- Not suitable for "ultra fast-path" (too complex)

**Recommendation:** Use standard agentic flow, not ultra fast-path

#### 7. Complex Excel with Formulas/Charts
**Difficulty:** ⭐⭐⭐⭐ Complex  
**Effort:** ~10-15 hours

**Why difficult:**
- Current Excel implementation is basic (static data only)
- Adding formulas, charts, pivot tables requires significant work
- openpyxl API is complex for advanced features
- Need LLM to understand data relationships for formulas

## 📊 Recommended Implementation Priority

### Phase 1 - Quick Wins (1-2 days)
1. ✅ **PowerPoint (.pptx)** - High value, easy to add
2. ✅ **Markdown (.md)** - Very easy, useful for developers
3. ✅ **Plain Text (.txt)** - Trivial to add

### Phase 2 - Medium Effort (3-5 days)
4. ⚠️ **PDF (.pdf)** - High value but more complex
5. ⚠️ **CSV (.csv)** - Useful for data exports

### Phase 3 - Complex (2+ weeks)
6. ❌ **Python Scripts (.py)** - Different use case, needs separate flow
7. ❌ **Advanced Excel** - Requires significant refactoring

### Not Recommended
- ❌ **XER files** - Too complex, use standard agentic flow
- ❌ **Binary formats** without libraries - Not feasible

## 🛠️ Implementation Pattern

For each new document type, follow this pattern:

### 1. Detection (line ~398)
```javascript
const isPowerPoint = fileType.includes('powerpoint') || 
                     fileType.includes('ppt') || 
                     fileType.includes('pptx') ||
                     fileType.includes('presentation');
```

### 2. Python Template (line ~663)
```javascript
if (isPowerPoint) {
  const filename = `${sanitizedTitle}.pptx`;
  actionXML = `<actions>
<write_code>
  <language>python</language>
  <path>create_ppt_${timestamp}.py</path>
  <content><![CDATA[
from pptx import Presentation
# ... Python code here ...
  ]]></content>
  <description>Create PowerPoint: ${title}</description>
</write_code>
<terminal_run>
  <command>python3</command>
  <args>create_ppt_${timestamp}.py</args>
</terminal_run>
</actions>`;
}
```

### 3. Content Structure
- **Documents (DOCX, PDF, PPT):** Use existing sections-based schema
- **Data (CSV, Excel):** Need different schema (rows/columns)
- **Code (Python):** Need code generation prompt

## ✅ Final Recommendation

**EASY TO IMPLEMENT:**
- PowerPoint, Markdown, Plain Text - **Go for it!**
- These follow the exact same pattern as DOCX
- Libraries are already installed
- Minimal code changes needed

**MODERATE EFFORT:**
- PDF, CSV - **Worth considering**
- PDF: High value but more complex API
- CSV: Different data structure

**NOT RECOMMENDED:**
- XER, Complex Excel, Python code generation
- These don't fit the "ultra fast-path" model
- Better handled by full agentic flow

## 🎯 Bottom Line

**Yes, adding PPT/PDF/Markdown is EASY!**

The architecture is already designed for extensibility. You just need to:
1. Add file type detection
2. Create Python template
3. Test

The hardest part is getting the Python library API right for each format.

