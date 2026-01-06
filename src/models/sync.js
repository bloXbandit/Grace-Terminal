require("module-alias/register");
require('dotenv').config();

const sequelize = require('./index.js');
const Conversation = require('./Conversation');
const File = require('./File');
const Platform = require('./Platform');
const Model = require('./Model');
const DefaultModelSettingTable = require('./DefaultModelSetting');
const SearchProviderTable = require('./SearchProvider');
const UserProviderConfigTable = require('./UserProviderConfig');
const UserSearchSettingTable = require('./UserSearchSetting');
const LLMLogs = require('./LLMLogs');
const Task = require('./Task');
const Message = require('./Message');
const McpServer = require('./McpServer');
const Agent = require('./Agent');
const FileVersion = require('./FileVersion');
const Knowledge = require('./Knowledge');
const User = require('./User');
const UserProfile = require('./UserProfile');
const RoutingPreference = require('./RoutingPreference');
const UserMemory = require('./UserMemory');

// Digital Twin Models
const DigitalTwin = require('./DigitalTwin');
const TwinVideo = require('./TwinVideo');

// SEAL Framework Models
const TaskExecution = require('./TaskExecution');
const SelfEdit = require('./SelfEdit');
const PerformanceMetric = require('./PerformanceMetric');
const SkillGap = require('./SkillGap');

