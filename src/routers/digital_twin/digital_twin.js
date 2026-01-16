const router = require("koa-router")();
require("module-alias/register");

const DigitalTwin = require("@src/models/DigitalTwin");
const TwinVideo = require("@src/models/TwinVideo");
const DigitalTwinService = require("@src/utils/digital_twin");
const multer = require('@koa/multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for TWIN-SPECIFIC file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    let uploadDir;
    if (file.fieldname === 'face_image') {
      // Directory for twin face images
      uploadDir = path.join(process.cwd(), 'workspace', 'digital-twins', 'faces');
    } else if (file.fieldname === 'voice_sample') {
      // Directory for twin voice samples
      uploadDir = path.join(process.cwd(), 'workspace', 'digital-twins', 'voices');
    } else {
      // Fallback directory
      uploadDir = path.join(process.cwd(), 'workspace', 'digital-twins', 'uploads');
    }
    
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (e) {}
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const userId = req.state?.user?.id || 'unknown';
    const timestamp = Date.now();
    
    if (file.fieldname === 'face_image') {
      cb(null, `twin_face_${userId}_${timestamp}${ext}`);
    } else if (file.fieldname === 'voice_sample') {
      cb(null, `twin_voice_${userId}_${timestamp}${ext}`);
    } else {
      cb(null, `twin_file_${userId}_${timestamp}${ext}`);
    }
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'face_image') {
      // Validation for face images
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      
      const ext = path.extname(file.originalname).toLowerCase();
      
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed for twin photos.'), false);
      }
      
      if (!allowedExtensions.includes(ext)) {
        return cb(new Error('Invalid file extension. Only .jpg, .jpeg, .png, .gif, and .webp files are allowed.'), false);
      }
      
      // Additional validation: ensure filename doesn't suggest it's a document
      const filename = file.originalname.toLowerCase();
      if (filename.includes('doc') || filename.includes('pdf') || filename.includes('sheet') || filename.includes('presentation')) {
        return cb(new Error('This appears to be a document file. Please upload a face photo for your digital twin.'), false);
      }
    } else if (file.fieldname === 'voice_sample') {
      // Validation for voice samples
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav', 'audio/webm', 'audio/ogg'];
      const allowedExtensions = ['.mp3', '.wav', '.webm', '.ogg'];
      
      const ext = path.extname(file.originalname).toLowerCase();
      
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Invalid audio file type. Only MP3, WAV, WebM, and OGG audio files are allowed for voice samples.'), false);
      }
      
      if (!allowedExtensions.includes(ext)) {
        return cb(new Error('Invalid audio file extension. Only .mp3, .wav, .webm, and .ogg files are allowed.'), false);
      }
    } else {
      return cb(new Error('Unknown field name for file upload.'), false);
    }
    
    cb(null, true);
  }
});

/**
 * @swagger
 * /api/digital-twin:
 *   get:
 *     summary: Get user's digital twins
 *     tags:
 *       - DigitalTwin
 */
router.get("/", async ({ state, response }) => {
  const twins = await DigitalTwin.findAll({
    where: { user_id: state.user.id, status: 'active' },
    order: [['is_default', 'DESC'], ['created_at', 'DESC']]
  });
  return response.success(twins);
});

/**
 * @swagger
 * /api/digital-twin/:id:
 *   get:
 *     summary: Get a specific digital twin
 *     tags:
 *       - DigitalTwin
 */
router.get("/:id", async ({ state, params, response }) => {
  const twin = await DigitalTwin.findOne({
    where: { id: params.id, user_id: state.user.id }
  });
  if (!twin) {
    return response.fail(null, 'Twin not found', 404);
  }
  return response.success(twin);
});

/**
 * @swagger
 * /api/digital-twin:
 *   post:
 *     summary: Create a new digital twin
 *     tags:
 *       - DigitalTwin
 */
