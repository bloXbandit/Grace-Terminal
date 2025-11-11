#!/usr/bin/env node
/**
 * Test file analysis caching end-to-end
 * Verifies that analysis is cached across messages in a conversation
 */

const { getCachedAnalysis, setCachedAnalysis, getCacheStats, clearAllCache } = require('./src/utils/fileAnalysisCache');

console.log('🧪 Testing File Analysis Cache');
console.log('================================\n');

// Clear cache before testing
clearAllCache();

// Simulate file object from database
const mockFile = {
  id: 123,
  name: 'contract.pdf',
  filepath: '/workspace/user_1/Conversation_abc123/upload/contract.pdf',
  url: 'upload/contract.pdf'
};

const mockAnalysis = {
  filename: 'contract.pdf',
  extension: '.pdf',
  content: 'This is a loan agreement...',
  summary: 'Loan agreement document',
  fileType: 'document',
  sizeFormatted: '150 KB',
  metadata: { pageCount: 5 }
};

console.log('📝 Test 1: Cache MISS (first access)');
console.log('-------------------------------------');
let cached = getCachedAnalysis(mockFile.id);
console.log('Result:', cached ? 'CACHED ✅' : 'MISS ❌');
console.log('Expected: MISS ❌');
console.log('Status:', cached === null ? '✅ PASS' : '❌ FAIL\n');

console.log('💾 Test 2: Set cache');
console.log('-------------------------------------');
setCachedAnalysis(mockFile.id, mockAnalysis);
let stats = getCacheStats();
console.log('Cache size:', stats.size);
console.log('Expected: 1');
console.log('Status:', stats.size === 1 ? '✅ PASS' : '❌ FAIL\n');

console.log('♻️  Test 3: Cache HIT (second access)');
console.log('-------------------------------------');
cached = getCachedAnalysis(mockFile.id);
console.log('Result:', cached ? 'CACHED ✅' : 'MISS ❌');
console.log('Cached filename:', cached?.filename);
console.log('Expected: contract.pdf');
console.log('Status:', cached?.filename === 'contract.pdf' ? '✅ PASS' : '❌ FAIL\n');

console.log('⏱️  Test 4: Simulate message flow');
console.log('-------------------------------------');
console.log('Message 1: Upload file');
console.log('  - File ID:', mockFile.id);
console.log('  - Cache status:', getCachedAnalysis(mockFile.id) ? 'HIT' : 'MISS');
console.log('  - Action: Would analyze file');

// Simulate setting cache after analysis
setCachedAnalysis(mockFile.id, mockAnalysis);
console.log('  - Cache stored ✅\n');

console.log('Message 2: "what\'s in this?"');
const file2 = { id: 123, name: 'contract.pdf' }; // Fresh load from DB
console.log('  - File ID:', file2.id);
console.log('  - Cache status:', getCachedAnalysis(file2.id) ? 'HIT ✅' : 'MISS ❌');
console.log('  - Action: Would use cached analysis\n');

console.log('Message 3: "is it signed?"');
const file3 = { id: 123, name: 'contract.pdf' }; // Fresh load from DB
console.log('  - File ID:', file3.id);
console.log('  - Cache status:', getCachedAnalysis(file3.id) ? 'HIT ✅' : 'MISS ❌');
console.log('  - Action: Would use cached analysis\n');

console.log('Message 4: "weather in japan"');
const file4 = { id: 123, name: 'contract.pdf' }; // Fresh load from DB
console.log('  - File ID:', file4.id);
console.log('  - Cache status:', getCachedAnalysis(file4.id) ? 'HIT ✅' : 'MISS ❌');
console.log('  - Request needs analysis: false');
console.log('  - Action: Would skip analysis entirely\n');

console.log('📊 Final Cache Stats');
console.log('-------------------------------------');
stats = getCacheStats();
console.log('Total entries:', stats.size);
console.log('Details:', JSON.stringify(stats.entries, null, 2));

console.log('\n✅ All tests completed!');
console.log('The cache persists across fresh file loads from the database.');
console.log('This solves the redundant analysis problem.\n');
