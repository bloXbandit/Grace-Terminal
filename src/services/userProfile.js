const UserProfile = require('@src/models/UserProfile');
const { Op } = require('sequelize');

/**
 * Get or create a user profile entry
 */
const upsertProfile = async (user_id, key, value, confidence = 1.0, source = 'conversation') => {
  const sequelize = require('@src/models');
  
  // CRITICAL FIX: Use atomic transaction with row-level locking to prevent race conditions
  const transaction = await sequelize.transaction();
  
  try {
    // Step 1: Find existing profile with FOR UPDATE lock (prevents concurrent modifications)
    let profile = await UserProfile.findOne({
      where: { user_id, key },
      lock: transaction.LOCK.UPDATE, // Row-level lock prevents race conditions
      transaction
    });

    if (profile) {
      // PRIORITY ENFORCEMENT: Only update if new source has higher or equal priority
      const sourcePriority = {
        'settings': 3,      // Highest priority
        'conversation': 2,  // Medium priority  
        'other': 1         // Lowest priority
      };
      
      const currentPriority = sourcePriority[profile.source] || 1;
      const newPriority = sourcePriority[source] || 1;
      
      // Only update if new source has higher or equal priority
      if (newPriority >= currentPriority) {
        await profile.update({
          value,
          confidence,
          source,
          last_updated: new Date()
        }, { transaction });
      } else {
        console.log(`[Profile] Skipping update - ${source} (priority ${newPriority}) < ${profile.source} (priority ${currentPriority})`);
      }
    } else {
      // Create new profile
      profile = await UserProfile.create({
        user_id,
        key,
        value,
        confidence,
        source,
        last_updated: new Date()
      }, { transaction });
    }

    // Commit transaction - all operations are atomic
    await transaction.commit();
    
    console.log(`[Profile] Successfully upserted ${key}=${value} for user ${user_id} (source: ${source})`);
    return profile;
    
  } catch (error) {
    // Rollback on any error
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('[Profile] Transaction rollback failed:', rollbackError.message);
    }
    
    console.error('[Profile] Profile upsert transaction failed:', error.message);
    
    // CRITICAL FIX: Don't throw - profile updates are non-critical
    // Return null to allow the conversation to continue
    console.log('[Profile] Continuing without profile update (non-critical failure)');
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

    // Group by key and prioritize: settings > conversation > other sources
    const profileMap = new Map();
    profiles.filter(p => p.confidence >= 0.5).forEach(p => {
      const existing = profileMap.get(p.key);
      if (!existing || 
          (p.source === 'settings' && existing.source !== 'settings') ||
          (p.source === 'conversation' && existing.source !== 'settings' && existing.source !== 'conversation')) {
        profileMap.set(p.key, p);
      }
    });
    
    const profileLines = Array.from(profileMap.values())
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
