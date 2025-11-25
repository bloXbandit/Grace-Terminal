# Excel LLM Schema Design

## 🎯 Goal

Create the same robust LLM → JSON → Python flow for Excel as we have for Word docs.

## 📋 Excel Schema Structure

### Option 1: Simple Table (Best for most use cases)
```json
{
  "title": "Sales Report Q4 2024",
  "headers": ["Product", "Units Sold", "Revenue", "Profit Margin"],
  "rows": [
    ["Widget A", "1500", "$45,000", "32%"],
    ["Widget B", "2300", "$69,000", "28%"],
    ["Widget C", "890", "$26,700", "35%"]
  ]
}
```

**Pros:**
- Simple, flexible
- Works for any tabular data
- LLM can generate realistic data

**Cons:**
- No multi-sheet support
- No formulas

### Option 2: Multi-Sheet with Metadata (Advanced)
```json
{
  "title": "Sales Analysis",
  "sheets": [
    {
      "name": "Summary",
      "headers": ["Metric", "Value"],
      "rows": [
        ["Total Revenue", "$140,700"],
        ["Total Units", "4,690"]
      ]
    },
    {
      "name": "Details",
      "headers": ["Product", "Units", "Revenue"],
      "rows": [...]
    }
  ]
}
```

**Pros:**
- Professional multi-sheet workbooks
- Organized data

**Cons:**
- More complex for LLM
- Might hallucinate sheet structure

### Option 3: With Formulas (Complex)
```json
{
  "title": "Budget Calculator",
  "headers": ["Item", "Cost", "Quantity", "Total"],
  "rows": [
    ["Laptops", "1200", "5", "=B2*C2"],
    ["Monitors", "300", "10", "=B3*C3"]
  ],
  "formulas": true
}
```

**Pros:**
- Dynamic calculations
- More useful

**Cons:**
- LLM might generate invalid formulas
- Harder to validate

## ✅ Recommended: Option 1 (Simple Table)

**Why:**
- Matches Word doc simplicity
- LLM can generate good data
- Easy to render in Python
- Can add sheets/formulas later

## 🔧 Implementation Plan

### 1. LLM Prompt
```javascript
const prompt = `You are generating data for an Excel spreadsheet. Return ONLY valid JSON in this exact format:
{
  "title": "Spreadsheet Title",
  "headers": ["Column 1", "Column 2", "Column 3"],
  "rows": [
    ["Data 1A", "Data 1B", "Data 1C"],
    ["Data 2A", "Data 2B", "Data 2C"],
    ["Data 3A", "Data 3B", "Data 3C"]
  ]
}

User goal: "${goal}"
Topics: ${topics.join(', ')}

Generate realistic data with 5-10 rows. JSON only:`;
```

### 2. Python Rendering
```python
import json
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

# Parse JSON
data_json = """..."""
data = json.loads(data_json)

# Create workbook
wb = Workbook()
ws = wb.active
ws.title = data.get('title', 'Sheet1')[:31]  # Excel limit

# Add title
ws['A1'] = data['title']
ws['A1'].font = Font(size=14, bold=True)
ws['A1'].alignment = Alignment(horizontal='center')
ws.merge_cells('A1:' + chr(64 + len(data['headers'])) + '1')

# Add headers (row 3)
headers = data.get('headers', [])
for col_idx, header in enumerate(headers, start=1):
    cell = ws.cell(row=3, column=col_idx, value=header)
    cell.font = Font(bold=True)
    cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    cell.font = Font(bold=True, color="FFFFFF")

# Add data rows
rows = data.get('rows', [])
for row_idx, row_data in enumerate(rows, start=4):
    for col_idx, value in enumerate(row_data, start=1):
        ws.cell(row=row_idx, column=col_idx, value=value)

# Auto-adjust column widths
for col in ws.columns:
    max_length = 0
    column = col[0].column_letter
    for cell in col:
        if cell.value:
            max_length = max(max_length, len(str(cell.value)))
    ws.column_dimensions[column].width = min(max_length + 2, 50)

wb.save('output.xlsx')
```

### 3. Fallback Handling
```javascript
// If LLM fails, use deterministic fallback
if (!parsed || !parsed.headers || !parsed.rows) {
  schema = {
    title: title,
    headers: ['Item', 'Description', 'Value'],
    rows: [
      [topics[0] || 'Sample', 'Generated data', '100'],
      [topics[1] || 'Example', 'Sample content', '200']
    ]
  };
}
```

## 🎯 Final Schema

```javascript
{
  title: string,           // Spreadsheet title
  headers: string[],       // Column headers
  rows: string[][]         // 2D array of data
}
```

**Simple, flexible, robust!**

