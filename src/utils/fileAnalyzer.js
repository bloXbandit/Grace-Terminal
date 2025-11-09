/**
 * File Content Analyzer
 * Extracts and analyzes content from uploaded files to provide context to the agent
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

/**
 * Analyze file and extract meaningful content
 */
async function analyzeFile(filepath, filename) {
  try {
    const ext = path.extname(filename).toLowerCase();
    const stats = await fs.stat(filepath);
    
    const analysis = {
      filename,
      filepath,
      extension: ext,
      size: stats.size,
      sizeFormatted: formatFileSize(stats.size),
      type: getFileType(ext),
      content: null,
      summary: null,
      metadata: {},
      error: null
    };

    // Extract content based on file type
    switch (ext) {
      case '.txt':
      case '.md':
      case '.csv':
      case '.json':
      case '.xml':
      case '.yaml':
      case '.yml':
      case '.log':
        analysis.content = await extractTextFile(filepath);
        analysis.summary = summarizeTextContent(analysis.content, ext);
        break;

      case '.pdf':
        analysis.content = await extractPDF(filepath);
        analysis.summary = summarizeTextContent(analysis.content, ext);
        break;

      case '.docx':
      case '.doc':
        analysis.content = await extractDOCX(filepath);
        analysis.summary = summarizeTextContent(analysis.content, ext);
        break;

      case '.xlsx':
      case '.xls':
        analysis.content = await extractXLSX(filepath);
        analysis.summary = summarizeSpreadsheet(analysis.content);
        break;

      case '.xer':
        analysis.content = await extractXER(filepath);
        analysis.summary = summarizeXER(analysis.content);
        break;

      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.gif':
      case '.bmp':
      case '.webp':
        analysis.metadata = await extractImageMetadata(filepath);
        analysis.summary = `Image file (${analysis.metadata.dimensions || 'unknown dimensions'})`;
        break;

      default:
        analysis.summary = `Binary file (${analysis.sizeFormatted})`;
    }

    return analysis;
  } catch (error) {
    console.error('[FileAnalyzer] Error analyzing file:', error);
    return {
      filename,
      filepath,
      error: error.message,
      summary: `Could not analyze file: ${error.message}`
    };
  }
}

async function extractTextFile(filepath) {
  const content = await fs.readFile(filepath, 'utf-8');
  return content.length > 10000 ? content.substring(0, 10000) + '\n...(truncated)' : content;
}

async function extractPDF(filepath) {
  try {
    const script = `import pdfplumber; pdf = pdfplumber.open('${filepath.replace(/'/g, "\\'")}'); text = ''.join([p.extract_text() or '' for p in pdf.pages[:10]]); print(text[:10000])`;
    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 10000 });
    return result.trim() || '[PDF contains no extractable text]';
  } catch (error) {
    return `[Could not extract PDF: ${error.message}]`;
  }
}

async function extractDOCX(filepath) {
  try {
    const script = `from docx import Document; doc = Document('${filepath.replace(/'/g, "\\'")}'); print('\\n'.join([p.text for p in doc.paragraphs])[:10000])`;
    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 10000 });
    return result.trim() || '[DOCX contains no text]';
  } catch (error) {
    return `[Could not extract DOCX: ${error.message}]`;
  }
}

async function extractXLSX(filepath) {
  try {
    const script = `import json; from openpyxl import load_workbook; wb = load_workbook('${filepath.replace(/'/g, "\\'")}', read_only=True, data_only=True); result = {sheet: {'rows': sum(1 for _ in wb[sheet].iter_rows()), 'cols': wb[sheet].max_column, 'sample': [list(r) for i, r in enumerate(wb[sheet].iter_rows(values_only=True)) if i < 10]} for sheet in wb.sheetnames[:5]}; print(json.dumps(result))`;
    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 10000 });
    return JSON.parse(result.trim());
  } catch (error) {
    return { error: `Could not extract XLSX: ${error.message}` };
  }
}

