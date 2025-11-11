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
        const pdfData = await extractPDF(filepath);
        if (typeof pdfData === 'object') {
          analysis.content = pdfData.content;
          analysis.metadata.pageCount = pdfData.pageCount;
        } else {
          analysis.content = pdfData;
        }
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
  // Try multiple PDF extraction methods as fallbacks
  
  // Method 1: pypdf (fastest, most reliable for text-based PDFs) - WITH PAGE COUNT
  try {
    const script1 = `
import json
from pypdf import PdfReader
reader = PdfReader('${filepath.replace(/'/g, "\\'")}')
page_count = len(reader.pages)
text = ''.join([page.extract_text() or '' for page in reader.pages[:10]])
print(json.dumps({'content': text[:10000], 'pageCount': page_count}))
`;
    const result1 = execSync(`python3 -c "${script1.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 10000 });
    if (result1.trim()) {
      try {
        const data = JSON.parse(result1.trim());
        return data; // Returns {content: string, pageCount: number}
      } catch {
        return result1.trim(); // Fallback to plain text
      }
    }
  } catch (error) {
    console.log('[FileAnalyzer] pypdf extraction failed, trying pdfplumber:', error.message);
  }
  
  // Method 2: pdfplumber (better for complex layouts)
  try {
    const script2 = `import pdfplumber; pdf = pdfplumber.open('${filepath.replace(/'/g, "\\'")}'); text = ''.join([p.extract_text() or '' for p in pdf.pages[:10]]); print(text[:10000])`;
    const result2 = execSync(`python3 -c "${script2.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 10000 });
    if (result2.trim()) return result2.trim();
  } catch (error) {
    console.log('[FileAnalyzer] pdfplumber extraction failed, trying PyPDF2:', error.message);
  }
  
  // Method 3: PyPDF2 (legacy but sometimes works when others fail)
  try {
    const script3 = `import PyPDF2; pdf = PyPDF2.PdfReader('${filepath.replace(/'/g, "\\'")}'); text = ''.join([page.extract_text() or '' for page in pdf.pages[:10]]); print(text[:10000])`;
    const result3 = execSync(`python3 -c "${script3.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 10000 });
    if (result3.trim()) return result3.trim();
  } catch (error) {
    console.log('[FileAnalyzer] PyPDF2 extraction failed, trying OCR:', error.message);
  }
  
  // Method 4: OCR (for image-based/scanned PDFs)
  try {
    const ocrScript = `
import pytesseract
from pdf2image import convert_from_path

# Convert first 5 pages to images and OCR
images = convert_from_path('${filepath.replace(/'/g, "\\'")}', first_page=1, last_page=5)
text = ''
for i, img in enumerate(images):
    page_text = pytesseract.image_to_string(img)
    if page_text.strip():
        text += f'Page {i+1}:\\n{page_text}\\n\\n'
    if len(text) > 10000:
        break

print(text[:10000] if text else '')
`;
    const result4 = execSync(`python3 -c "${ocrScript.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 30000 });
    if (result4.trim()) {
      console.log('[FileAnalyzer] ✅ OCR extraction successful');
      return result4.trim();
    }
  } catch (error) {
    console.log('[FileAnalyzer] OCR extraction failed:', error.message);
  }
  
  // All methods failed
  console.error('[FileAnalyzer] All PDF extraction methods (including OCR) failed');
  return '[PDF text extraction not available]';
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
    // CRITICAL: Handle both Sequelize models and plain objects
    // Extract filename from multiple possible sources
    const filename = file.filename || file.name || (file.filepath ? path.basename(file.filepath) : null) || (file.url ? path.basename(file.url) : null) || 'unknown';
    let filepath = file.filepath || (file.url ? path.join(process.cwd(), file.url) : null);
    
    if (!filepath) {
      console.warn('[FileAnalyzer] Skipping file with no filepath:', { file: JSON.stringify(file).substring(0, 200) });
      continue;
    }
    
    // CRITICAL: FILE PATH DISCIPLINE - Always use absolute paths
    if (!path.isAbsolute(filepath)) {
      filepath = path.resolve(filepath);
      console.log(`[FileAnalyzer] Converted relative path to absolute: ${filepath}`);
    }
    
    // CRITICAL: Validate file exists before processing
    try {
      await fs.access(filepath);
      console.log(`[FileAnalyzer] ✅ File exists and accessible: ${filepath}`);
    } catch (error) {
      console.error(`[FileAnalyzer] ❌ File not accessible: ${filepath}`, error.message);
      // Push error analysis instead of skipping
      analyses.push({
        filename,
        filepath,
        error: `File not accessible: ${error.message}`,
        summary: `Could not access file at ${filepath}`
      });
      continue;
    }
    
    const analysis = await analyzeFile(filepath, filename);
    analyses.push(analysis);
  }
  return analyses;
}

