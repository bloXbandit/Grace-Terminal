/**
 * Text to Image 工具类
 * 使用 Google Gemini 2.5 Flash Image Preview API 实现文生图功能
 */

const axios = require('axios');
const { getDefaultModel } = require('@src/utils/default_model');
const createLLMInstance = require("@src/completion/llm.one.js");

class TextToImageService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = 'gemini-2.5-flash-image';
        this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';
        this.initialized = false;
    }


    /**
     * 初始化检查
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY is required');
        }

        this.initialized = true;
        console.log(`✅ Gemini ${this.model} API initialized successfully`);
    }

    /**
     * 发送 HTTP 请求到 Gemini API
     * @param {Object} requestBody - 请求体
     * @returns {Promise<Object>} API 响应
     */
    async makeApiRequest(requestBody) {
        try {
            console.log(`🌐 Making API request to: ${this.apiUrl}`);
            console.log(`📝 Request body:`, JSON.stringify(requestBody, null, 2));
            
            const response = await axios.post(this.apiUrl, requestBody, {
                headers: {
                    'x-goog-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 300000 
            });

            console.log(`✅ Received response with status: ${response.status}`);
            return response.data;

        } catch (error) {
            console.error(`❌ API request failed:`, error.message);
            
            if (error.response) {
                // API 返回了错误状态码
                console.error(`Response status: ${error.response.status}`);
                console.error(`Response data:`, error.response.data);
                const errorMessage = error.response.data?.error?.message || error.response.statusText;
                throw new Error(`API Error ${error.response.status}: ${errorMessage}`);
            } else if (error.request) {
                // 请求发送但没有收到响应
                console.error(`Request code:`, error.code);
                
                // 检查是否是网络连接问题
                if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                    throw new Error(`Network connection failed: Unable to reach API endpoint`);
                } else if (error.code === 'ECONNABORTED') {
                    throw new Error('Request timeout - API took too long to respond');
                } else {
                    throw new Error(`Request failed: No response received (${error.code || 'Unknown error'})`);
                }
            } else {
                // 其他错误
                throw new Error(`Request setup failed: ${error.message}`);
            }
        }
    }

    /**
     * 生成图片
     * @param {string} prompt - 图片描述提示词
     * @param {Object} options - 生成选项
     * @returns {Promise<Object>} 生成结果
     */
    async generateImage(prompt, options = {}) {
        await this.initialize();

        if (!prompt || typeof prompt !== 'string') {
            throw new Error('Prompt must be a non-empty string');
        }

        const {
            style = '',
            aspectRatio = '1:1',
            quality = 'standard',
            size = 'medium',
            enhancePrompt = true
        } = options;

        try {
            // 构建完整的提示词
            let fullPrompt = this.buildFullPrompt(prompt, {
                style,
                aspectRatio,
                quality,
                size,
                enhancePrompt
            });

            console.log(`🎨 Generating image with prompt: "${fullPrompt.substring(0, 100)}..."`);

            // 构建 API 请求体
            const requestBody = {
                contents: [
                    {
                        parts: [
                            {
                                text: fullPrompt
                            }
                        ]
                    }
                ]
            };

            // 调用 Gemini API 生成图片
            const apiResponse = await this.makeApiRequest(requestBody);

            // 验证响应格式
            if (!apiResponse || !apiResponse.candidates || !apiResponse.candidates[0]) {
                throw new Error('Invalid response from Gemini API');
            }

            const candidate = apiResponse.candidates[0];
            if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
                throw new Error('No content in API response');
            }

            // 寻找包含图片数据的part
            let imagePart = null;
            for (const part of candidate.content.parts) {
                if (part.inlineData || part.inline_data) {
                    imagePart = part;
                    break;
                }
            }

            if (!imagePart) {
                throw new Error('No image data found in API response');
            }

            // 获取图片数据，支持两种格式
            const imageData = imagePart.inlineData || imagePart.inline_data;
            if (!imageData || !imageData.data) {
                throw new Error('No image data in API response');
            }

            // 处理响应并提取图片信息
            const parsedImageData = this.parseImageResponse(imageData);

            console.log(`✅ Image generated successfully`);
            
            return {
                success: true,
                data: {
                    imageUrl: parsedImageData.url,
                    prompt: fullPrompt,
                    originalPrompt: prompt,
                    metadata: {
                        model: this.model,
                        style,
                        aspectRatio,
                        quality,
                        size,
                        mimeType: parsedImageData.mimeType,
                        generatedAt: new Date().toISOString()
                    },
                    rawResponse: imageData
                }
            };

        } catch (error) {
            console.error(`❌ Failed to generate image:`, error.message);
            throw new Error(`Image generation failed: ${error.message}`);
        }
    }

    /**
     * 构建完整的提示词
     * @param {string} prompt - 原始提示词
     * @param {Object} options - 选项
     * @returns {string} 完整提示词
     */
    buildFullPrompt(prompt, options) {
        const {
            style = '',
            aspectRatio = '1:1',
            quality = 'standard',
            size = 'medium',
            enhancePrompt = true
        } = options;

        let fullPrompt = prompt;

        if (enhancePrompt) {
            // 添加质量和风格指导
            const qualityInstructions = {
                'high': 'high quality, ultra detailed, masterpiece, 8k resolution',
                'standard': 'good quality, detailed',
                'draft': 'quick sketch, concept art'
            };

            const sizeInstructions = {
                'large': 'large format, poster size',
                'medium': 'medium size',
                'small': 'thumbnail size, icon style'
            };

            fullPrompt = `Create an image: ${prompt}`;
            
            if (style) {
                fullPrompt += `, in ${style} style`;
            }
            
            if (aspectRatio && aspectRatio !== '1:1') {
                fullPrompt += `, aspect ratio ${aspectRatio}`;
            }
            
            if (qualityInstructions[quality]) {
                fullPrompt += `, ${qualityInstructions[quality]}`;
            }
            
            if (sizeInstructions[size]) {
                fullPrompt += `, ${sizeInstructions[size]}`;
            }

            // 添加通用的质量提升指令
            fullPrompt += '. Please generate a high-quality, visually appealing image that accurately represents the description.';
        }

        return fullPrompt;
    }

    /**
     * 解析图片响应
     * @param {Object} imageData - API 响应中的图片数据
     * @returns {Object} 解析后的图片数据
     */
    parseImageResponse(imageData) {
        try {
            // 获取base64图片数据和MIME类型
            const imageBase64 = imageData.data;
            const mimeType = imageData.mimeType || imageData.mime_type || 'image/png';
            
            if (!imageBase64) {
                throw new Error('No base64 image data found');
            }

            // 构建data URL格式
            const dataUrl = `data:${mimeType};base64,${imageBase64}`;
            
            return {
                url: dataUrl,
                type: 'base64',
                mimeType: mimeType,
                format: mimeType.split('/')[1],
                base64Data: imageBase64
            };

        } catch (error) {
            console.error('❌ Failed to parse image response:', error.message);
            throw new Error(`Failed to parse image response: ${error.message}`);
        }
    }

    /**
     * 批量生成图片
     * @param {Array<string>} prompts - 提示词数组
     * @param {Object} options - 生成选项
     * @returns {Promise<Array>} 生成结果数组
     */
    async generateMultipleImages(prompts, options = {}) {
        if (!Array.isArray(prompts) || prompts.length === 0) {
            throw new Error('Prompts must be a non-empty array');
        }

        const { concurrent = 3, delay = 1000 } = options;
        const results = [];

        // 分批处理，避免过多并发请求
        for (let i = 0; i < prompts.length; i += concurrent) {
            const batch = prompts.slice(i, i + concurrent);
            
            const batchPromises = batch.map(async (prompt, index) => {
                try {
                    await new Promise(resolve => setTimeout(resolve, index * (delay / concurrent)));
                    return await this.generateImage(prompt, options);
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        prompt: prompt
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // 批次间延迟
            if (i + concurrent < prompts.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return results;
    }

    /**
     * 调用大模型生成文本（专用于角色画像描述）
     * @param {string} prompt - 提示词
     * @param {string} conversationId - 会话ID
     * @param {Object} options - 调用选项
     * @returns {Promise<string>} 生成的文本
     */
    async callLLMForPortrait(prompt, conversationId, options = {}) {
        const {
            temperature = 0.7,
            max_tokens = 1000,
            messages = []
        } = options;

        try {
            // 获取默认模型信息
            let model_info = await getDefaultModel(conversationId);
            
            // CRITICAL: Fallback if no model found
            if (!model_info) {
                console.warn('[text_to_image] No default model found, using fallback');
                model_info = {
                    model_name: 'anthropic/claude-sonnet-4.5',
                    platform_name: 'OpenRouter',
                    api_key: process.env.OPENROUTER_API_KEY || '',
                    api_url: 'https://openrouter.ai/api/v1/chat/completions',
                    base_url: 'https://openrouter.ai/api/v1',
                    is_subscribe: false
                };
            }
            
            const model = `provider#${model_info.platform_name}#${model_info.model_name}`;
            
            console.log(`🤖 Using model: ${model_info.platform_name}#${model_info.model_name}`);

            // 创建LLM实例
            const llm = await createLLMInstance(model, () => {}, { model_info });
            
            // 设置模型参数
            const llmOptions = { temperature };
            
            // 判断模型并设置最大token数
            if (model_info.model_name === 'deepseek-v3-250324') {
                llmOptions.max_tokens = Math.min(max_tokens, 16000);
            } else if (model_info.model_name === 'deepseek-v3-1-250821') {
                llmOptions.max_tokens = Math.min(max_tokens, 32000);
            } else {
                llmOptions.max_tokens = max_tokens;
            }

            const context = { messages };

            // 对qwen3模型添加no_think前缀
            let finalPrompt = prompt;
            if (model_info.model_name.indexOf('qwen3') > -1) {
                finalPrompt = '/no_think' + prompt;
            }

            // 调用模型完成接口
            const content = await llm.completion(finalPrompt, context, llmOptions);

            if (!content || typeof content !== 'string') {
                throw new Error('Invalid response from LLM');
            }

            // 处理错误响应
            if (content && typeof content === 'string' && content.startsWith('ERR_BAD_REQUEST')) {
                throw new Error('LLM request failed: Bad request');
            }

            return content.trim();

        } catch (error) {
            console.error(`❌ LLM call failed:`, error.message);
            throw new Error(`LLM call failed: ${error.message}`);
        }
    }

    /**
     * 使用LLM生成角色画像描述（专用函数）
     * @param {string} agentName - Agent 名称
     * @param {string} agentDescription - Agent 简介/描述
     * @param {string} conversationId - 会话ID
     * @param {Object} options - 生成选项
     * @returns {Promise<string>} 生成的角色画像描述
     */
    async generateCharacterPortraitDescription(agentName, agentDescription, conversationId, options = {}) {
        if (!agentName || typeof agentName !== 'string') {
            throw new Error('Agent name must be a non-empty string');
        }

        if (!agentDescription || typeof agentDescription !== 'string') {
            throw new Error('Agent description must be a non-empty string');
        }

        const {
            portraitType = 'realistic',
            composition = 'full-body',
            mood = 'professional',
            temperature = 0.7
        } = options;

        try {
            // 构建专门用于角色画像生成的提示词
            const llmPrompt = this.buildCharacterDescriptionPrompt(agentName, agentDescription, {
                portraitType,
                composition,
                mood
            });

            console.log(`🤖 Generating character description for agent: "${agentName}" using LLM`);

            // 调用专用的LLM方法
            const characterDescription = await this.callLLMForPortrait(llmPrompt, conversationId, {
                temperature,
                max_tokens: 1000,
                messages: []
            });

            console.log(`✅ Character description generated successfully for: ${agentName}`);
            return characterDescription;

        } catch (error) {
            console.error(`❌ Failed to generate character description for agent ${agentName}:`, error.message);
            throw new Error(`Character description generation failed: ${error.message}`);
        }
    }

    /**
     * 构建角色画像描述的专用提示词
     * @param {string} agentName - Agent 名称
     * @param {string} agentDescription - Agent 描述
     * @param {Object} options - 选项
     * @returns {string} 完整的LLM提示词
     */
    buildCharacterDescriptionPrompt(agentName, agentDescription, options = {}) {
        const {
            portraitType = 'realistic',
            composition = 'full-body',
            mood = 'professional'
        } = options;

        return `You are an expert character designer and visual artist. Based on the following Agent information, create a detailed character portrait description for AI image generation.

Agent Name: ${agentName}
Agent Description: ${agentDescription}

Please generate a comprehensive character visual description that includes:

1. **Physical Features**: 
   - Age range and gender
   - Body type and build
   - Hairstyle and hair color
   - Facial features and expressions
   - Any distinctive physical characteristics

2. **Clothing & Style**:
   - Professional attire appropriate for their role
   - Color scheme and style preferences
   - Accessories or tools that reflect their profession
   - Overall fashion sense

3. **Posture & Expression**:
   - Body language that reflects their personality
   - Facial expression conveying their character traits
   - Hand gestures or stance
   - Overall demeanor and presence

4. **Professional Context**:
   - Environment or background elements
   - Tools or objects associated with their role
   - Professional setting details

**Style Requirements**:
- Art style: ${portraitType}
- Composition: ${composition}
- Overall mood: ${mood}

**Output Requirements**:
- Write the description in clear, detailed English
- Make it suitable for AI image generation
- Focus on visual elements that can be rendered
- Ensure the description is professional and appropriate for business use
- Length: 150-300 words

Please provide only the character description without any additional commentary or explanations.`;
    }

    /**
     * 生成 Agent 角色画像图片
     * @param {string} agentName - Agent 名称
     * @param {string} agentDescription - Agent 简介/描述
     * @param {string} conversationId - 会话ID
     * @param {Object} options - 生成选项
     * @returns {Promise<Object>} 生成结果
     */
    async generateAgentPortrait(agentName, agentDescription, conversationId, options = {}) {
        await this.initialize();

        if (!agentName || typeof agentName !== 'string') {
            throw new Error('Agent name must be a non-empty string');
        }

        if (!agentDescription || typeof agentDescription !== 'string') {
            throw new Error('Agent description must be a non-empty string');
        }

        const {
            portraitType = 'realistic',
            composition = 'full-body',  // full-body, half-body, portrait
            background = 'environment',
            mood = 'professional',
            customStyle = '',
            aspectRatio = '3:4',  // 角色画像通常使用竖版比例
            useLLMDescription = true  // 是否使用LLM生成角色描述
        } = options;

        try {
            let portraitPrompt;
            
            if (useLLMDescription) {
                console.log(`🎭 Generating character portrait for agent: "${agentName}" using LLM-generated description`);
                
                // 首先使用LLM生成详细的角色画像描述
                const characterDescription = await this.generateCharacterPortraitDescription(
                    agentName, 
                    agentDescription, 
                    conversationId,
                    { portraitType, composition, mood }
                );
                
                // 基于LLM生成的描述构建图像生成提示词
                portraitPrompt = this.buildLLMBasedPortraitPrompt(characterDescription, {
                    portraitType,
                    composition,
                    background,
                    customStyle
                });
                
                console.log(`📝 Using LLM-generated character description for image generation`);
            } else {
                // 使用原有的方式构建提示词
                portraitPrompt = this.buildAgentPortraitPrompt(agentName, agentDescription, {
                    portraitType,
                    composition,
                    background,
                    mood,
                    customStyle
                });
                
                console.log(`🎭 Generating character portrait for agent: "${agentName}" using rule-based description`);
            }

            // 使用专门的角色画像生成配置
            const portraitOptions = {
                ...options,
                aspectRatio,
                quality: 'high',
                size: 'medium',
                enhancePrompt: false  // 使用我们自定义的提示词
            };

            const result = await this.generateImage(portraitPrompt, portraitOptions);

            if (result.success) {
                // 为 Agent 角色画像添加专门的元数据
                result.data.agentInfo = {
                    name: agentName,
                    description: agentDescription,
                    portraitType,
                    composition,
                    background,
                    mood,
                    usedLLMDescription: useLLMDescription
                };
                result.data.metadata.type = 'agent_portrait';
                result.data.metadata.isPortrait = true;
            }

            console.log(`✅ Agent character portrait generated successfully for: ${agentName}`);
            return result;

        } catch (error) {
            console.error(`❌ Failed to generate character portrait for agent ${agentName}:`, error.message);
            throw new Error(`Agent portrait generation failed: ${error.message}`);
        }
    }

    /**
     * 基于LLM生成的描述构建图像生成提示词
     * @param {string} characterDescription - LLM生成的角色描述
     * @param {Object} options - 选项
     * @returns {string} 完整的图像生成提示词
     */
    buildLLMBasedPortraitPrompt(characterDescription, options = {}) {
        const {
            portraitType = 'realistic',
            composition = 'full-body',
            background = 'environment',
            customStyle = ''
        } = options;

        // 基于LLM生成的角色描述构建图像生成提示词
        let prompt = `Create a detailed ${composition} character portrait based on the following description: ${characterDescription}`;

        // 添加样式指导
        const styleGuides = {
            'realistic': 'photorealistic, detailed character design, natural lighting and shadows',
            'cartoon': 'cartoon illustration style, friendly and expressive, vibrant colors',
            'anime': 'anime/manga character design, expressive features, dynamic styling',
            'minimalist': 'clean, simple character design, minimal but impactful details',
            'corporate': 'professional business illustration, clean and trustworthy appearance',
            'creative': 'artistic character design, unique visual elements, creative flair',
            'tech': 'futuristic character design, digital/sci-fi elements, modern aesthetic',
            'fantasy': 'fantasy character design, magical or mystical elements'
        };

        if (styleGuides[portraitType]) {
            prompt += ` Art style: ${styleGuides[portraitType]}.`;
        }

        // 添加背景设置
        const backgroundGuides = {
            'environment': 'contextual background that matches the character role and profession',
            'office': 'modern professional office environment with relevant work elements',
            'tech': 'high-tech digital environment with screens, code, futuristic elements',
            'creative': 'artistic studio or creative workspace with design elements',
            'minimal': 'clean, minimal background that highlights the character',
            'abstract': 'abstract background with colors and shapes that complement the character',
            'nature': 'natural outdoor environment, peaceful and inspiring setting'
        };

        if (backgroundGuides[background]) {
            prompt += ` Background: ${backgroundGuides[background]}.`;
        }

        // 添加自定义样式
        if (customStyle) {
            prompt += ` Additional style elements: ${customStyle}.`;
        }

        // 添加质量要求
        prompt += ' High-quality character illustration, well-composed, visually appealing, suitable for representing an AI agent character. Ensure the character appears professional, appropriate, and suitable for business use.';

        return prompt;
    }

    /**
     * 构建 Agent 角色画像专用提示词（原有方法，作为备选）
     * @param {string} agentName - Agent 名称
     * @param {string} agentDescription - Agent 描述
     * @param {Object} options - 选项
     * @returns {string} 完整的角色画像提示词
     */
    buildAgentPortraitPrompt(agentName, agentDescription, options) {
        const {
            portraitType = 'realistic',
            composition = 'full-body',
            background = 'environment',
            mood = 'professional',
            customStyle = ''
        } = options;

        // 分析 Agent 描述中的关键特征
        const characteristics = this.extractAgentCharacteristics(agentDescription);
        
        // 构建基础提示词 - 强调使用英文描述
        let prompt = `Create a detailed ${composition} character portrait of an AI agent. Please interpret and describe everything in English only.`;
        
        // 添加角色描述，要求AI用英文理解和描述
        prompt += ` The agent's role and description should be interpreted as: ${agentDescription}. Please create a character that visually represents this role using English interpretation.`;
        
        // 根据构图类型添加特定指导
        const compositionGuides = {
            'full-body': 'full body shot, showing complete character from head to toe, dynamic pose',
            'half-body': 'half body portrait, from waist up, engaging pose and gesture',
            'portrait': 'head and shoulders portrait, focused on facial expression and character',
            'action': 'character in action, showing personality through dynamic movement'
        };

        if (compositionGuides[composition]) {
            prompt += ` Composition: ${compositionGuides[composition]}.`;
        }
        
        // 根据描述添加视觉特征和职业相关元素
        if (characteristics.profession) {
            const professionVisuals = {
                'developer': 'working with code, modern tech setup, coding environment',
                'designer': 'creative workspace, design tools, artistic elements',
                'analyst': 'data visualization, charts and graphs, analytical tools',
                'consultant': 'professional office setting, business attire, confident posture',
                'teacher': 'educational environment, teaching materials, approachable demeanor',
                'assistant': 'helpful gesture, organized workspace, ready to assist pose',
                'writer': 'writing desk, books, thoughtful expression'
            };
            
            if (professionVisuals[characteristics.profession]) {
                prompt += ` Professional context: ${professionVisuals[characteristics.profession]}.`;
            }
        }
        
        if (characteristics.personality) {
            prompt += ` Character personality should be visually represented as: ${characteristics.personality}.`;
        }
        
        // 添加样式指导
        const styleGuides = {
            'realistic': 'photorealistic, detailed character design, natural lighting and shadows',
            'cartoon': 'cartoon illustration style, friendly and expressive, vibrant colors',
            'anime': 'anime/manga character design, expressive features, dynamic styling',
            'minimalist': 'clean, simple character design, minimal but impactful details',
            'corporate': 'professional business illustration, clean and trustworthy appearance',
            'creative': 'artistic character design, unique visual elements, creative flair',
            'tech': 'futuristic character design, digital/sci-fi elements, modern aesthetic',
            'fantasy': 'fantasy character design, magical or mystical elements'
        };

        if (styleGuides[portraitType]) {
            prompt += ` Art style: ${styleGuides[portraitType]}.`;
        }

        // 添加背景设置
        const backgroundGuides = {
            'environment': 'contextual background that matches the character role and profession',
            'office': 'modern professional office environment with relevant work elements',
            'tech': 'high-tech digital environment with screens, code, futuristic elements',
            'creative': 'artistic studio or creative workspace with design elements',
            'minimal': 'clean, minimal background that highlights the character',
            'abstract': 'abstract background with colors and shapes that complement the character',
            'nature': 'natural outdoor environment, peaceful and inspiring setting'
        };

        if (backgroundGuides[background]) {
            prompt += ` Background: ${backgroundGuides[background]}.`;
        }

        // 添加情绪和姿态
        const moodGuides = {
            'professional': 'confident, competent posture, professional demeanor',
            'friendly': 'warm, approachable expression, welcoming body language',
            'creative': 'inspired, innovative gesture, artistic flair in pose',
            'helpful': 'supportive, ready-to-assist posture, kind expression',
            'confident': 'strong, self-assured stance, leadership presence',
            'calm': 'peaceful, composed demeanor, balanced and centered pose',
            'energetic': 'dynamic, enthusiastic posture, vibrant energy'
        };

        if (moodGuides[mood]) {
            prompt += ` Character mood and posture: ${moodGuides[mood]}.`;
        }

        // 添加自定义样式
        if (customStyle) {
            prompt += ` Additional character details: ${customStyle}.`;
        }

        // 添加质量和技术要求
        prompt += ' High-quality character illustration, well-composed, visually appealing, suitable for representing an AI agent character.';
        
        // 避免不适合的内容并强调语言要求
        prompt += ' Ensure the character appears professional, appropriate, and suitable for business use. IMPORTANT: Generate and describe everything in English language only, interpret any non-English input and create English-based visual representation.';

        return prompt;
    }

    /**
     * 从 Agent 描述中提取关键特征
     * @param {string} description - Agent 描述
     * @returns {Object} 提取的特征
     */
    extractAgentCharacteristics(description) {
        const characteristics = {
            profession: null,
            personality: '',
            skills: [],
            domain: null
        };

        const lowerDesc = description.toLowerCase();

        // 职业相关关键词
        const professionKeywords = {
            'developer': ['developer', 'programmer', 'coder', 'engineer'],
            'designer': ['designer', 'creative', 'artist', 'visual'],
            'analyst': ['analyst', 'data', 'research', 'analysis'],
            'consultant': ['consultant', 'advisor', 'expert', 'specialist'],
            'manager': ['manager', 'leader', 'director', 'coordinator'],
            'teacher': ['teacher', 'educator', 'instructor', 'tutor'],
            'assistant': ['assistant', 'helper', 'support', 'aide'],
            'writer': ['writer', 'author', 'content', 'copywriter']
        };

        // 性格特征关键词
        const personalityKeywords = {
            'helpful': ['helpful', 'supportive', 'assistance', 'aid'],
            'creative': ['creative', 'innovative', 'imaginative', 'artistic'],
            'analytical': ['analytical', 'logical', 'systematic', 'methodical'],
            'friendly': ['friendly', 'warm', 'approachable', 'welcoming'],
            'professional': ['professional', 'business', 'formal', 'corporate'],
            'experienced': ['experienced', 'expert', 'veteran', 'seasoned'],
            'efficient': ['efficient', 'fast', 'quick', 'productive']
        };

        // 检测职业
        for (const [profession, keywords] of Object.entries(professionKeywords)) {
            if (keywords.some(keyword => lowerDesc.includes(keyword))) {
                characteristics.profession = profession;
                break;
            }
        }

        // 检测性格特征
        const personalityTraits = [];
        for (const [trait, keywords] of Object.entries(personalityKeywords)) {
            if (keywords.some(keyword => lowerDesc.includes(keyword))) {
                personalityTraits.push(trait);
            }
        }

        // 组合性格特征为字符串
        if (personalityTraits.length > 0) {
            characteristics.personality = personalityTraits.slice(0, 3).join(', ');
        } else {
            characteristics.personality = 'professional and helpful';
        }

        return characteristics;
    }

    /**
     * 批量生成多个 Agent 的角色画像
     * @param {Array<Object>} agents - Agent 信息数组 [{name, description}, ...]
     * @param {Object} options - 生成选项
     * @returns {Promise<Array>} 生成结果数组
     */
    async generateMultipleAgentPortraits(agents,conversationId, options = {}) {
        if (!Array.isArray(agents) || agents.length === 0) {
            throw new Error('Agents must be a non-empty array');
        }

        const { concurrent = 2, delay = 2000 } = options; // 角色画像生成使用更保守的并发设置
        const results = [];

        console.log(`🎭 Generating character portraits for ${agents.length} agents...`);

        for (let i = 0; i < agents.length; i += concurrent) {
            const batch = agents.slice(i, i + concurrent);
            
            const batchPromises = batch.map(async (agent, index) => {
                try {
                    if (!agent.name || !agent.description) {
                        throw new Error('Agent must have name and description properties');
                    }

                    await new Promise(resolve => setTimeout(resolve, index * (delay / concurrent)));
                    return await this.generateAgentPortrait(agent.name, agent.description,conversationId, options);
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        agentName: agent.name
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // 批次间延迟
            if (i + concurrent < agents.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`✅ Generated ${successCount}/${agents.length} agent character portraits successfully`);

        return results;
    }

    /**
     * 检查服务健康状态
     * @returns {Promise<boolean>} 健康状态
     */
    async checkHealth() {
        try {
            await this.initialize();
            
            // 尝试一个简单的测试请求
            const testRequestBody = {
                contents: [
                    {
                        parts: [
                            {
                                text: 'Generate a simple test image of a red apple'
                            }
                        ]
                    }
                ]
            };
            
            await this.makeApiRequest(testRequestBody);
            return true;
        } catch (error) {
            console.error('❌ Text to Image service health check failed:', error.message);
            return false;
        }
    }

    /**
     * 获取支持的样式列表
     * @returns {Array<string>} 样式列表
     */
    getSupportedStyles() {
        return [
            'realistic',
            'cartoon',
            'anime',
            'oil painting',
            'watercolor',
            'sketch',
            'digital art',
            'pixel art',
            'abstract',
            'minimalist',
            'vintage',
            'modern',
            'fantasy',
            'sci-fi',
            'portrait',
            'landscape'
        ];
    }

    /**
     * 获取支持的尺寸比例
     * @returns {Array<string>} 比例列表
     */
    getSupportedAspectRatios() {
        return [
            '1:1',    // 正方形
            '16:9',   // 宽屏
            '9:16',   // 竖屏
            '4:3',    // 传统
            '3:4',    // 竖版传统
            '21:9',   // 超宽屏
            '3:2',    // 摄影常用
            '2:3'     // 竖版摄影
        ];
    }
}

// 创建单例实例
let textToImageService = null;

/**
 * 获取 Text to Image 服务实例
 * @returns {TextToImageService}
 */
function getTextToImageService() {
    if (!textToImageService) {
        textToImageService = new TextToImageService();
    }
    return textToImageService;
}

module.exports = {
    TextToImageService,
    getTextToImageService
};