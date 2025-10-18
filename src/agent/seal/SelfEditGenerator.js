require('module-alias/register');
const chat_completion = require('@src/agent/chat-completion/index');
const SelfEdit = require('@src/models/SelfEdit');
const { getDefaultModel } = require('@src/utils/default_model');

/**
 * SelfEditGenerator - Generate self-edits for continuous improvement
 * Core component of SEAL (Self-Adapting LLM) framework
 * 
 * Inspired by MIT's SEAL: https://github.com/Continual-Intelligence/SEAL
 */
class SelfEditGenerator {
  constructor(options = {}) {
    this.user_id = options.user_id;
    this.num_candidates = options.num_candidates || 3; // Generate N variants
    this.base_temperature = options.base_temperature || 0.8;
    this.model = options.model || null; // Will use default if not specified
  }

  /**
   * Generate multiple self-edit candidates for a given context
   * @param {Object} context - Context containing task info and performance data
   * @returns {Array} - Array of self-edit candidates
   */
  async generateSelfEdits(context) {
    const {
      task_type,
      new_information,
      current_performance,
      failure_patterns,
      success_patterns,
      user_feedback
    } = context;

    console.log(`[SEAL] Generating ${this.num_candidates} self-edit candidates for task type: ${task_type}`);

    const candidates = [];

    // Generate N different strategies with varying temperatures
    for (let i = 0; i < this.num_candidates; i++) {
      const temperature = this.base_temperature + (i * 0.1);
      
      try {
        const prompt = this.buildSelfEditPrompt(context, i);
        
        // Use chat completion to generate self-edit
        const response = await chat_completion(prompt, {
          temperature: temperature,
          response_format: 'json',
          model: this.model
        });

        const selfEdit = this.parseSelfEditResponse(response, i, temperature);
        
        if (selfEdit) {
          candidates.push({
            ...selfEdit,
            task_type,
            generation_temperature: temperature,
            candidate_index: i,
            user_id: this.user_id
          });
        }
      } catch (error) {
        console.error(`[SEAL] Error generating candidate ${i}:`, error.message);
      }
    }

    console.log(`[SEAL] Successfully generated ${candidates.length} self-edit candidates`);
    return candidates;
  }

  /**
   * Build the prompt for self-edit generation
   * @param {Object} context - Task context
   * @param {number} candidateIndex - Index of current candidate
   * @returns {string} - Prompt for LLM
   */
  buildSelfEditPrompt(context, candidateIndex) {
    const {
      task_type,
      new_information,
      current_performance,
      failure_patterns,
      success_patterns,
      user_feedback
    } = context;

    return `You are Grace AI, a self-improving AI assistant. You have the ability to generate "self-edits" - improvements to your own knowledge and strategies.

## Current Situation
**Task Type**: ${task_type}
**Current Performance**: ${JSON.stringify(current_performance || {}, null, 2)}
**New Information**: ${new_information || 'None'}
**Recent Failures**: ${JSON.stringify(failure_patterns || [], null, 2)}
**Recent Successes**: ${JSON.stringify(success_patterns || [], null, 2)}
**User Feedback**: ${user_feedback || 'None'}

## Your Task
Generate a self-edit to improve your performance on ${task_type} tasks. This is candidate #${candidateIndex + 1}, so be creative and try a different approach than previous candidates might.

A self-edit should include:
1. **Synthetic Training Data**: Generate 3-5 example scenarios that would help you learn this skill better
2. **Improved Prompt Template**: A better system prompt or instruction template for this task type
3. **Optimization Strategy**: How should this knowledge be integrated (learning rate, practice frequency, etc.)
4. **Data Augmentation**: Ways to expand or vary the training examples
5. **Reasoning**: Explain WHY this self-edit will improve performance

## Output Format (JSON)
{
  "edit_name": "Descriptive name for this improvement",
  "synthetic_data": [
    {
      "scenario": "Example scenario",
      "correct_approach": "How to handle it",
      "common_mistakes": "What to avoid"
    }
  ],
  "prompt_template": "Improved system prompt or instructions",
  "optimization_config": {
    "learning_rate": "fast/medium/slow",
    "practice_frequency": "high/medium/low",
    "retention_priority": "critical/high/medium/low"
  },
  "augmentation_strategies": [
    "Strategy 1",
    "Strategy 2"
  ],
  "reasoning": "Detailed explanation of why this will work"
}

Generate the self-edit now:`;
  }

