require('module-alias/register');
const TaskExecution = require('@src/models/TaskExecution');
const FileRegistry = require('@src/context/FileRegistry');

/**
 * TaskLogger - Log all task executions for SEAL learning
 * Tracks performance, errors, and user feedback
 */
class TaskLogger {
  /**
   * Log a task execution
   * @param {Object} taskData - Task execution data
   * @returns {Object} - Created task execution record
   */
  static async logTask(taskData) {
    try {
      const {
        user_id = 1,
        conversation_id,
        task_type,
        task_description,
        input_data,
        output_data,
        model_used,
        execution_time_ms,
        success,
        error_message = null,
        tokens_used = 0,
        cost = 0,
        tools_used = [],
        metadata = {}
      } = taskData;

      const now = new Date();

      let finalSuccess = success;
      let finalMetadata = { ...metadata };

      if (success && conversation_id && metadata?.generatedFiles?.length) {
        try {
          const registry = new FileRegistry(conversation_id, user_id);
          const verifiedFiles = [];

          for (const file of metadata.generatedFiles) {
            const fileName = typeof file === 'string' ? file : file.filename || file.filepath;
            if (!fileName) continue;

            const fileRecord = await registry.get(fileName);
            if (fileRecord) {
              verifiedFiles.push({
                name: fileRecord.file_name,
                path: fileRecord.file_path,
                exists: true
              });
            } else {
              verifiedFiles.push({
                name: fileName,
                exists: false
              });
              finalSuccess = false;
            }
          }

          finalMetadata.generatedFiles = verifiedFiles;
          finalMetadata.fileVerification = {
            verified: verifiedFiles.every(file => file.exists),
            total: verifiedFiles.length,
            missing: verifiedFiles.filter(file => !file.exists).map(file => file.name)
          };

          if (!finalMetadata.fileVerification.verified) {
            finalMetadata.verification_error = 'One or more generated files were not found during logging.';
          }
        } catch (verificationError) {
          console.error('❌ [SEAL] File verification failed:', verificationError);
          finalMetadata.verification_error = verificationError.message;
          finalSuccess = false;
        }
      }

      const taskExecution = await TaskExecution.create({
        user_id,
        conversation_id,
        task_type,
        task_description,
        input_data: JSON.stringify(input_data),
        output_data: JSON.stringify(output_data),
        model_used,
        execution_time_ms,
        success: finalSuccess,
        error_message,
        tokens_used,
        cost,
        start_time: now,
        end_time: new Date(now.getTime() + (execution_time_ms || 0)),
        tools_used: JSON.stringify(tools_used),
        metadata: JSON.stringify(finalMetadata),
        user_feedback: null, // Will be updated later
        feedback_score: null
      });

      console.log(`📊 [SEAL] Task logged: ${task_type} (${finalSuccess ? 'SUCCESS' : 'FAILED'})`);
      return taskExecution;
    } catch (error) {
      console.error('❌ [SEAL] Error logging task:', error);
      return null;
    }
  }

  /**
   * Update task with user feedback
   * @param {number} taskId - Task execution ID
   * @param {Object} feedback - User feedback data
   */
  static async updateFeedback(taskId, feedback) {
    try {
      const { score, comment } = feedback;
      
      await TaskExecution.update(
        {
          user_feedback: comment || null,
          feedback_score: score
        },
        { where: { id: taskId } }
      );

      console.log(`👍 [SEAL] Feedback recorded for task ${taskId}: ${score}/5`);
    } catch (error) {
      console.error('❌ [SEAL] Error updating feedback:', error);
    }
  }

  /**
   * Get recent task executions for analysis
   * @param {Object} options - Query options
   * @returns {Array} - Task execution records
   */
  static async getRecentTasks(options = {}) {
    try {
      const {
        task_type = null,
        limit = 100,
        success_only = false,
        min_feedback_score = null
      } = options;

      const where = {};
      if (task_type) where.task_type = task_type;
      if (success_only) where.success = true;
      if (min_feedback_score) where.feedback_score = { $gte: min_feedback_score };

      const tasks = await TaskExecution.findAll({
        where,
        limit,
        order: [['create_time', 'DESC']]
      });

      return tasks;
    } catch (error) {
      console.error('❌ [SEAL] Error fetching tasks:', error);
      return [];
    }
  }

  /**
   * Calculate performance metrics for a task type
   * @param {string} taskType - Type of task
   * @returns {Object} - Performance metrics
   */
  static async calculateMetrics(taskType) {
    try {
      const tasks = await TaskExecution.findAll({
        where: { task_type: taskType }
      });

      if (tasks.length === 0) {
        return {
          task_type: taskType,
          total_executions: 0,
          success_rate: 0,
          avg_execution_time: 0,
          avg_feedback_score: 0,
          total_cost: 0
        };
      }

      const successCount = tasks.filter(t => t.success).length;
      const totalTime = tasks.reduce((sum, t) => sum + (t.execution_time_ms || 0), 0);
      const totalCost = tasks.reduce((sum, t) => sum + (t.cost || 0), 0);
      
      const feedbackTasks = tasks.filter(t => t.feedback_score !== null);
      const avgFeedback = feedbackTasks.length > 0
        ? feedbackTasks.reduce((sum, t) => sum + t.feedback_score, 0) / feedbackTasks.length
        : 0;

      return {
        task_type: taskType,
        total_executions: tasks.length,
        success_rate: (successCount / tasks.length) * 100,
        avg_execution_time: totalTime / tasks.length,
        avg_feedback_score: avgFeedback,
        total_cost: totalCost,
        last_execution: tasks[0].create_time
      };
    } catch (error) {
      console.error('❌ [SEAL] Error calculating metrics:', error);
      return null;
    }
  }
}

module.exports = TaskLogger;