const tableSync = async () => {
  await Conversation.sync({ alter: true });
  await File.sync({ alter: true });
  await Platform.sync({ alter: true });
  await Model.sync({ alter: true });
  await DefaultModelSettingTable.sync({ alter: true });
  await SearchProviderTable.sync({ alter: true });
  await UserProviderConfigTable.sync({ alter: true });
  try {
    await sequelize.query('DROP TABLE IF EXISTS `user_search_setting_backup`;');
    await UserSearchSettingTable.sync({ alter: true });
  } catch (e) {
    console.error('[sync:tableSync] UserSearchSetting alter sync failed; falling back to safe sync()', e);
    await UserSearchSettingTable.sync();
  }
  try {
    await sequelize.query('DROP TABLE IF EXISTS `llm_logs_backup`;');
    await LLMLogs.sync({ alter: true });
  } catch (e) {
    console.error('[sync:tableSync] LLMLogs alter sync failed; falling back to safe sync()', e);
    await LLMLogs.sync();
  }
  await Task.sync({ alter: true });
  await Message.sync({ alter: true });
  
  // Add index on conversation_id for faster message queries
  try {
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_message_conversation_id 
      ON messages (conversation_id)
    `);
    console.log('[sync] Created index on messages.conversation_id');
  } catch (e) {
    console.log('[sync] Index on messages.conversation_id may already exist:', e.message);
  }
  
  await McpServer.sync({ alter: true });
  await Agent.sync({ alter: true });
  await FileVersion.sync({ alter: true });
  await Knowledge.sync({ alter: true });
  await User.sync({ alter: true });
  await UserProfile.sync({ alter: true });
  await RoutingPreference.sync({ alter: true });
  await UserMemory.sync({ alter: true });
  
  // SEAL Framework Tables
  await TaskExecution.sync({ alter: true });
  await SelfEdit.sync({ alter: true });
  await PerformanceMetric.sync({ alter: true });
  await SkillGap.sync({ alter: true });
  
  // Digital Twin Tables
  await DigitalTwin.sync({ alter: true });
  await TwinVideo.sync({ alter: true });
}

const dataSync = async () => {
  const count = await Platform.count();
  if (count === 0) {
    let defaultData = [];
    try {
      defaultData = require('../../public/default_data/default_platform.json');
    } catch (e) {
      try {
        defaultData = require('../../workspace/Grace-Terminal/public/default_data/default_platform.json');
      } catch (e2) {
        defaultData = [];
      }
    }
    for (const item of defaultData) {
      // Use ENV API key if JSON has empty key
      let apiKey = item.api_key;
      if (!apiKey || apiKey === '') {
        if (item.name === 'OpenAI') apiKey = process.env.OPENAI_API_KEY || '';
        if (item.name === 'OpenRouter') apiKey = process.env.OPENROUTER_API_KEY || '';
      }
      
      const platformData = {
        name: item.name,
        logo_url: item.logo_url,
        source_type: 'system',
        api_key: apiKey,
        api_url: item.api_url || item.base_url,
        api_version: item.api_version,
        key_obtain_url: item.key_obtain_url,
        is_subscribe: item.is_subscribe || false,
        is_enabled: (typeof item.is_enabled === 'boolean')
          ? item.is_enabled
          : (typeof item.enabled === 'boolean')
            ? item.enabled
            : undefined
      };
      const platform = await Platform.create(platformData);

      if (Array.isArray(item.models) && item.models.length > 0) {
        const modelsData = item.models.map(model => ({
          // @ts-ignore
          platform_id: platform.id,
          logo_url: model.logo_url,
          model_id: model.model_id,
          model_name: model.model_name,
          group_name: model.group_name,
          model_types: model.model_types,
        }));
        await Model.bulkCreate(modelsData);
      }
    }
  }

  const searchProviderCount = await SearchProviderTable.count();
  if (searchProviderCount === 0) {
    let defaultSearchProviderData = [];
    try {
      defaultSearchProviderData = require('../../public/default_data/default_search_provider.json');
    } catch (e) {
      try {
        defaultSearchProviderData = require('../../workspace/Grace-Terminal/public/default_data/default_search_provider.json');
      } catch (e2) {
        defaultSearchProviderData = [];
      }
    }

    if (Array.isArray(defaultSearchProviderData) && defaultSearchProviderData.length > 0) {
      for (const item of defaultSearchProviderData) {
        const searchProviderData = {
          name: item.name,
          logo_url: item.logo_url,
          base_config_schema: item.base_config_schema,
        };
        await SearchProviderTable.create(searchProviderData);
      }
    }
  }

  const userCount = await User.count();
  if (userCount === 0) {
    await User.create({
      id: 1,
      user_salt: 'default123'
    });
  }

  // Initialize Tavily search provider with default API key
  const tavilyProvider = await SearchProviderTable.findOne({ where: { name: 'Tavily' } });
  if (tavilyProvider) {
    const existingConfig = await UserProviderConfigTable.findOne({ 
      where: { provider_id: tavilyProvider.id } 
    });
    
    if (!existingConfig) {
      // Create default Tavily configuration with API key from environment
      await UserProviderConfigTable.create({
        provider_id: tavilyProvider.id,
        base_config: {
          api_key: process.env.TAVILY_API_KEY || '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'
        }
      });

      // Set Tavily as default search provider
      const existingUserSetting = await UserSearchSettingTable.findOne();
      if (!existingUserSetting) {
        await UserSearchSettingTable.create({
          provider_id: tavilyProvider.id
        });
      }
    }
  }
}

const dataUpdate = async () => {
  let defaultData = [];
  try {
    defaultData = require('../../public/default_data/default_platform.json');
  } catch (e) {
    defaultData = [];
  }

  // Add newer OpenAI models (idempotent) without requiring seed JSON
  try {
    const openaiPlatform = await Platform.findOne({ where: { name: 'OpenAI' } });
    if (openaiPlatform) {
      if ((!openaiPlatform.api_key || !String(openaiPlatform.api_key).trim()) && process.env.OPENAI_API_KEY) {
        await Platform.update({ api_key: process.env.OPENAI_API_KEY }, { where: { id: openaiPlatform.id } });
        openaiPlatform.api_key = process.env.OPENAI_API_KEY;
      }

      if (!openaiPlatform.is_enabled && openaiPlatform.api_key && String(openaiPlatform.api_key).trim()) {
        await Platform.update({ is_enabled: true }, { where: { id: openaiPlatform.id } });
      }

      const ensureModel = async ({ model_id, model_name, group_name, model_types }) => {
        const existing = await Model.findOne({ where: { platform_id: openaiPlatform.id, model_id } });
        if (existing) return;
        await Model.create({
          platform_id: openaiPlatform.id,
          model_id,
          model_name,
          group_name,
          model_types,
          logo_url: openaiPlatform.logo_url || null,
        });
      };

      await ensureModel({
        model_id: 'gpt-5.2',
        model_name: 'GPT-5.2',
        group_name: 'GPT 5.2',
        model_types: ['chat']
      });
      await ensureModel({
        model_id: 'gpt-5.2-mini',
        model_name: 'GPT-5.2 Mini',
        group_name: 'GPT 5.2',
        model_types: ['chat']
      });
      await ensureModel({
        model_id: 'sora-2-pro',
        model_name: 'Sora 2 Pro',
        group_name: 'Sora',
        model_types: ['video']
      });
    }

    const openRouterPlatform = await Platform.findOne({ where: { name: 'OpenRouter' } });
    if (openRouterPlatform) {
      if ((!openRouterPlatform.api_key || !String(openRouterPlatform.api_key).trim()) && process.env.OPENROUTER_API_KEY) {
        await Platform.update({ api_key: process.env.OPENROUTER_API_KEY }, { where: { id: openRouterPlatform.id } });
        openRouterPlatform.api_key = process.env.OPENROUTER_API_KEY;
      }

      if (!openRouterPlatform.is_enabled && openRouterPlatform.api_key && String(openRouterPlatform.api_key).trim()) {
        await Platform.update({ is_enabled: true }, { where: { id: openRouterPlatform.id } });
      }
    }
  } catch (e) {
    console.error('[sync:dataUpdate] Failed to ensure OpenAI models', e);
  }

  // v0.1 => v0.1.1
  await Platform.update({
    api_url: 'https://ark.cn-beijing.volces.com/api/v3'
  }, {
    where: {
      name: 'Volcengine'
    }
  })
  const platform = await Platform.findOne({ where: { name: 'Gemini' } })
  if (!platform) {
    const geminiPlatform = defaultData.find(item => item.name === 'Gemini')
    console.log(geminiPlatform)
    const platformData = {
      name: geminiPlatform.name,
      logo_url: geminiPlatform.logo_url,
      source_type: 'system',
      api_key: geminiPlatform.api_key,
      api_url: geminiPlatform.api_url,
      api_version: geminiPlatform.api_version,
      key_obtain_url: geminiPlatform.key_obtain_url,
    };
    const platform = await Platform.create(platformData);
    const modelsData = geminiPlatform.models.map(model => ({
      // @ts-ignore
      platform_id: platform.id,
      logo_url: model.logo_url,
      model_id: model.model_id,
      model_name: model.model_name,
      group_name: model.group_name,
      model_types: model.model_types,
    }));
    await Model.bulkCreate(modelsData);
  }

  // v0.1.1 => v0.1.2
  let defaultSearchProviderData = [];
  try {
    defaultSearchProviderData = require('../../public/default_data/default_search_provider.json');
  } catch (e) {
    try {
      defaultSearchProviderData = require('../../workspace/Grace-Terminal/public/default_data/default_search_provider.json');
    } catch (e2) {
      defaultSearchProviderData = [];
    }
  }

  if (Array.isArray(defaultSearchProviderData) && defaultSearchProviderData.length > 0) {
    const CloudswaySearchProvider = defaultSearchProviderData.find(item => item.name === 'Cloudsway');
    if (CloudswaySearchProvider) {
      const searchProvider = await SearchProviderTable.findOne({ where: { name: CloudswaySearchProvider.name } });
      if (!searchProvider) {
        const searchProviderData = {
          name: CloudswaySearchProvider.name,
          logo_url: CloudswaySearchProvider.logo_url,
          base_config_schema: CloudswaySearchProvider.base_config_schema,
        };
        await SearchProviderTable.create(searchProviderData);
      }
    }
  }

  const cloudswayPlatform = await Platform.findOne({ where: { name: 'Cloudsway' } })
  if (!cloudswayPlatform) {
    const cloudswayPlatform = defaultData.find(item => item.name === 'Cloudsway')
    const platformData = {
      name: cloudswayPlatform.name,
      logo_url: cloudswayPlatform.logo_url,
      source_type: 'system',
      api_key: cloudswayPlatform.api_key,
      api_url: cloudswayPlatform.api_url,
      api_version: cloudswayPlatform.api_version,
      key_obtain_url: cloudswayPlatform.key_obtain_url,
    };
    const platform = await Platform.create(platformData);
    const modelsData = cloudswayPlatform.models.map(model => ({
      // @ts-ignore
      platform_id: platform.id,
      logo_url: model.logo_url,
      model_id: model.model_id,
      model_name: model.model_name,
      group_name: model.group_name,
      model_types: model.model_types,
    }));
    await Model.bulkCreate(modelsData);
  }
  // v0.1.2 => v0.1.3
  const platform_lemon = await Platform.findOne({ where: { name: 'Lemon' } })
  if (!platform_lemon) {
    const lemonPlatform = defaultData.find(item => item.name === 'Lemon')
    const platformData = {
      name: lemonPlatform.name,
      logo_url: lemonPlatform.logo_url,
      source_type: 'system',
      api_key: lemonPlatform.api_key,
      api_url: lemonPlatform.api_url,
      api_version: lemonPlatform.api_version,
      key_obtain_url: lemonPlatform.key_obtain_url,
      is_subscribe: true,
      is_enabled: true
    };
    const platform = await Platform.create(platformData);
    const modelsData = lemonPlatform.models.map(model => ({
      // @ts-ignore
      platform_id: platform.id,
      logo_url: model.logo_url,
      model_id: model.model_id,
      model_name: model.model_name,
      group_name: model.group_name,
      model_types: model.model_types,
    }));
    await Model.bulkCreate(modelsData);
  }

  // v0.1.3 => v0.1.4
  await Platform.update({ is_enabled: true }, { where: { name: 'Lemon' } })
  SearchProviderTable.destroy({ where: { name: 'Baidu' } });
  SearchProviderTable.destroy({ where: { name: 'Bing' } });
}

const sync = async () => {
  try {
    await tableSync();
    await dataSync();
    await dataUpdate();
  } catch (error) {
    console.error('Error during sync:', error);
  }
}

module.exports = exports = sync;

if (require.main === module) {
  sync()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}