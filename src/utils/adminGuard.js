/**
 * Admin guard — single source of truth for privileged capabilities.
 *
 * Dev Mode (Grace self-modification) is ADMIN-ONLY: only the platform owner may
 * enable it, per-conversation, and every self-edit is audited. The admin user is
 * ADMIN_USER_ID from .env (defaults to user 1 — the owner on this single-user box).
 */
const fs = require('fs');
const path = require('path');

const ADMIN_USER_ID = String(process.env.ADMIN_USER_ID || '1');

const isAdminUser = (user_id) => {
  if (user_id === undefined || user_id === null) return false;
  return String(user_id) === ADMIN_USER_ID;
};

/** Append-only audit trail for privileged actions (self-edits, dev-mode toggles). */
const AUDIT_LOG = path.join(process.env.LEMON_AI_PATH || path.resolve(__dirname, '../../'), 'data', 'admin_audit.log');

const auditLog = (event, details = {}) => {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), event, ...details }) + '\n';
    fs.appendFileSync(AUDIT_LOG, line);
  } catch (e) {
    console.error('[AdminGuard] audit write failed:', e.message);
  }
};

module.exports = { isAdminUser, auditLog, ADMIN_USER_ID };