async function extractXER(filepath) {
  try {
    // Use PyP6XER library (installs as xerparser.reader.Reader - same as P6XerTool)
    const script = `
import json
from xerparser.reader import Reader

try:
    xer = Reader('${filepath.replace(/'/g, "\\'")}')
    
    # Extract high-level project info using PyP6XER
    result = {
        'project_name': xer.project.name if hasattr(xer, 'project') and xer.project else 'Unknown',
        'project_count': 1,
        'activities_count': len(xer.activities) if hasattr(xer, 'activities') else 0,
        'resources_count': len(xer.resources) if hasattr(xer, 'resources') else 0,
        'calendars_count': len(xer.calendars) if hasattr(xer, 'calendars') else 0,
        'wbs_count': len(xer.wbs) if hasattr(xer, 'wbs') else 0,
        'relationships_count': len(xer.relationships) if hasattr(xer, 'relationships') else 0,
        'data_date': str(xer.data_date) if hasattr(xer, 'data_date') else 'Unknown',
        'sample_activities': [
            {
                'id': str(act.activity_id),
                'name': str(act.name),
                'status': str(act.status)
            }
            for act in list(xer.activities)[:5] if hasattr(xer, 'activities') else []
        ]
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
    
    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, { 
      encoding: 'utf-8', 
      timeout: 15000,
      maxBuffer: 1024 * 1024 * 10
    });
    
    return JSON.parse(result.trim());
  } catch (error) {
    return { error: `Could not extract XER: ${error.message}` };
  }
}

async function extractImageMetadata(filepath) {
  const stats = await fs.stat(filepath);
  return { size: stats.size, modified: stats.mtime, dimensions: 'unknown' };
}

function summarizeTextContent(content, ext) {
  if (!content || typeof content !== 'string') return `Empty ${ext} file`;
  const lines = content.split('\n').filter(l => l.trim());
  const wordCount = content.split(/\s+/).length;
  const preview = content.substring(0, 200).replace(/\n/g, ' ');
  return `${ext} file with ${lines.length} lines, ~${wordCount} words. Preview: "${preview}..."`;
}

function summarizeSpreadsheet(data) {
  if (!data || data.error) return `Excel file (could not analyze: ${data?.error || 'unknown error'})`;
  const sheets = Object.keys(data);
  const summaries = sheets.map(name => `"${name}" (${data[name].rows} rows × ${data[name].cols} cols)`);
  return `Excel file with ${sheets.length} sheet(s): ${summaries.join(', ')}`;
}

function summarizeXER(data) {
  if (!data || data.error) return `Primavera P6 XER file (could not analyze: ${data?.error || 'unknown error'})`;
  
  const parts = [
    `Primavera P6 XER: "${data.project_name}"`,
    `${data.activities_count} activities`,
    `${data.resources_count} resources`,
    `${data.wbs_count} WBS nodes`,
    `${data.relationships_count} relationships`,
    `Data date: ${data.data_date}`
  ];
  
  return parts.join(', ');
}

function getFileType(ext) {
  const types = {
    '.txt': 'text', '.md': 'markdown', '.csv': 'spreadsheet', '.json': 'data', '.xml': 'data',
    '.yaml': 'data', '.yml': 'data', '.pdf': 'document', '.docx': 'document', '.doc': 'document',
    '.xlsx': 'spreadsheet', '.xls': 'spreadsheet', '.xer': 'project_schedule',
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.bmp': 'image', '.webp': 'image'
  };
  return types[ext] || 'unknown';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function analyzeFiles(files) {
  const analyses = [];
  for (const file of files) {
    const analysis = await analyzeFile(file.filepath, file.filename || file.name);
    analyses.push(analysis);
  }
  return analyses;
}

function generateContextSummary(analyses) {
  if (!analyses || analyses.length === 0) return '';
  
  let summary = `\n## 📎 Uploaded Files (${analyses.length}):\n`;
  summary += `**CRITICAL INSTRUCTIONS:**\n`;
  summary += `- Use this pre-analyzed file data directly. DO NOT create Python scripts to re-analyze files.\n`;
  summary += `- ONLY report facts from the analysis below. DO NOT invent, hallucinate, or guess details.\n`;
  summary += `- If asked about file content, reference the specific data provided below.\n`;
  summary += `- Keep responses focused and concise. No unnecessary file creation.\n\n`;
  
  for (const analysis of analyses) {
    summary += `\n### ${analysis.filename} (${analysis.sizeFormatted})\n`;
    summary += `- **Type:** ${analysis.type}\n`;
    summary += `- **Summary:** ${analysis.summary}\n`;
    
    // Handle XER files specially - show project structure
    if (analysis.extension === '.xer' && analysis.content && !analysis.content.error) {
      summary += `- **Project:** ${analysis.content.project_name}\n`;
      summary += `- **Activities:** ${analysis.content.activities_count}\n`;
      summary += `- **Resources:** ${analysis.content.resources_count}\n`;
      summary += `- **WBS Nodes:** ${analysis.content.wbs_count}\n`;
      summary += `- **Relationships:** ${analysis.content.relationships_count}\n`;
      if (analysis.content.sample_activities && analysis.content.sample_activities.length > 0) {
        summary += `- **Sample Activities:**\n`;
        for (const act of analysis.content.sample_activities.slice(0, 3)) {
          summary += `  - ${act.id}: ${act.name} (${act.status})\n`;
        }
      }
    }
    // Handle text content preview
    else if (analysis.content && typeof analysis.content === 'string' && analysis.content.length < 500) {
      summary += `- **Content Preview:**\n\`\`\`\n${analysis.content.substring(0, 300)}\n\`\`\`\n`;
    } 
    // Handle Excel sheets
    else if (analysis.content && typeof analysis.content === 'object' && !analysis.content.error && Object.keys(analysis.content).length > 0) {
      summary += `- **Sheets:** ${Object.keys(analysis.content).join(', ')}\n`;
    }
  }
  
  return summary;
}

module.exports = {
  analyzeFile,
  analyzeFiles,
  generateContextSummary
};
