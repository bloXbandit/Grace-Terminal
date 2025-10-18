/**
 * SEAL Framework Entry Point
 * Self-Evolving Agentic LLM System
 */

const sealCoordinator = require('./SEALCoordinator');

// Auto-start SEAL on server startup
const SEAL_ENABLED = process.env.SEAL_ENABLED !== 'false'; // Enabled by default

if (SEAL_ENABLED) {
  console.log('🧠 [SEAL] Self-Evolving Agentic LLM Framework initialized');
  console.log('📚 [SEAL] Based on MIT CSAIL research: https://github.com/Continual-Intelligence/SEAL');
  
  // Start continuous improvement loop after 1 minute (let server stabilize)
  setTimeout(() => {
    sealCoordinator.start();
  }, 60000);
} else {
  console.log('⚠️  [SEAL] Framework disabled via SEAL_ENABLED=false');
}

module.exports = {
  coordinator: sealCoordinator,
  TaskLogger: require('./TaskLogger'),
  SelfEditGenerator: require('./SelfEditGenerator'),
  SelfEditEvaluator: require('./SelfEditEvaluator')
};
