const sequelize = require('./index.js');
const { Model, DataTypes } = require("sequelize");

class TaskTable extends Model { }

const fields = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Task ID'
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: '用户ID'
  },
  conversation_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Conversation ID'
  },
  task_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Task ID'
  },
  parent_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '父任务ID'
  },
  requirement: {
    type: DataTypes.TEXT,
    allowNull: false,
    set(value) {
      if (value === null || value === undefined) {
        this.setDataValue('requirement', '');
      } else if (typeof value === 'string') {
        this.setDataValue('requirement', value);
      } else if (typeof value === 'object') {
        this.setDataValue('requirement', JSON.stringify(value));
      } else {
        this.setDataValue('requirement', String(value));
      }
    }
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
    set(value) {
      if (value === null || value === undefined) {
        this.setDataValue('error', null);
      } else if (typeof value === 'string') {
        this.setDataValue('error', value);
      } else if (typeof value === 'object') {
        this.setDataValue('error', JSON.stringify(value));
      } else {
        this.setDataValue('error', String(value));
      }
    }
  },
  result: {
    type: DataTypes.TEXT,
    allowNull: true,
    set(value) {
      if (value === null || value === undefined) {
        this.setDataValue('result', null);
      } else if (typeof value === 'string') {
        this.setDataValue('result', value);
      } else if (typeof value === 'object') {
        this.setDataValue('result', JSON.stringify(value));
      } else {
        this.setDataValue('result', String(value));
      }
    }
  },
  memorized: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  create_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Created At'
  },
  update_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Updated At'
  }
};

TaskTable.init(fields, {
  sequelize,
  modelName: 'task'
});


module.exports = exports = TaskTable;