require('dotenv').config();
require("module-alias/register");

const sequelize = require('./src/models/index.js');

async function addEnabledColumn() {
  try {
    console.log('🔧 Adding enabled column to model table...');
    
    // Add the enabled column
    await sequelize.query(`
      ALTER TABLE model 
      ADD COLUMN enabled INTEGER DEFAULT 1;
    `);
    
    console.log('✅ Added enabled column to model table');
    
    // Update all existing models to be enabled
    await sequelize.query(`
      UPDATE model 
      SET enabled = 1 
      WHERE enabled IS NULL;
    `);
    
    console.log('✅ Set all existing models to enabled');
    
    // Verify the column exists
    const [results] = await sequelize.query(`
      PRAGMA table_info(model);
    `);
    
    const enabledColumn = results.find(col => col.name === 'enabled');
    if (enabledColumn) {
      console.log('✅ Verified enabled column exists:', enabledColumn);
    } else {
      console.error('❌ Enabled column not found!');
    }
    
    console.log('🎉 Database migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

addEnabledColumn();