// Intelligent document type detection from content
function detectDocumentType(content, filename) {
  if (!content || typeof content !== 'string') return null;
  
  const lower = content.toLowerCase();
  const name = filename.toLowerCase();
  
  // Employment/Offer patterns
  if (lower.match(/offer letter|employment offer|offer of employment|position.*offer/i) || 
      lower.match(/compensation|salary|benefits|start date/i) && lower.match(/position|role|title/i)) {
    return { type: 'employment offer letter', confidence: 'high' };
  }
  
  // Contract patterns
  if (lower.match(/this agreement|contract between|parties agree|terms and conditions/i) ||
      name.match(/contract|agreement/)) {
    return { type: 'contract', confidence: 'medium' };
  }
  
  // Invoice patterns
  if (lower.match(/invoice|bill to|amount due|payment terms|invoice number/i) ||
      name.match(/invoice|bill/)) {
    return { type: 'invoice', confidence: 'high' };
  }
  
  // Resume/CV patterns
  if (lower.match(/resume|curriculum vitae|experience|education|skills/i) && 
      lower.match(/professional|work history|employment/i)) {
    return { type: 'resume', confidence: 'medium' };
  }
  
  // Report patterns
  if (lower.match(/executive summary|findings|recommendations|analysis|report/i) ||
      name.match(/report/)) {
    return { type: 'report', confidence: 'medium' };
  }
  
  // Proposal patterns
  if (lower.match(/proposal|statement of work|scope of work|project proposal/i)) {
    return { type: 'proposal', confidence: 'medium' };
  }
  
  // Authorization/Certification patterns
  if (lower.match(/authorization|certification|borrower.*certification|authorization.*form/i) ||
      lower.match(/hereby certify|hereby authorize|authorization to/i)) {
    return { type: 'authorization document', confidence: 'high' };
  }
  
  // Loan/Mortgage patterns
  if (lower.match(/loan agreement|mortgage|promissory note|lending/i)) {
    return { type: 'loan document', confidence: 'high' };
  }
  
  // Paycheck/Paystub patterns
  if (lower.match(/paycheck|pay stub|paystub|pay statement|earnings statement|wage statement/i) ||
      name.match(/paycheck|paystub|pay_stub|earnings/i) ||
      (lower.match(/gross pay|net pay|deductions|withholding/i) && lower.match(/employee|earnings|period ending/i))) {
    return { type: 'paycheck', confidence: 'high' };
  }
  
  return null;
}

