require('dotenv').config();
require("module-alias/register");

const DefaultModelSetting = require('./src/models/DefaultModelSetting');
const Model = require('./src/models/Model');
const Platform = require('./src/models/Platform');

async function setDefaultModel() {
  try {
    console.log('🔧 Setting default model to GPT-5 Pro via OpenRouter...');
    
    // 1. Find OpenRouter platform
    const openrouterPlatform = await Platform.findOne({ where: { name: 'OpenRouter' } });
    if (!openrouterPlatform) {
      console.error('❌ OpenRouter platform not found in database!');
      console.log('Available platforms:');
      const platforms = await Platform.findAll();
      platforms.forEach(p => console.log(`  - ${p.name} (ID: ${p.id})`));
      process.exit(1);
    }
    
    console.log(`✅ Found OpenRouter platform (ID: ${openrouterPlatform.id})`);
    
    // 2. Find or create GPT-5 Pro model
    let [gpt5Model, created] = await Model.findOrCreate({ 
      where: { 
        platform_id: openrouterPlatform.id,
        model_id: 'openai/gpt-5-pro'
      },
      defaults: {
        model_id: 'openai/gpt-5-pro',
        model_name: 'GPT-5 Pro',
        group_name: 'OpenAI',
        platform_id: openrouterPlatform.id
      }
    });
    
    if (created) {
      console.log('✅ Created GPT-5 Pro model');
    }
    
    // Fallback to Claude Sonnet 4.5 if GPT-5 Pro doesn't exist
    if (!gpt5Model) {
      console.log('⚠️  GPT-5 Pro not found, trying Claude Sonnet 4.5...');
      [gpt5Model, created] = await Model.findOrCreate({ 
        where: { 
          platform_id: openrouterPlatform.id,
          model_id: 'anthropic/claude-sonnet-4.5'
        },
        defaults: {
          model_id: 'anthropic/claude-sonnet-4.5',
          model_name: 'Claude Sonnet 4.5',
          group_name: 'Anthropic',
          platform_id: openrouterPlatform.id
        }
      });
    }
    
    if (!gpt5Model) {
      console.error('❌ No suitable models found!');
      console.log('Available OpenRouter models:');
      const models = await Model.findAll({ where: { platform_id: openrouterPlatform.id } });
      models.forEach(m => console.log(`  - ${m.model_id} (ID: ${m.id})`));
      process.exit(1);
    }
    
    console.log(`✅ Found model: ${gpt5Model.model_id} (ID: ${gpt5Model.id})`);
    
    // 3. Set or update default model setting
    const [setting, settingCreated] = await DefaultModelSetting.findOrCreate({
      where: { setting_type: 'assistant' },
      defaults: {
        setting_type: 'assistant',
        model_id: gpt5Model.id,
        config: '{}'
      }
    });
    
    if (!settingCreated) {
      setting.model_id = gpt5Model.id;
      await setting.save();
      console.log('✅ Updated existing default model setting');
    } else {
      console.log('✅ Created new default model setting');
    }
    
    // 4. Verify
    const verify = await DefaultModelSetting.findOne({ where: { setting_type: 'assistant' } });
    const verifyModel = await Model.findByPk(verify.model_id);
    const verifyPlatform = await Platform.findByPk(verifyModel.platform_id);
    console.log(`✅ Default model set to: ${verifyModel.model_name} (${verifyModel.model_id})`);
    console.log(`   Platform: ${verifyPlatform.name}`);
    console.log(`   Model DB ID: ${verify.model_id}`);
    
    console.log('🎉 Default model configuration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setDefaultModel();
