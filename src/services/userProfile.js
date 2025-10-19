const UserProfile = require('@src/models/UserProfile');
const { Op } = require('sequelize');

/**
 * Get or create a user profile entry
 */
const upsertProfile = async (user_id, key, value, confidence = 1.0, source = 'conversation') => {
  try {
    const [profile, created] = await UserProfile.findOrCreate({
      where: { user_id, key },
      defaults: {
        user_id,
        key,
        value,
        confidence,
        source,
        last_updated: new Date()
      }
    });

    if (!created) {
      // Update existing profile
      profile.value = value;
      profile.confidence = confidence;
      profile.source = source;
      profile.last_updated = new Date();
      await profile.save();
    }

    return profile;
  } catch (error) {
    console.error('Error upserting user profile:', error);
    return null;
  }
};

/**
 * Get user profile by key
 */
const getProfile = async (user_id, key) => {
  try {
    return await UserProfile.findOne({
      where: { user_id, key }
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

/**
 * Get all profile entries for a user
 */
const getAllProfiles = async (user_id) => {
  try {
    return await UserProfile.findAll({
      where: { user_id },
      order: [['confidence', 'DESC'], ['last_updated', 'DESC']]
    });
  } catch (error) {
    console.error('Error getting all user profiles:', error);
    return [];
  }
};

/**
 * Get user profile as formatted string for system prompt
 */
const getProfileContext = async (user_id) => {
  try {
    const profiles = await getAllProfiles(user_id);
    
    console.log(`[Profile] Loading profile for user ${user_id}: ${profiles.length} entries found`);
    
    if (profiles.length === 0) {
      console.log('[Profile] No profile entries found - returning empty context');
      return '';
    }

    const profileLines = profiles
      .filter(p => p.confidence >= 0.5) // Only include confident entries
      .map(p => `- ${p.key}: ${p.value}`)
      .join('\n');

    const context = `\n## User Profile:\n${profileLines}\n`;
    console.log('[Profile] Profile context:', context);
    return context;
  } catch (error) {
    console.error('Error formatting profile context:', error);
    return '';
  }
};

/**
 * Check if profile is missing key information
 */
const getMissingProfileKeys = async (user_id) => {
  const essentialKeys = ['name', 'profession', 'interests', 'expertise_level'];
  const profiles = await getAllProfiles(user_id);
  const existingKeys = profiles.map(p => p.key);
  
  return essentialKeys.filter(key => !existingKeys.includes(key));
};

/**
 * Delete a profile entry
 */
const deleteProfile = async (user_id, key) => {
  try {
    await UserProfile.destroy({
      where: { user_id, key }
    });
    return true;
  } catch (error) {
    console.error('Error deleting user profile:', error);
    return false;
  }
};

module.exports = {
  upsertProfile,
  getProfile,
  getAllProfiles,
  getProfileContext,
  getMissingProfileKeys,
  deleteProfile
};
