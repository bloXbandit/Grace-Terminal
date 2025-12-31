/**
 * Image Edit Service
 * Provides two editing approaches:
 * 1. Technical edits via Python/Pillow (filters, resize, crop, adjustments)
 * 2. AI-powered edits via OpenAI DALL-E (inpainting, object changes, style transfer)
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

class ImageEditService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.dalleEditUrl = 'https://api.openai.com/v1/images/edits';
    this.dalleVariationsUrl = 'https://api.openai.com/v1/images/variations';
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('✅ ImageEditService initialized');
  }

  /**
   * Detect what type of edit is being requested
   * @param {string} request - User's edit request
   * @returns {Object} - { type: 'technical'|'ai', operation: string, params: object }
   */
  detectEditType(request) {
    const q = (request || '').toLowerCase();
    
    // Technical edits (Pillow)
    const technicalPatterns = {
      resize: /\b(resize|scale|make.*(?:bigger|smaller|larger)|shrink|enlarge)\b.*?(\d+)?\s*[x×]?\s*(\d+)?/i,
      crop: /\b(crop|trim|cut)\b/i,
      rotate: /\b(rotate|turn|flip|mirror)\b.*?(\d+)?/i,
      grayscale: /\b(black\s*(?:and|&)?\s*white|grayscale|greyscale|b\s*[&/]\s*w|desaturate|monochrome)\b/i,
      brightness: /\b(bright(?:en|er|ness)?|dark(?:en|er)?|lighten|dim)\b/i,
      contrast: /\b(contrast|more\s+contrast|less\s+contrast|increase\s+contrast|decrease\s+contrast)\b/i,
      saturation: /\b(saturat(?:e|ion)|vibran(?:t|ce)|colorful|desaturate|muted)\b/i,
      sharpen: /\b(sharpen|sharper|blur|soften|smooth)\b/i,
      filter: /\b(sepia|vintage|warm|cool|cold|filter)\b/i,
      compress: /\b(compress|optimize|reduce\s+(?:size|quality)|smaller\s+file)\b/i,
      format: /\b(convert\s+to|change\s+to|make\s+it\s+a?)\s*(png|jpg|jpeg|webp|gif)\b/i
    };

    for (const [op, pattern] of Object.entries(technicalPatterns)) {
      const match = q.match(pattern);
      if (match) {
        return {
          type: 'technical',
          operation: op,
          match: match,
          params: this._extractTechnicalParams(op, match, q)
        };
      }
    }

    // AI-powered edits (DALL-E)
    const aiPatterns = {
      remove: /\b(remove|delete|erase|get\s+rid\s+of|take\s+out)\b/i,
      add: /\b(add|put|place|insert)\b.*\b(to|in|on|into)\b/i,
      replace: /\b(replace|change|swap|switch)\b.*\b(with|to|into)\b/i,
      background: /\b(change|replace|remove)\s*(?:the\s*)?(background|backdrop)\b/i,
      style: /\b(make\s+it|convert\s+to|style\s+as|turn\s+into)\s*(cartoon|anime|painting|sketch|watercolor|oil\s+painting|pencil|artistic)\b/i,
      enhance: /\b(enhance|improve|fix|restore|upscale|better\s+quality)\b/i,
      recolor: /\b(recolor|change\s+(?:the\s+)?color|make\s+(?:it\s+)?(?:the\s+)?\w+\s+(?:red|blue|green|yellow|purple|orange|pink))\b/i,
      variation: /\b(variation|variant|similar|like\s+this\s+but|another\s+version)\b/i
    };

    for (const [op, pattern] of Object.entries(aiPatterns)) {
      if (pattern.test(q)) {
        return {
          type: 'ai',
          operation: op,
          params: { prompt: request }
        };
      }
    }

    // Default to AI if unclear but seems like an edit request
    if (/\b(edit|modify|change|update|alter)\b/i.test(q)) {
      return {
        type: 'ai',
        operation: 'general',
        params: { prompt: request }
      };
    }

    return null;
  }

  /**
   * Extract parameters for technical operations
   */
  _extractTechnicalParams(operation, match, query) {
    const params = {};
    
    switch (operation) {
      case 'resize':
        // Try to extract dimensions
        const dimMatch = query.match(/(\d+)\s*[x×]\s*(\d+)/i);
        if (dimMatch) {
          params.width = parseInt(dimMatch[1]);
          params.height = parseInt(dimMatch[2]);
        } else {
          // Check for percentage
          const pctMatch = query.match(/(\d+)\s*%/);
          if (pctMatch) {
            params.scale = parseInt(pctMatch[1]) / 100;
          } else if (/smaller|shrink/i.test(query)) {
            params.scale = 0.5;
          } else if (/bigger|larger|enlarge/i.test(query)) {
            params.scale = 2.0;
          }
        }
        break;
        
      case 'rotate':
        const degMatch = query.match(/(\d+)\s*(?:deg(?:rees?)?)?/i);
        if (degMatch) {
          params.degrees = parseInt(degMatch[1]);
        } else if (/flip.*(?:horizontal|left|right)/i.test(query)) {
          params.flip = 'horizontal';
        } else if (/flip.*(?:vertical|up|down)/i.test(query)) {
          params.flip = 'vertical';
        } else if (/mirror/i.test(query)) {
          params.flip = 'horizontal';
        } else {
          params.degrees = 90; // default
        }
        break;
        
      case 'brightness':
        if (/bright|lighten/i.test(query)) {
          params.factor = 1.3;
        } else if (/dark|dim/i.test(query)) {
          params.factor = 0.7;
        }
        break;
        
      case 'contrast':
        if (/more|increase|high/i.test(query)) {
          params.factor = 1.5;
        } else if (/less|decrease|low/i.test(query)) {
          params.factor = 0.7;
        } else {
          params.factor = 1.3;
        }
        break;
        
      case 'saturation':
        if (/vibrant|colorful|saturate/i.test(query) && !/desaturate/i.test(query)) {
          params.factor = 1.5;
        } else if (/muted|desaturate/i.test(query)) {
          params.factor = 0.5;
        }
        break;
        
      case 'sharpen':
        if (/blur|soften|smooth/i.test(query)) {
          params.blur = true;
          params.radius = 2;
        } else {
          params.sharpen = true;
        }
        break;
        
      case 'filter':
        if (/sepia/i.test(query)) params.filter = 'sepia';
        else if (/vintage/i.test(query)) params.filter = 'vintage';
        else if (/warm/i.test(query)) params.filter = 'warm';
        else if (/cool|cold/i.test(query)) params.filter = 'cool';
        break;
        
      case 'format':
        const formatMatch = query.match(/\b(png|jpg|jpeg|webp|gif)\b/i);
        if (formatMatch) {
          params.format = formatMatch[1].toLowerCase();
          if (params.format === 'jpg') params.format = 'jpeg';
        }
        break;
    }
    
    return params;
  }

  /**
   * Generate Python/Pillow code for technical edits
   * @param {string} inputPath - Path to input image
   * @param {string} outputPath - Path for output image
   * @param {string} operation - Edit operation type
   * @param {Object} params - Operation parameters
   * @returns {string} - Python code
   */
  generatePillowCode(inputPath, outputPath, operation, params = {}) {
    const pythonEscape = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const inPath = pythonEscape(inputPath);
    const outPath = pythonEscape(outputPath);
    
    let code = `from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import os

# Load image
img = Image.open('${inPath}')
print(f"Loaded image: {img.size}, mode: {img.mode}")

# Convert to RGB if necessary (for JPEG output)
if img.mode in ('RGBA', 'P') and '${outPath}'.lower().endswith(('.jpg', '.jpeg')):
    img = img.convert('RGB')
elif img.mode == 'P':
    img = img.convert('RGBA')

`;

    switch (operation) {
      case 'resize':
        if (params.width && params.height) {
          code += `# Resize to specific dimensions
img = img.resize((${params.width}, ${params.height}), Image.Resampling.LANCZOS)
print(f"Resized to: {img.size}")
`;
        } else if (params.scale) {
          code += `# Scale by factor
new_width = int(img.width * ${params.scale})
new_height = int(img.height * ${params.scale})
img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
print(f"Scaled to: {img.size}")
`;
        }
        break;
        
      case 'crop':
        code += `# Auto-crop (remove borders) or center crop
# For now, do a center crop to 80% of original size
margin_x = int(img.width * 0.1)
margin_y = int(img.height * 0.1)
img = img.crop((margin_x, margin_y, img.width - margin_x, img.height - margin_y))
print(f"Cropped to: {img.size}")
`;
        break;
        
      case 'rotate':
        if (params.flip === 'horizontal') {
          code += `# Flip horizontal (mirror)
img = ImageOps.mirror(img)
print("Flipped horizontally")
`;
        } else if (params.flip === 'vertical') {
          code += `# Flip vertical
img = ImageOps.flip(img)
print("Flipped vertically")
`;
        } else {
          code += `# Rotate ${params.degrees || 90} degrees
img = img.rotate(${params.degrees || 90}, expand=True, resample=Image.Resampling.BICUBIC)
print(f"Rotated ${params.degrees || 90} degrees")
`;
        }
        break;
        
      case 'grayscale':
        code += `# Convert to grayscale (black & white)
img = ImageOps.grayscale(img)
print("Converted to grayscale")
`;
        break;
        
      case 'brightness':
        code += `# Adjust brightness
enhancer = ImageEnhance.Brightness(img)
img = enhancer.enhance(${params.factor || 1.3})
print(f"Brightness adjusted by factor ${params.factor || 1.3}")
`;
        break;
        
      case 'contrast':
        code += `# Adjust contrast
enhancer = ImageEnhance.Contrast(img)
img = enhancer.enhance(${params.factor || 1.3})
print(f"Contrast adjusted by factor ${params.factor || 1.3}")
`;
        break;
        
      case 'saturation':
        code += `# Adjust saturation/color
enhancer = ImageEnhance.Color(img)
img = enhancer.enhance(${params.factor || 1.3})
print(f"Saturation adjusted by factor ${params.factor || 1.3}")
`;
        break;
        
      case 'sharpen':
        if (params.blur) {
          code += `# Apply blur
img = img.filter(ImageFilter.GaussianBlur(radius=${params.radius || 2}))
print("Applied blur")
`;
        } else {
          code += `# Sharpen image
img = img.filter(ImageFilter.SHARPEN)
print("Image sharpened")
`;
        }
        break;
        
      case 'filter':
        if (params.filter === 'sepia') {
          code += `# Apply sepia filter
import numpy as np
from PIL import Image

# Convert to numpy array
arr = np.array(img.convert('RGB'), dtype=np.float64)

# Sepia matrix
sepia_matrix = np.array([
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131]
])

# Apply sepia
sepia_arr = arr @ sepia_matrix.T
sepia_arr = np.clip(sepia_arr, 0, 255).astype(np.uint8)
img = Image.fromarray(sepia_arr)
print("Applied sepia filter")
`;
        } else if (params.filter === 'vintage') {
          code += `# Apply vintage filter (sepia + reduced contrast)
# First convert to sepia
import numpy as np
arr = np.array(img.convert('RGB'), dtype=np.float64)
sepia_matrix = np.array([
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131]
])
sepia_arr = arr @ sepia_matrix.T
sepia_arr = np.clip(sepia_arr, 0, 255).astype(np.uint8)
img = Image.fromarray(sepia_arr)
# Reduce contrast slightly
enhancer = ImageEnhance.Contrast(img)
img = enhancer.enhance(0.85)
print("Applied vintage filter")
`;
        } else if (params.filter === 'warm') {
          code += `# Apply warm filter (increase red/yellow tones)
from PIL import ImageEnhance
# Increase color saturation slightly
enhancer = ImageEnhance.Color(img)
img = enhancer.enhance(1.2)
# Split channels and boost red/green
r, g, b = img.split()
r = r.point(lambda x: min(255, int(x * 1.1)))
img = Image.merge('RGB', (r, g, b))
print("Applied warm filter")
`;
        } else if (params.filter === 'cool') {
          code += `# Apply cool filter (increase blue tones)
r, g, b = img.convert('RGB').split()
b = b.point(lambda x: min(255, int(x * 1.15)))
r = r.point(lambda x: int(x * 0.95))
img = Image.merge('RGB', (r, g, b))
print("Applied cool filter")
`;
        }
        break;
        
      case 'compress':
        code += `# Compress/optimize (handled in save)
print("Will save with optimization")
`;
        break;
        
      case 'format':
        // Format conversion handled in save
        code += `print("Converting format to ${params.format || 'png'}")
`;
        break;
        
      default:
        code += `print("No specific operation - saving as-is")
`;
    }

    // Add save logic
    const quality = operation === 'compress' ? 60 : 85;
    code += `
# Save result
os.makedirs(os.path.dirname('${outPath}'), exist_ok=True)
if '${outPath}'.lower().endswith(('.jpg', '.jpeg')):
    if img.mode == 'RGBA':
        img = img.convert('RGB')
    img.save('${outPath}', 'JPEG', quality=${quality}, optimize=True)
elif '${outPath}'.lower().endswith('.png'):
    img.save('${outPath}', 'PNG', optimize=True)
elif '${outPath}'.lower().endswith('.webp'):
    img.save('${outPath}', 'WEBP', quality=${quality})
else:
    img.save('${outPath}')

print(f"✅ Created {os.path.basename('${outPath}')}")
`;

    return code;
  }

  /**
   * Edit image using OpenAI DALL-E edit API
   * @param {string} imagePath - Path to input image
   * @param {string} prompt - Edit instructions
   * @param {string} outputPath - Path for output image
   * @param {Object} options - Additional options (mask, size)
   * @returns {Promise<Object>} - Result with output path
   */
  async editWithDallE(imagePath, prompt, outputPath, options = {}) {
    await this.initialize();

    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is required for AI-powered image editing');
    }

    const { size = '1024x1024', mask = null } = options;

    try {
      // Read image file
      const imageBuffer = await fs.readFile(imagePath);
      
      // Create form data
      const form = new FormData();
      form.append('image', imageBuffer, {
        filename: path.basename(imagePath),
        contentType: 'image/png'
      });
      form.append('prompt', prompt);
      form.append('model', 'dall-e-2'); // DALL-E 2 supports edits
      form.append('n', '1');
      form.append('size', size);
      form.append('response_format', 'b64_json');

      // Add mask if provided
      if (mask) {
        const maskBuffer = await fs.readFile(mask);
        form.append('mask', maskBuffer, {
          filename: 'mask.png',
          contentType: 'image/png'
        });
      }

      console.log(`🎨 Sending image to DALL-E for editing: "${prompt.substring(0, 50)}..."`);

      const response = await axios.post(this.dalleEditUrl, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        timeout: 120000 // 2 minutes
      });

      if (!response.data?.data?.[0]?.b64_json) {
        throw new Error('No image data in DALL-E response');
      }

      // Save the edited image
      const imageBase64 = response.data.data[0].b64_json;
      const buffer = Buffer.from(imageBase64, 'base64');
      
      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, buffer);

      console.log(`✅ AI-edited image saved to: ${outputPath}`);

      return {
        success: true,
        outputPath,
        prompt,
        revisedPrompt: response.data.data[0].revised_prompt || prompt
      };

    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      console.error(`❌ DALL-E edit failed: ${errMsg}`);
      throw new Error(`AI image edit failed: ${errMsg}`);
    }
  }

  /**
   * Create image variation using DALL-E
   * @param {string} imagePath - Path to input image
   * @param {string} outputPath - Path for output image
   * @param {Object} options - Additional options
   */
  async createVariation(imagePath, outputPath, options = {}) {
    await this.initialize();

    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is required for AI-powered image variations');
    }

    const { size = '1024x1024' } = options;

    try {
      const imageBuffer = await fs.readFile(imagePath);
      
      const form = new FormData();
      form.append('image', imageBuffer, {
        filename: path.basename(imagePath),
        contentType: 'image/png'
      });
      form.append('model', 'dall-e-2');
      form.append('n', '1');
      form.append('size', size);
      form.append('response_format', 'b64_json');

      console.log(`🎨 Creating variation of image...`);

      const response = await axios.post(this.dalleVariationsUrl, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        timeout: 120000
      });

      if (!response.data?.data?.[0]?.b64_json) {
        throw new Error('No image data in DALL-E response');
      }

      const imageBase64 = response.data.data[0].b64_json;
      const buffer = Buffer.from(imageBase64, 'base64');
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, buffer);

      console.log(`✅ Image variation saved to: ${outputPath}`);

      return {
        success: true,
        outputPath
      };

    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      console.error(`❌ DALL-E variation failed: ${errMsg}`);
      throw new Error(`Image variation failed: ${errMsg}`);
    }
  }

  /**
   * Check if file is an editable image
   * @param {string} filepath - File path
   * @returns {boolean}
   */
  isEditableImage(filepath) {
    if (!filepath) return false;
    const ext = path.extname(filepath).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'].includes(ext);
  }

  /**
   * Generate output filename based on operation
   */
  generateOutputFilename(originalPath, operation) {
    const ext = path.extname(originalPath);
    const base = path.basename(originalPath, ext);
    const dir = path.dirname(originalPath);
    const timestamp = Date.now();
    
    const opSuffix = {
      resize: 'resized',
      crop: 'cropped',
      rotate: 'rotated',
      grayscale: 'bw',
      brightness: 'bright',
      contrast: 'contrast',
      saturation: 'saturated',
      sharpen: 'sharpened',
      filter: 'filtered',
      compress: 'compressed',
      format: 'converted',
      remove: 'edited',
      add: 'edited',
      replace: 'edited',
      background: 'edited',
      style: 'styled',
      enhance: 'enhanced',
      recolor: 'recolored',
      variation: 'variation',
      general: 'edited'
    };
    
    const suffix = opSuffix[operation] || 'edited';
    return path.join(dir, `${base}_${suffix}_${timestamp}${ext}`);
  }
}

module.exports = ImageEditService;