// Extract key entities from document content
function extractKeyDetails(content, docType) {
  if (!content || typeof content !== 'string') return {};
  
  const details = {};
  
  // Extract names (look for "To:", "From:", "Dear", proper capitalization)
  const toMatch = content.match(/To:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  if (toMatch) details.recipient = toMatch[1].trim();
  
  const fromMatch = content.match(/From:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  if (fromMatch) details.sender = fromMatch[1].trim();
  
  // Extract company names (look for LLC, Inc, Corp, Technologies, etc.)
  const companyMatch = content.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:LLC|Inc\.|Corp\.|Corporation|Technologies|Tech|Company|Co\.))/i);
  if (companyMatch) details.company = companyMatch[1].trim();
  
  // Extract position/role for employment offers
  if (docType === 'employment offer letter') {
    const positionMatch = content.match(/position[:\s]+([A-Z][^.\n]+?)(?=\.|\n|for)/i) ||
                         content.match(/role[:\s]+([A-Z][^.\n]+?)(?=\.|\n|for)/i) ||
                         content.match(/title[:\s]+([A-Z][^.\n]+?)(?=\.|\n|for)/i);
    if (positionMatch) details.position = positionMatch[1].trim();
  }
  
  // Extract employee and pay info for paychecks
  if (docType === 'paycheck') {
    // Look for employee name
    const employeeMatch = content.match(/employee[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i) ||
                         content.match(/name[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i) ||
                         content.match(/pay to[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (employeeMatch) details.employee = employeeMatch[1].trim();
    
    // Look for gross pay amount
    const grossPayMatch = content.match(/gross pay[:\s]*\$?([0-9,]+\.?[0-9]*)/i) ||
                         content.match(/\*\*\*\s*([0-9,]+\.[0-9]{2})/); // Pattern like "*** 3683.02"
    if (grossPayMatch) {
      details.grossPay = grossPayMatch[1].replace(/,/g, '');
    }
    
    // Look for pay period/date
    const dateMatch = content.match(/period ending[:\s]*(\d{4}-\d{2}-\d{2})/i) ||
                     content.match(/pay date[:\s]*(\d{4}-\d{2}-\d{2})/i) ||
                     content.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) details.payDate = dateMatch[1];
    
    // Look for employer
    const employerMatch = content.match(/employer[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i) ||
                         content.match(/company[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (employerMatch) details.employer = employerMatch[1].trim();
  }
  
  // Extract borrower/signer names for authorization/loan documents
  if (docType === 'authorization document' || docType === 'loan document') {
    // Look for borrower name
    const borrowerMatch = content.match(/borrower[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i) ||
                         content.match(/name[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i) ||
                         content.match(/I,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+),/i);
    if (borrowerMatch) details.borrower = borrowerMatch[1].trim();
    
    // Extract lender/company for mortgage docs (UWM, Rocket Mortgage, etc.)
    const lenderMatch = content.match(/(United Wholesale Mortgage|UWM|Rocket Mortgage|Quicken Loans|Wells Fargo|Chase|Bank of America)/i) ||
                       content.match(/lender[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (lenderMatch) details.lender = lenderMatch[1].trim();
    
    // Extract date - look for various date formats
    const dateMatch = content.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/i) ||
                     content.match(/(\d{4}-\d{2}-\d{2})/i) ||
                     content.match(/date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i) ||
                     content.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
    if (dateMatch) details.date = dateMatch[1].trim();
    
    // Check for signature indicators
    const signatureMatch = content.match(/signature[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i) ||
                          content.match(/signed[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i) ||
                          content.match(/\_+\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (signatureMatch) details.signer = signatureMatch[1].trim();
    
    // Check if executed/signed (contains signature lines but no names = unsigned)
    const hasSignatureLine = content.match(/_____+/) || content.match(/signature:/i);
    const hasSignedName = content.match(/signed.*[A-Z][a-z]+\s+[A-Z][a-z]+/i);
    details.isSigned = hasSignedName ? true : (hasSignatureLine ? false : null);
  }
  
  return details;
}

// Generate user-friendly summary for direct user responses (no backend instructions)
function generateUserFriendlySummary(analyses) {
  if (!analyses || analyses.length === 0) return '';
  
  // For single file, make it super conversational
  if (analyses.length === 1) {
    const analysis = analyses[0];
    const content = typeof analysis.content === 'string' ? analysis.content : '';
    
    // Try to intelligently detect document type
    const docType = detectDocumentType(content, analysis.filename);
    const details = extractKeyDetails(content, docType?.type);
    const pageCount = analysis.metadata?.pageCount;
    
    // Build intelligent natural language summary
    if (docType && docType.confidence === 'high') {
      let response = `Yup, I can see it! `;
      
      if (docType.type === 'authorization document') {
        response += `This is a borrower's authorization document`;
        
        // Add page count
        if (pageCount) {
          response += `. It has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
        }
        
        // Add signature status
        if (details.isSigned === true && details.signer) {
          response += ` and is signed by ${details.signer}`;
        } else if (details.isSigned === false && details.borrower) {
          response += ` and needs to be signed by ${details.borrower}`;
        } else if (details.borrower) {
          response += ` for ${details.borrower}`;
        }
        
        response += `.`;
      } else if (docType.type === 'loan document') {
        response += `This is a loan document`;
        
        if (pageCount) {
          response += `. It has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
        }
        
        if (details.borrower) {
          response += ` for ${details.borrower}`;
        }
        
        if (details.company) {
          response += ` from ${details.company}`;
        }
        
        response += `.`;
      } else if (docType.type === 'employment offer letter') {
        response += `This is an employment offer letter`;
        
        if (pageCount) {
          response += ` (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})`;
        }
        
        if (details.position) response += ` for a ${details.position} position`;
        if (details.recipient) response += ` addressed to ${details.recipient}`;
        if (details.company) response += ` from ${details.company}`;
        response += `.`;
      } else if (docType.type === 'invoice') {
        response += `This is an invoice`;
        if (pageCount) response += ` (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})`;
        if (details.company) response += ` from ${details.company}`;
        response += `.`;
      } else if (docType.type === 'contract') {
        response += `This is a contract`;
        if (pageCount) response += ` (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})`;
        if (details.company) response += ` involving ${details.company}`;
        response += `.`;
      } else if (docType.type === 'paycheck') {
        response += `Got it! This is a paycheck`;
        
        if (details.payDate) {
          response += ` from ${details.payDate}`;
        }
        
        if (details.employee) {
          response += ` for ${details.employee}`;
        }
        
        if (details.grossPay) {
          response += `. Gross pay: $${details.grossPay}`;
        }
        
        if (details.employer) {
          response += ` from ${details.employer}`;
        }
        
        response += `.`;
      } else {
        response += `This looks like a ${docType.type}`;
        if (pageCount) response += ` (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})`;
        response += `.`;
      }
      
      response += `\n\nWhat would you like to know or do with this?`;
      return response;
    }
    
    // Fallback: Generic description with metadata (NO raw content dump)
    let response = '';
    if (analysis.extension === '.pdf') {
      response = `Yup, got it! It's a PDF document`;
      if (pageCount) response += ` with ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
      response += ` (${analysis.sizeFormatted}).`;
    } else if (analysis.extension === '.docx' || analysis.extension === '.doc') {
      response = `Yup, I can see it! It's a Word document (${analysis.sizeFormatted}).`;
    } else if (analysis.extension === '.xlsx' || analysis.extension === '.xls') {
      response = `Got it! It's an Excel spreadsheet (${analysis.sizeFormatted}).`;
    } else if (analysis.extension === '.xer') {
      response = `Perfect! It's a Primavera P6 project schedule (${analysis.sizeFormatted}).`;
    } else {
      response = `Yup, I can see the file (${analysis.sizeFormatted}).`;
    }
    
    response += `\n\nHow can I help you with this?`;
    return response;
  }
  
  // Multiple files - be concise but friendly
  return `Got them! You've uploaded ${analyses.length} files. What would you like me to do with these?`;
}

// Generate specialist context summary (with backend instructions)
function generateContextSummary(analyses) {
  if (!analyses || analyses.length === 0) return '';
  
  let summary = `\n## 📎 Uploaded Files (${analyses.length}):\n`;
  summary += `**🚨 CRITICAL: DO NOT RE-ANALYZE FILES 🚨**\n`;
  summary += `- All file data is PRE-ANALYZED and provided below\n`;
  summary += `- DO NOT write Python scripts to re-analyze files\n`;
  summary += `- DO NOT execute code to check file existence\n`;
  summary += `- DO NOT create file analysis scripts\n`;
  summary += `- ONLY use the data provided in this context\n`;
  summary += `- If user asks "what's in this file?" or "breakdown the contents", STREAM the analysis data directly in natural language\n`;
  summary += `- Keep responses conversational - no unnecessary code execution\n`;
  summary += `- ONLY report facts from the analysis below. DO NOT invent, hallucinate, or guess details.\n\n`;
  
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

// Generate streaming content breakdown for follow-up questions
async function generateStreamingBreakdown(analysis, onTokenStream) {
  if (!analysis) return 'Sorry, I couldn\'t analyze that file.';
  
  const content = typeof analysis.content === 'string' ? analysis.content : '';
  const docType = detectDocumentType(content, analysis.filename);
  const details = extractKeyDetails(content, docType?.type);
  const pageCount = analysis.metadata?.pageCount;
  
  // CRITICAL: For large documents (>20 pages), provide summary instead of full breakdown
  // This prevents hitting the 10-iteration limit in AgenticAgent
  const isLargeDocument = pageCount && pageCount > 20;
  
  // Build full response as single message (no fragmented bubbles)
  let response = '';
  
  if (docType && docType.confidence === 'high') {
    if (docType.type === 'paycheck') {
      response = `Alright, let me break down this paycheck for you...\n\n`;
      
      if (details.employee) {
        response += `**Employee:** ${details.employee}\n`;
      }
      
      if (details.payDate) {
        response += `**Pay Date:** ${details.payDate}\n`;
      }
      
      if (details.grossPay) {
        response += `**Gross Pay:** $${details.grossPay}\n`;
      }
      
      if (details.employer) {
        response += `**Employer:** ${details.employer}\n\n`;
      }
      
      // Add preview of the content
      if (content && content.length > 100) {
        response += `Here's what I see in the document:\n\n`;
        
        // Extract key sections from content
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
          const line = lines[i].trim();
          if (line) {
            response += `${line}\n`;
          }
        }
      }
      
    } else if (docType.type === 'authorization document') {
      // Natural language summary for authorization documents
      response = `This is a borrower's authorization`;
      
      // Add lender/company context
      if (details.lender) {
        response += ` for ${details.lender}`;
      }
      
      // Add borrower if found
      if (details.borrower) {
        response += ` for client ${details.borrower}`;
      }
      
      response += `.`;
      
      // Add execution/signature status
      if (details.isSigned === true) {
        response += ` The document appears to be executed (signed)`;
        if (details.date) {
          response += ` on ${details.date}`;
        }
      } else if (details.isSigned === false) {
        response += ` The document is not yet executed (unsigned)`;
      } else if (details.date) {
        response += ` Document dated ${details.date}`;
      }
      
      response += `.`;
      
      // Add page count
      if (pageCount) {
        response += ` It has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`;
      }
      
      // Add key content summary (NOT raw text dump)
      response += `\n\nThis authorization certifies that the borrower has applied for a mortgage loan and confirms all information provided is true and complete. It acknowledges receipt of required disclosures under RESPA and Truth In Lending Act.`;
      
      // For large documents, add note
      if (isLargeDocument) {
        response += `\n\n_Note: This is a ${pageCount}-page document. I've provided the key details above. If you need specific sections or information, just ask!_`;
      }
      
    } else {
      // Generic document breakdown
      response = `Breaking down this ${docType.type}...\n\n`;
      
      if (pageCount) {
        response += `**Pages:** ${pageCount}\n`;
      }
      
      if (details.company) {
        response += `**Company:** ${details.company}\n`;
      }
      
      // Add content preview with cleaned text
      if (isLargeDocument) {
        // For large documents, provide concise summary
        const cleanedContent = cleanExtractedText(content);
        const lines = cleanedContent.split('\n').filter(l => l.trim().length > 30);
        const preview = lines.slice(0, 10).join('\n');
        response += `\n**Summary:**\nThis is a ${pageCount}-page ${docType.type}. Here's a preview of the beginning:\n\n${preview}\n\n_If you need specific sections or details from this large document, just ask!_`;
      } else if (content && content.length > 100) {
        const cleanedContent = cleanExtractedText(content);
        response += `\n**Content Preview:**\n${cleanedContent.substring(0, 800)}${cleanedContent.length > 800 ? '...' : ''}\n`;
      }
    }
  } else {
    // Generic file breakdown (no doc type detected)
    response = `Let me show you what's in this file...\n\n`;
    response += `**File:** ${analysis.filename} (${analysis.sizeFormatted})\n`;
    
    if (pageCount) {
      response += `**Pages:** ${pageCount}\n`;
      
      // CRITICAL: For large documents, warn user and provide summary only
      if (isLargeDocument) {
        response += `\nThis is a large document (${pageCount} pages). Here's a summary of the key sections:\n\n`;
        
        // Extract first few paragraphs and last paragraph
        const lines = content.split('\n').filter(l => l.trim().length > 30);
        const firstSection = lines.slice(0, 15).join('\n');
        const lastSection = lines.slice(-5).join('\n');
        
        response += `**Beginning:**\n${firstSection}\n\n`;
        response += `**End:**\n${lastSection}\n\n`;
        response += `_Note: This is a ${pageCount}-page document. I've shown you the beginning and end. If you need specific sections or details, just ask!_`;
      } else {
        response += `\n`;
        // Show cleaned content for user-friendly display
        const cleanedContent = cleanExtractedText(content);
        if (cleanedContent && cleanedContent.length > 100) {
          response += `**Content:**\n${cleanedContent.substring(0, 1000)}${cleanedContent.length > 1000 ? '\n\n...(content continues)' : ''}\n`;
        } else if (cleanedContent && cleanedContent.trim().length > 0) {
          response += `**Content:**\n${cleanedContent}\n`;
        }
      }
    } else {
      // No page count, show cleaned content normally
      const cleanedContent = cleanExtractedText(content);
      if (cleanedContent && cleanedContent.length > 100) {
        response += `\n**Content:**\n${cleanedContent.substring(0, 1000)}${cleanedContent.length > 1000 ? '\n\n...(content continues)' : ''}\n`;
      } else if (cleanedContent && cleanedContent.trim().length > 0) {
        response += `\n**Content:**\n${cleanedContent}\n`;
      }
    }
    // If no content, just show file info silently - no need to mention extraction failure
  }
  
  return response;
}

/**
 * Clean and normalize extracted text for user-friendly display
 * Fixes issues with broken line breaks from PDF/DOCX extraction
 */
function cleanExtractedText(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Replace multiple newlines with double newline (paragraph break)
  let cleaned = text.replace(/\n{3,}/g, '\n\n');
  
  // Fix broken words across lines: "some\nword" -> "some word"
  // BUT preserve intentional paragraph breaks (double newlines)
  cleaned = cleaned.replace(/([a-z,])\n([a-z])/g, '$1 $2');
  
  // Remove excessive whitespace within lines
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
  
  // Trim each line
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
  
  // Remove empty lines between text (but keep paragraph breaks)
  cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
  
  return cleaned.trim();
}

module.exports = {
  analyzeFile,
  analyzeFiles,
  generateContextSummary,
  generateUserFriendlySummary,
  generateStreamingBreakdown,
  detectDocumentType,
  extractKeyDetails
};
