require('dotenv').config();
require("module-alias/register");

const DefaultModelSetting = require('./src/models/DefaultModelSetting');
const Model = require('./src/models/Model');
const Platform = require('./src/models/Platform');

async function setDefaultModel() {
  try {
    console.log('🔧 Setting default model to GPT-4o...');
    
    // 1. Find OpenAI platform
    const openaiPlatform = await Platform.findOne({ where: { name: 'OpenAI' } });
    if (!openaiPlatform) {
      console.error('❌ OpenAI platform not found in database!');
      console.log('Available platforms:');
      const platforms = await Platform.findAll();
      platforms.forEach(p => console.log(`  - ${p.name} (ID: ${p.id})`));
      process.exit(1);
    }
    
    console.log(`✅ Found OpenAI platform (ID: ${openaiPlatform.id})`);
    
    // 2. Find GPT-4o model
    let gpt4Model = await Model.findOne({ 
      where: { 
        platform_id: openaiPlatform.id,
        model_id: 'gpt-4o'
      } 
    });
    
    if (!gpt4Model) {
      console.log('⚠️  GPT-4o not found, trying gpt-4o-mini...');
      gpt4Model = await Model.findOne({ 
        where: { 
          platform_id: openaiPlatform.id,
          model_id: 'gpt-4o-mini'
        } 
      });
    }
    
    if (!gpt4Model) {
      console.error('❌ No GPT-4 models found!');
      console.log('Available OpenAI models:');
      const models = await Model.findAll({ where: { platform_id: openaiPlatform.id } });
      models.forEach(m => console.log(`  - ${m.model_id} (ID: ${m.id})`));
      process.exit(1);
    }
    
    console.log(`✅ Found model: ${gpt4Model.model_id} (ID: ${gpt4Model.id})`);
    
    // 3. Set or update default model setting
    const [setting, created] = await DefaultModelSetting.findOrCreate({
      where: { setting_type: 'assistant' },
      defaults: {
        setting_type: 'assistant',
        model_id: gpt4Model.id,
        config: '{}'
      }
    });
    
    if (!created) {
      setting.model_id = gpt4Model.id;
      await setting.save();
      console.log('✅ Updated existing default model setting');
    } else {
      console.log('✅ Created new default model setting');
    }
    
    // 4. Verify
    const verify = await DefaultModelSetting.findOne({ where: { setting_type: 'assistant' } });
    console.log(`✅ Default model set to: ${gpt4Model.model_id}`);
    console.log(`   Model ID: ${verify.model_id}`);
    
    console.log('🎉 Default model configuration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setDefaultModel();
