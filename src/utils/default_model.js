require('dotenv').config()
require("module-alias/register");
const DefaultModelSetting = require('@src/models/DefaultModelSetting');
const Model = require('@src/models/Model');
const Plantform = require('@src/models/Platform');
const Conversation = require('@src/models/Conversation')

const _defaultModelCache = {};

const _fetchDefaultModel = async (type = 'assistant') => {
  try {
    const defaultModelSetting = await DefaultModelSetting.findOne({ where: { setting_type: type } });
    if (!defaultModelSetting) {
      // Return first enabled model as ultimate fallback
      const firstModel = await Model.findOne({ where: { enabled: true } });
      if (!firstModel) return null;
      
      const platform = await Plantform.findOne({ where: { id: firstModel.dataValues.platform_id } });
      if (!platform) return null;
      
      return {
        model_name: firstModel.dataValues.model_id,
        platform_name: platform.dataValues.name,
        api_key: platform.dataValues.api_key,
        api_url: platform.dataValues.api_url + '/chat/completions',
        base_url: platform.dataValues.api_url,
        is_subscribe: platform.is_subscribe || false
      };
    }
    
    const model = await Model.findOne({ where: { id: defaultModelSetting.dataValues.model_id } });
    if (!model) return null;
    const model_name = model.dataValues.model_id;
    const platform = await Plantform.findOne({ where: { id: model.dataValues.platform_id } });
    if (!platform) return null;

    const api_key = platform.dataValues.api_key;
    const base_url = platform.dataValues.api_url
    let api_url = platform.dataValues.api_url;
    if (type === 'assistant') {
      api_url = platform.dataValues.api_url + '/chat/completions';
    }
    const platform_name = platform.dataValues.name;

    return { model_name, platform_name, api_key, api_url, base_url: base_url, is_subscribe: platform.is_subscribe || false };
  } catch (error) {
    console.error('Error in _fetchDefaultModel:', error);
    return null;
  }
};

const getDefaultModel = async (conversation_id) => {
  try {
    const conversation = await Conversation.findOne({ where: { conversation_id } })
    if (!conversation || !conversation.dataValues.model_id) {
      // Fallback to default model setting
      return await _fetchDefaultModel('assistant');
    }
    
    const model = await Model.findOne({ where: { id: conversation.dataValues.model_id } });
    if (!model) {
      return await _fetchDefaultModel('assistant');
    }
    
    const model_name = model.dataValues.model_id;
    const platform = await Plantform.findOne({ where: { id: model.dataValues.platform_id } });
    if (!platform) {
      return await _fetchDefaultModel('assistant');
    }

    const api_key = platform.dataValues.api_key;
    const base_url = platform.dataValues.api_url
    let api_url = platform.dataValues.api_url;
    api_url = platform.dataValues.api_url + '/chat/completions';
    const platform_name = platform.dataValues.name;

    return { 
      model_name, 
      platform_name, 
      api_key, 
      api_url, 
      base_url: base_url, 
      is_subscribe: platform.is_subscribe || false 
    };
  } catch (error) {
    console.error('Error in getDefaultModel:', error);
    return await _fetchDefaultModel('assistant');
  }
};

const getCustomModel = async (model_id) => {

  const model = await Model.findOne({ where: { model_id: model_id } });
  if (!model) return null;
  const model_name = model.dataValues.model_id;
  const platform = await Plantform.findOne({ where: { id: model.dataValues.platform_id } });
  if (!platform) return null;

  const api_key = platform.dataValues.api_key;
  const base_url = platform.dataValues.api_url
  let api_url = platform.dataValues.api_url;
  api_url = platform.dataValues.api_url + '/chat/completions';
  const platform_name = platform.dataValues.name;

  return { model_name, platform_name, api_key, api_url, base_url: base_url, is_subscribe: false };

};

const updateDefaultModel = async (type = 'assistant') => {
  const modelInfo = await _fetchDefaultModel(type);
  if (modelInfo) {
    _defaultModelCache[type] = modelInfo;
  }
  return modelInfo;
};

module.exports = {
  getDefaultModel,
  updateDefaultModel,
  getCustomModel,
};