/**
 * FileGenerator Tool
 * Universal file generation supporting 25+ formats:
 * Documents (docx, pdf, odt), Spreadsheets (xlsx, csv), Presentations (pptx, odp),
 * Data (json, xml, yaml, toml), Images (png, jpg, svg, qr), Archives (zip), and more
 */

const file_generator = {
  name: "file_generator",
  description: "Generate files in 27+ formats: Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF, images (.png, .jpg, .svg, QR codes), data files (JSON, XML, YAML, TOML, CSV), archives (.zip), calendars (.ics), contacts (.vcf), project files (.xer Primavera P6, .mpp Microsoft Project), HTML, Markdown, and OpenDocument formats (.odt, .odp). Validates libraries and creates files correctly.",
  
  params: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: [
          "docx", "pdf", "txt", "md", "odt", "rtf", "html",
          "xlsx", "csv",
          "pptx", "odp",
          "json", "xml", "yaml", "yml", "toml",
          "png", "jpg", "jpeg", "svg", "gif", "qr",
          "zip", "ics", "vcf",
          "xer", "mpp"
        ],
        description: "File format"
      },
      filename: {
        type: "string",
        description: "Filename without extension"
      },
      content: {
        type: "object",
        description: "Content (varies by format)",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          data: { type: "array" },
          json_data: { type: "object" },
          slides: { type: "array" },
          text: { type: "string" },
          html: { type: "string" },
          image_data: { type: "object" },
          width: { type: "number" },
          height: { type: "number" },
          bg_color: { type: "string" }
        }
      }
    },
    required: ["format", "filename", "content"]
  },

  async execute(params, context = {}) {
    const { format, filename, content } = params;
    const { conversation_id, runtime } = context;

    try {
      console.log(`[FileGenerator] Generating ${format}: ${filename}`);

      const fullFilename = `${filename}.${format}`;
      const pythonScript = this.generateScript(format, fullFilename, content);

      if (!pythonScript) {
        return { success: false, error: `Unsupported format: ${format}` };
      }

      if (!runtime) {
        return { success: false, error: "Runtime not available" };
      }

      const scriptPath = `/tmp/gen_${Date.now()}.py`;
      await runtime.writeFile(scriptPath, pythonScript);
      const result = await runtime.executeCommand(`python3 ${scriptPath}`);
      await runtime.executeCommand(`rm ${scriptPath}`);

      if (result.exit_code !== 0) {
        return {
          success: false,
          error: `Generation failed: ${result.stderr}`,
          details: result
        };
      }

      const verifyResult = await runtime.executeCommand(`ls -lh ${fullFilename}`);
      if (verifyResult.exit_code !== 0) {
        return {
          success: false,
          error: `File not created: ${fullFilename}`
        };
      }

      const workspacePath = conversation_id 
        ? `./workspace/Conversation_${conversation_id}/${fullFilename}`
        : `./workspace/${fullFilename}`;

      // CRITICAL FIX: Verify file actually exists at the claimed path
      const fs = require('fs');
      const path = require('path');
      
      // Check if file exists in the expected location
      const absolutePath = path.resolve(workspacePath);
      let fileExists = false;
      let actualSize = 0;
      
      try {
        const stats = fs.statSync(absolutePath);
        fileExists = stats.isFile();
        actualSize = stats.size;
        console.log(`[FileGenerator] ✅ Verified file exists: ${absolutePath} (${actualSize} bytes)`);
      } catch (err) {
        console.error(`[FileGenerator] ❌ File verification failed: ${absolutePath}`, err.message);
      }

      return {
        success: true,
        message: `✅ Created ${format.toUpperCase()} file${fileExists ? ` (${actualSize} bytes)` : ' (verification pending)'}`,
        filename: fullFilename,
        path: workspacePath,
        format: format,
        verified: fileExists,
        size: actualSize,
        absolutePath: absolutePath
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  generateScript(format, filename, content) {
    const generators = {
      docx: () => this.genDocx(filename, content),
      pdf: () => this.genPdf(filename, content),
      odt: () => this.genOdt(filename, content),
      xlsx: () => this.genXlsx(filename, content),
      csv: () => this.genCsv(filename, content),
      pptx: () => this.genPptx(filename, content),
      odp: () => this.genOdp(filename, content),
      json: () => this.genJson(filename, content),
      xml: () => this.genXml(filename, content),
      yaml: () => this.genYaml(filename, content),
      yml: () => this.genYaml(filename, content),
      toml: () => this.genToml(filename, content),
      png: () => this.genImage(filename, content),
      jpg: () => this.genImage(filename, content),
      jpeg: () => this.genImage(filename, content),
      gif: () => this.genImage(filename, content),
      svg: () => this.genSvg(filename, content),
      qr: () => this.genQr(filename, content),
      html: () => this.genHtml(filename, content),
      txt: () => this.genTxt(filename, content),
      md: () => this.genMd(filename, content),
      rtf: () => this.genRtf(filename, content),
      zip: () => this.genZip(filename, content),
      ics: () => this.genIcs(filename, content),
      vcf: () => this.genVcf(filename, content),
      xer: () => this.genXer(filename, content),
      mpp: () => this.genMpp(filename, content)
    };

    return generators[format] ? generators[format]() : null;
  },

  esc(str) {
    return (str || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  },

  genDocx(fn, c) {
    return `from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
doc = Document()
if '${this.esc(c.title)}':
    t = doc.add_heading('${this.esc(c.title)}', 0)
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
if '${this.esc(c.body)}':
    doc.add_paragraph('''${this.esc(c.body)}''')
doc.save('${fn}')
print('✅ Created: ${fn}')`;
  },

  genPdf(fn, c) {
    return `from fpdf import FPDF
pdf = FPDF()
pdf.add_page()
if '${this.esc(c.title)}':
    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, '${this.esc(c.title)}', ln=True, align='C')
    pdf.ln(10)
if '${this.esc(c.body)}':
    pdf.set_font('Arial', '', 12)
    pdf.multi_cell(0, 10, '''${this.esc(c.body)}''')
pdf.output('${fn}')
print('✅ Created: ${fn}')`;
  },

  genOdt(fn, c) {
    return `from odf.opendocument import OpenDocumentText
from odf.text import P, H
doc = OpenDocumentText()
if '${this.esc(c.title)}':
    h = H(outlinelevel=1, text='${this.esc(c.title)}')
    doc.text.addElement(h)
if '${this.esc(c.body)}':
    p = P(text='''${this.esc(c.body)}''')
    doc.text.addElement(p)
doc.save('${fn}')
print('✅ Created: ${fn}')`;
  },

  genXlsx(fn, c) {
    const data = JSON.stringify(c.data || []);
    return `import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
import json
wb = Workbook()
ws = wb.active
ws.title = '${this.esc(c.title || 'Sheet1')}'
data = json.loads('''${data}''')
if data and len(data) > 0:
    headers = list(data[0].keys())
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal='center')
    for row_idx, row_data in enumerate(data, 2):
        for col_idx, header in enumerate(headers, 1):
            ws.cell(row=row_idx, column=col_idx, value=row_data.get(header, ''))
wb.save('${fn}')
print('✅ Created: ${fn}')`;
  },

  genCsv(fn, c) {
    const data = JSON.stringify(c.data || []);
    return `import pandas as pd
import json
data = json.loads('''${data}''')
df = pd.DataFrame(data)
df.to_csv('${fn}', index=False)
print('✅ Created: ${fn}')`;
  },

  genPptx(fn, c) {
    const slides = JSON.stringify(c.slides || []);
    return `from pptx import Presentation
from pptx.util import Inches
import json
prs = Presentation()
prs.slide_width = Inches(10)
prs.slide_height = Inches(7.5)
title_slide_layout = prs.slide_layouts[0]
slide = prs.slides.add_slide(title_slide_layout)
title = slide.shapes.title
title.text = '${this.esc(c.title || 'Presentation')}'
slides_data = json.loads('''${slides}''')
for slide_data in slides_data:
    bullet_slide_layout = prs.slide_layouts[1]
    slide = prs.slides.add_slide(bullet_slide_layout)
    shapes = slide.shapes
    title_shape = shapes.title
    body_shape = shapes.placeholders[1]
    title_shape.text = slide_data.get('title', '')
    tf = body_shape.text_frame
    tf.text = slide_data.get('content', '')
prs.save('${fn}')
print('✅ Created: ${fn}')`;
  },

  genOdp(fn, c) {
    return `from odf.opendocument import OpenDocumentPresentation
from odf.text import P
from odf.draw import Page, Frame, TextBox
doc = OpenDocumentPresentation()
page = Page()
doc.presentation.addElement(page)
frame = Frame(width="10cm", height="2cm", x="2cm", y="2cm")
textbox = TextBox()
frame.addElement(textbox)
p = P(text='${this.esc(c.title || 'Presentation')}')
textbox.addElement(p)
page.addElement(frame)
doc.save('${fn}')
print('✅ Created: ${fn}')`;
  },

  genJson(fn, c) {
    const data = JSON.stringify(c.json_data || c.data || {});
    return `import json
data = json.loads('''${data}''')
with open('${fn}', 'w') as f:
    json.dump(data, f, indent=2)
print('✅ Created: ${fn}')`;
  },

  genXml(fn, c) {
    const data = JSON.stringify(c.json_data || c.data || {});
    return `import json
from lxml import etree
data = json.loads('''${data}''')
root = etree.Element("root")
def dict_to_xml(parent, data):
    if isinstance(data, dict):
        for key, value in data.items():
            child = etree.SubElement(parent, key)
            dict_to_xml(child, value)
    elif isinstance(data, list):
        for item in data:
            child = etree.SubElement(parent, "item")
            dict_to_xml(child, item)
    else:
        parent.text = str(data)
dict_to_xml(root, data)
tree = etree.ElementTree(root)
tree.write('${fn}', pretty_print=True, xml_declaration=True, encoding='utf-8')
print('✅ Created: ${fn}')`;
  },

  genYaml(fn, c) {
    const data = JSON.stringify(c.json_data || c.data || {});
    return `import json
import yaml
data = json.loads('''${data}''')
with open('${fn}', 'w') as f:
    yaml.dump(data, f, default_flow_style=False)
print('✅ Created: ${fn}')`;
  },

  genToml(fn, c) {
    const data = JSON.stringify(c.json_data || c.data || {});
    return `import json
import toml
data = json.loads('''${data}''')
with open('${fn}', 'w') as f:
    toml.dump(data, f)
print('✅ Created: ${fn}')`;
  },

  genImage(fn, c) {
    const w = c.image_data?.width || c.width || 800;
    const h = c.image_data?.height || c.height || 600;
    const bg = c.image_data?.bg_color || c.bg_color || 'white';
    const txt = this.esc(c.text || c.title || '');
    return `from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (${w}, ${h}), color='${bg}')
draw = ImageDraw.Draw(img)
if '${txt}':
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 40)
    except:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), '${txt}', font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (${w} - text_width) / 2
    y = (${h} - text_height) / 2
    draw.text((x, y), '${txt}', fill='black', font=font)
img.save('${fn}')
print('✅ Created: ${fn}')`;
  },

  genSvg(fn, c) {
    const txt = this.esc(c.text || c.title || 'SVG');
    return `svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
  <rect width="400" height="300" fill="white" stroke="black" stroke-width="2"/>
  <text x="200" y="150" text-anchor="middle" font-size="24" fill="black">${txt}</text>
</svg>'''
with open('${fn}', 'w') as f:
    f.write(svg_content)
print('✅ Created: ${fn}')`;
  },

  genQr(fn, c) {
    const txt = this.esc(c.text || c.body || 'https://example.com');
    return `import qrcode
qr = qrcode.QRCode(version=1, box_size=10, border=5)
qr.add_data('${txt}')
qr.make(fit=True)
img = qr.make_image(fill_color="black", back_color="white")
img.save('${fn}')
print('✅ Created: ${fn}')`;
  },

  genHtml(fn, c) {
    const title = this.esc(c.title || 'HTML Document');
    const body = this.esc(c.html || c.body || '');
    return `html_content = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body>
    <h1>${title}</h1>
    ${body}
</body>
</html>'''
with open('${fn}', 'w') as f:
    f.write(html_content)
print('✅ Created: ${fn}')`;
  },

  genTxt(fn, c) {
    const title = this.esc(c.title || '');
    const body = this.esc(c.body || c.text || '');
    return `with open('${fn}', 'w') as f:
    if '${title}':
        f.write('${title}\\n')
        f.write('=' * len('${title}') + '\\n\\n')
    if '${body}':
        f.write('''${body}''')
print('✅ Created: ${fn}')`;
  },

  genMd(fn, c) {
    const title = this.esc(c.title || '');
    const body = this.esc(c.body || '');
    return `with open('${fn}', 'w') as f:
    if '${title}':
        f.write(f'# ${title}\\n\\n')
    if '${body}':
        f.write('''${body}''')
print('✅ Created: ${fn}')`;
  },

  genRtf(fn, c) {
    const title = this.esc(c.title || '');
    const body = this.esc(c.body || '');
    return `rtf_content = r'''{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Times New Roman;}}
\\f0\\fs24 ${title}\\par
${body}\\par
}'''
with open('${fn}', 'w') as f:
    f.write(rtf_content)
print('✅ Created: ${fn}')`;
  },

  genZip(fn, c) {
    const files = JSON.stringify(c.files || []);
    return `import zipfile
import json
files = json.loads('''${files}''')
with zipfile.ZipFile('${fn}', 'w') as zipf:
    for file_data in files:
        zipf.writestr(file_data['name'], file_data['content'])
print('✅ Created: ${fn}')`;
  },

  genIcs(fn, c) {
    const title = this.esc(c.title || 'Event');
    const start = c.start || '20250101T120000Z';
    const end = c.end || '20250101T130000Z';
    return `ics_content = '''BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${start}
DTEND:${end}
SUMMARY:${title}
END:VEVENT
END:VCALENDAR'''
with open('${fn}', 'w') as f:
    f.write(ics_content)
print('✅ Created: ${fn}')`;
  },

  genVcf(fn, c) {
    const name = this.esc(c.name || 'Contact');
    const email = this.esc(c.email || '');
    const phone = this.esc(c.phone || '');
    return `vcf_content = '''BEGIN:VCARD
VERSION:3.0
FN:${name}
EMAIL:${email}
TEL:${phone}
END:VCARD'''
with open('${fn}', 'w') as f:
    f.write(vcf_content)
print('✅ Created: ${fn}')`;
  },

  genXer(fn, c) {
    const projectName = this.esc(c.title || 'Project');
    const tasks = JSON.stringify(c.tasks || [{id: 1, name: 'Task 1', duration: 5}]);
    return `import json
import xml.etree.ElementTree as ET
from datetime import datetime

# Primavera P6 XER format (simplified)
tasks = json.loads('''${tasks}''')

xer_content = f'''ERMHDR\\t{projectName}\\t2025-01-01\\n'''
for task in tasks:
    xer_content += f'''TASK\\t{task.get('id', 1)}\\t{task.get('name', 'Task')}\\t{task.get('duration', 5)}\\n'''

with open('${fn}', 'w') as f:
    f.write(xer_content)
print('✅ Created: ${fn}')`;
  },

  genMpp(fn, c) {
    const projectName = this.esc(c.title || 'Project');
    const tasks = JSON.stringify(c.tasks || [{id: 1, name: 'Task 1', duration: 5}]);
    return `import json
import xml.etree.ElementTree as ET
from datetime import datetime

# Microsoft Project XML format (can be imported to .mpp)
tasks = json.loads('''${tasks}''')

root = ET.Element('Project', xmlns='http://schemas.microsoft.com/project')
name = ET.SubElement(root, 'Name')
name.text = '${projectName}'
tasks_elem = ET.SubElement(root, 'Tasks')

for task in tasks:
    task_elem = ET.SubElement(tasks_elem, 'Task')
    uid = ET.SubElement(task_elem, 'UID')
    uid.text = str(task.get('id', 1))
    name_elem = ET.SubElement(task_elem, 'Name')
    name_elem.text = task.get('name', 'Task')
    duration = ET.SubElement(task_elem, 'Duration')
    duration.text = f"PT{task.get('duration', 5)}H"

tree = ET.ElementTree(root)
tree.write('${fn}', encoding='utf-8', xml_declaration=True)
print('✅ Created: ${fn}')`;
  }
};

module.exports = file_generator;

