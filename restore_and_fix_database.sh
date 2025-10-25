#!/bin/bash

echo "🔧 Restoring database from October 22 backup..."

# Stop Docker
docker-compose down

# Restore from backup
cp .backups/pre-build-20251022-235358/data/database.sqlite data/database.sqlite

echo "✅ Database restored!"
echo "🔧 Applying model fixes..."

# Apply all the fixes we made today
sqlite3 data/database.sqlite <<EOF
-- Fix model IDs to OpenRouter format (models 20, 21, 22 are on platform 7 = OpenAI)
UPDATE model SET model_id = 'openai/gpt-4o', platform_id = 13 WHERE id = 20;
UPDATE model SET model_id = 'openai/gpt-4o-mini', platform_id = 13 WHERE id = 21;
UPDATE model SET model_id = 'openai/gpt-5-pro', platform_id = 13 WHERE id = 22;
EOF

# Use model 22 as GPT-5 Pro
GPT5_MODEL_ID=22

echo "GPT-5 Pro model ID: $GPT5_MODEL_ID"

# Set default model
sqlite3 data/database.sqlite <<EOF
-- Clear existing default settings
DELETE FROM default_model_setting WHERE setting_type = 'assistant';

-- Set GPT-5 Pro as default
INSERT INTO default_model_setting (setting_type, model_id, config, create_at, update_at) 
VALUES ('assistant', $GPT5_MODEL_ID, '{}', datetime('now'), datetime('now'));

-- Update conversations to use GPT-5 Pro
UPDATE conversation SET model_id = $GPT5_MODEL_ID;
EOF

echo "✅ All fixes applied!"
echo "🚀 Starting Docker..."

# Start Docker
docker-compose up -d

echo "✅ Done! GraceAI is ready at http://localhost:5005"