  /**
   * Parse LLM response into structured self-edit
   * @param {Object} response - LLM response
   * @param {number} index - Candidate index
   * @param {number} temperature - Generation temperature
   * @returns {Object} - Parsed self-edit
   */
  parseSelfEditResponse(response, index, temperature) {
    try {
      // Response should already be JSON from chat_completion
      const data = typeof response === 'string' ? JSON.parse(response) : response;

      return {
        edit_name: data.edit_name || `Self-Edit-${Date.now()}-${index}`,
        synthetic_data: JSON.stringify(data.synthetic_data || []),
        prompt_template: data.prompt_template || null,
        optimization_config: JSON.stringify(data.optimization_config || {}),
        augmentation_strategies: JSON.stringify(data.augmentation_strategies || []),
        reasoning: data.reasoning || '',
        generation_temperature: temperature
      };
    } catch (error) {
      console.error('[SEAL] Error parsing self-edit response:', error.message);
      return null;
    }
  }

  /**
   * Save self-edit candidates to database
   * @param {Array} candidates - Self-edit candidates
   * @param {Object} context - Generation context
   * @returns {Array} - Saved self-edit records
   */
  async saveCandidates(candidates, context = {}) {
    const savedEdits = [];

    for (const candidate of candidates) {
      try {
        const selfEdit = await SelfEdit.create({
          user_id: this.user_id,
          task_type: candidate.task_type,
          edit_name: candidate.edit_name,
          synthetic_data: candidate.synthetic_data,
          prompt_template: candidate.prompt_template,
          optimization_config: candidate.optimization_config,
          augmentation_strategies: candidate.augmentation_strategies,
          reasoning: candidate.reasoning,
          generation_temperature: candidate.generation_temperature,
          is_active: false, // Not active until evaluated and approved
          rest_em_iteration: context.iteration || 0,
          metadata: JSON.stringify({
            generated_at: new Date().toISOString(),
            context: context
          })
        });

        savedEdits.push(selfEdit);
        console.log(`[SEAL] Saved self-edit: ${selfEdit.edit_name} (ID: ${selfEdit.id})`);
      } catch (error) {
        console.error('[SEAL] Error saving self-edit:', error.message);
      }
    }

    return savedEdits;
  }

  /**
   * Generate self-edit for knowledge incorporation
   * Specialized method for learning new factual information
   * @param {string} passage - New information to incorporate
   * @returns {Array} - Self-edit candidates
   */
  async generateKnowledgeIncorporation(passage) {
    const context = {
      task_type: 'knowledge_incorporation',
      new_information: passage,
      current_performance: {
        description: 'Need to internalize new factual information'
      }
    };

    return await this.generateSelfEdits(context);
  }

  /**
   * Generate self-edit for few-shot learning
   * Specialized method for learning from examples
   * @param {Array} examples - Few-shot examples
   * @param {string} taskDescription - Description of the task
   * @returns {Array} - Self-edit candidates
   */
  async generateFewShotLearning(examples, taskDescription) {
    const context = {
      task_type: 'few_shot_learning',
      new_information: `Task: ${taskDescription}\nExamples: ${JSON.stringify(examples)}`,
      current_performance: {
        description: 'Learning from few-shot examples'
      }
    };

    return await this.generateSelfEdits(context);
  }
}

module.exports = SelfEditGenerator;