router.post(
  "/",
  async (ctx, next) => {
    try {
      return await next()
    } catch (err) {
      console.error('[DigitalTwin API] Upload parse failed:', err)
      return ctx.response.fail(null, err?.message || 'Upload failed', 400)
    }
  },
  upload.fields([
  { name: 'face_image', maxCount: 1 },
  { name: 'voice_sample', maxCount: 1 }
  ]),
  async (ctx) => {
  try {
    const { state, request, response } = ctx;
    const files = request.files || {};
    const face_image = files['face_image']?.[0];
    const voice_sample = files['voice_sample']?.[0];
    
    const { name, description, traits, model_type } = request.body || {};
    
    if (!face_image) {
      return response.fail(null, 'Face image is required', 400);
    }
    
    if (!name) {
      return response.fail(null, 'Name is required', 400);
    }

    const service = new DigitalTwinService();
    const twin = await service.createTwin({
      user_id: state.user.id,
      name,
      face_image_path: face_image.path,
      traits: traits ? JSON.parse(traits) : {},
      model_type: model_type || 'longcat'
    });

    // Handle voice sample if provided
    if (voice_sample) {
      await twin.update({
        voice_sample_path: voice_sample.path,
        voice_cloned: true
      });
    }

    // Set as default if it's the user's first twin
    const twinCount = await DigitalTwin.count({ where: { user_id: state.user.id, status: 'active' } });
    if (twinCount === 1) {
      await twin.update({ is_default: true });
    }

    return response.success(twin);
  } catch (error) {
    console.error('[DigitalTwin API] Create failed:', error);
    return response.fail(null, error.message || 'Failed to create twin', 500);
  }
  }
);

/**
 * @swagger
 * /api/digital-twin/:id:
 *   put:
 *     summary: Update a digital twin
 *     tags:
 *       - DigitalTwin
 */
router.put("/:id", async ({ state, params, request, response }) => {
  const twin = await DigitalTwin.findOne({
    where: { id: params.id, user_id: state.user.id }
  });
  
  if (!twin) {
    return response.fail('Twin not found', 404);
  }

  const { name, description, traits, default_background, default_style } = request.body;
  
  await twin.update({
    name: name || twin.name,
    description: description !== undefined ? description : twin.description,
    traits: traits || twin.traits,
    default_background: default_background || twin.default_background,
    default_style: default_style || twin.default_style
  });

  return response.success(twin);
});

/**
 * @swagger
 * /api/digital-twin/:id:
 *   delete:
 *     summary: Delete a digital twin (soft delete)
 *     tags:
 *       - DigitalTwin
 */
router.delete("/:id", async ({ state, params, response }) => {
  const twin = await DigitalTwin.findOne({
    where: { id: params.id, user_id: state.user.id }
  });
  
  if (!twin) {
    return response.fail('Twin not found', 404);
  }

  await twin.update({ status: 'archived' });
  return response.success({ message: 'Twin deleted successfully' });
});

/**
 * @swagger
 * /api/digital-twin/:id/set-default:
 *   post:
 *     summary: Set a twin as the default
 *     tags:
 *       - DigitalTwin
 */
router.post("/:id/set-default", async ({ state, params, response }) => {
  const service = new DigitalTwinService();
  await service.setDefaultTwin(params.id, state.user.id);
  return response.success({ message: 'Default twin updated' });
});

/**
 * @swagger
 * /api/digital-twin/:id/generate-video:
 *   post:
 *     summary: Generate a talking head video from a twin
 *     tags:
 *       - DigitalTwin
 */
router.post("/:id/generate-video", async ({ state, params, request, response }) => {
  try {
    const { script, background, conversation_id } = request.body;
    
    if (!script) {
      return response.fail('Script is required', 400);
    }

    const twin = await DigitalTwin.findOne({
      where: { id: params.id, user_id: state.user.id, status: 'active' }
    });
    
    if (!twin) {
      return response.fail('Twin not found', 404);
    }

    // Create output directory
    const outputDir = path.join(process.cwd(), 'workspace', `user_${state.user.id}`, 'twin_videos');
    await fs.mkdir(outputDir, { recursive: true });

    const service = new DigitalTwinService();
    const result = await service.generateVideo({
      twin_id: twin.id,
      script,
      user_id: state.user.id,
      conversation_id: conversation_id || null,
      background,
      output_dir: outputDir
    });

    return response.success(result);
  } catch (error) {
    console.error('[DigitalTwin API] Generate video failed:', error);
    const errorMessage = error.response ? error.response.data : (error.message || 'Failed to generate video');
    return response.fail(errorMessage, 500);
  }
});

/**
 * @swagger
 * /api/digital-twin/:id/videos:
 *   get:
 *     summary: Get videos generated by a twin
 *     tags:
 *       - DigitalTwin
 */
router.get("/:id/videos", async ({ state, params, response }) => {
  const videos = await TwinVideo.findAll({
    where: { twin_id: params.id, user_id: state.user.id },
    order: [['created_at', 'DESC']],
    limit: 50
  });
  return response.success(videos);
});

/**
 * @swagger
 * /api/digital-twin/default:
 *   get:
 *     summary: Get user's default twin
 *     tags:
 *       - DigitalTwin
 */
router.get("/default", async ({ state, response }) => {
  const twin = await DigitalTwin.findOne({
    where: { user_id: state.user.id, is_default: true, status: 'active' }
  });
  return response.success(twin);
});

module.exports = router;
