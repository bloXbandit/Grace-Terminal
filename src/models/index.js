const { Sequelize } = require('sequelize');

const { getFilepath } = require('@src/utils/electron');
const sqliteFilepath = getFilepath('data', 'database.sqlite');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: sqliteFilepath,
  dialectOptions: {
    // Best practice for SQLite under concurrency: wait a bit instead of throwing SQLITE_BUSY
    busyTimeout: 5000,
  },
  retry: {
    max: 5,
    match: [/SQLITE_BUSY/],
  },
  define: {
    timestamps: false,
    freezeTableName: true,
  },
  logging: false
});

// SQLite PRAGMAs for better concurrent read/write behavior
sequelize.addHook('afterConnect', async (connection) => {
  try {
    // WAL improves concurrency (readers don't block writers as much)
    await sequelize.query('PRAGMA journal_mode=WAL;');
    await sequelize.query('PRAGMA busy_timeout=5000;');
  } catch (e) {
    // Keep startup resilient; failures here shouldn't crash the app
  }
});
module.exports = exports = sequelize;
