require('dotenv').config();
require("module-alias/register");

const DefaultModelSetting = require('./src/models/DefaultModelSetting');
const Model = require('./src/models/Model');
const Conversation = require('./src/models/Conversation');

async function fixDatabase() {
  try {
    console.log('🔧 Starting database fixes...');
    
    // 1. Get first OpenAI model (GPT-4o-mini is most common)
    let firstModel = await Model.findOne({ where: { model_name: 'GPT-4o-mini' } });
    if (!firstModel) {
      // Fallback to any OpenAI model
      const Platform = require('./src/models/Platform');
      const openaiPlatform = await Platform.findOne({ where: { name: 'OpenAI' } });
      if (openaiPlatform) {
        firstModel = await Model.findOne({ where: { platform_id: openaiPlatform.id } });
      }
    }
    if (!firstModel) {
      // Ultimate fallback - any model
      firstModel = await Model.findOne();
    }
    if (!firstModel) {
      console.error('❌ No models found!');
      return;
    }
    
    console.log(`✅ Found model: ${firstModel.model_name} (ID: ${firstModel.id})`);
    
    // 2. Set default model if not exists
    const defaultSetting = await DefaultModelSetting.findOne({ where: { setting_type: 'assistant' } });
    if (!defaultSetting) {
      await DefaultModelSetting.create({
        setting_type: 'assistant',
        model_id: firstModel.id,
        config: '{}'
      });
      console.log('✅ Created default model setting');
    } else if (!defaultSetting.model_id) {
      defaultSetting.model_id = firstModel.id;
      await defaultSetting.save();
      console.log('✅ Updated default model setting');
    } else {
      console.log('✅ Default model already set');
    }
    
    // 3. Update all conversations with null model_id
    const result = await Conversation.update(
      { model_id: firstModel.id },
      { where: { model_id: null } }
    );
    console.log(`✅ Updated ${result[0]} conversations with null model_id`);
    
    // 4. Verify
    const nullCount = await Conversation.count({ where: { model_id: null } });
    console.log(`✅ Remaining conversations with null model_id: ${nullCount}`);
    
    console.log('🎉 Database fixes complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixDatabase();
