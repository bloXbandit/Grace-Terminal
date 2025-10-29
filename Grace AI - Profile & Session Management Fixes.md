# Grace AI - Profile & Session Management Fixes

**Objective:** Implement profile and session management fixes for Grace AI without breaking existing logic, ensuring user params persist, new users can use default API keys, and subscription tiers are functional.

---

## 1. Executive Summary

This document outlines the implementation plan to fix critical gaps in Grace AI's profile and session management. The core issues are:

1.  **Profile data is NOT connected to the AI execution pipeline.**
2.  **User profile settings don't persist reliably in the UI.**
3.  **New users can't use Grace without setting their own API keys.**
4.  **Subscription/pricing tiers are not functional.**

We will address these issues with minimal, safe code changes, primarily by connecting existing infrastructure rather than building new components.

---

## 2. Current State Analysis

| Feature | Status | Files |
| :--- | :--- | :--- |
| Profile Data Storage | ✅ Working | `userProfile.js` | `upsertProfile`, `getAllProfiles` work correctly |
| Profile API | ✅ Working | `profile.js` | `/api/users/profile` endpoint is functional |
| Profile UI | ✅ Working | `profile.vue` | UI exists for manual entry |
| **Profile → AI Pipeline** | ❌ **NOT CONNECTED** | `run.js`, `MultiAgentCoordinator.js` | `profileContext` is loaded but NOT passed to specialists |
| UI Persistence | ⚠️ **Shaky** | `profile.vue` | `saveField` calls `loadProfile` - inefficient and can cause race conditions |
| New User API Keys | ❌ **Broken** | `default_model.js` | Relies on user-specific models, no clear fallback to admin keys |
| Subscription Tiers | ❌ **Not Implemented** | N/A | No logic to handle pricing tiers |

---

## 3. Implementation Plan

### Fix #1: Connect Profile to AI Execution Pipeline (SAFE)

**Goal:** Inject user profile context into specialist system prompts.

**File:** `src/agent/specialists/MultiAgentCoordinator.js`

**Lines:** ~615 (inside `callSpecialist` method)

**Implementation:**

```javascript
// src/agent/specialists/MultiAgentCoordinator.js

// ... inside callSpecialist method, after line 612

// CRITICAL: Get user profile context
let userProfileContext = 
'';
if (options.profileContext) {
  userProfileContext = `\n\n**USER PROFILE CONTEXT:**${options.profileContext}`;
  console.log(
'[Specialist] Adding user profile context
');
}

// Add to system prompt
if (contextMessages[0]?.role === 'system') {
  contextMessages[0].content += existingFilesContext + userProfileContext;
} else {
  contextMessages.unshift({ role: 'system', content: fullSystemPrompt + existingFilesContext + userProfileContext });
}
```

**Explanation:**

*   We're already loading `profileContext` in `run.js` and passing it in the `options` object.
*   This change safely injects the profile into the specialist's system prompt.
*   It's non-invasive and won't break anything if `profileContext` is empty.

---

### Fix #2: Fix UI Persistence (SAFE)

**Goal:** Ensure profile settings persist reliably without race conditions.

**File:** `frontend/src/view/setting/profile.vue`

**Lines:** ~193 (inside `saveField` method)

**Implementation:**

```javascript
// frontend/src/view/setting/profile.vue

// ... inside saveField method

if (response.data && response.data.success) {
  // NO NEED to reload - just confirm save
  // await loadProfile(); // ❌ REMOVE THIS - causes race conditions
  console.log(`[Profile] Saved ${key}: ${value.trim()}`);
} else {
  // Handle save failure
  console.error(
'Failed to save field:
', response.data.message);
}
```

**Explanation:**

*   The current code calls `loadProfile()` after every `saveField()`, which is inefficient and can cause the UI to flicker or show stale data.
*   By removing the `loadProfile()` call, we trust that the save was successful and let the `v-model` handle the UI update.
*   This is a safer, more standard approach.

---

### Fix #3: Default API Keys for New Users (SAFE)

**Goal:** Allow new users to use Grace without setting their own API keys by falling back to admin/system keys.

**File:** `src/utils/default_model.js`

**Lines:** ~13 (inside `getDefaultModel` method)

**Implementation:**

```javascript
// src/utils/default_model.js

// ... inside getDefaultModel method, after line 12

// ULTIMATE FALLBACK: Use admin/system default keys
console.warn('[getDefaultModel] No user-specific model found, using hardcoded system fallback');
return {
  model_name: 'anthropic/claude-sonnet-4.5',
  platform_name: 'OpenRouter',
  api_key: process.env.OPENROUTER_API_KEY || 
'', // Use system key
  api_url: 'https://openrouter.ai/api/v1/chat/completions',
  base_url: 'https://openrouter.ai/api/v1',
  is_subscribe: false
};
```

**Explanation:**

*   The current `getDefaultModel` has a hardcoded fallback, but it's not explicitly using the system's `OPENROUTER_API_KEY`.
*   This change makes it clear that if a user has no model configured, it will use the system's default API key.
*   This is safe because it only affects users who have NOT set up their own models.

---

### Fix #4: Admin Pricing Controls & Subscription Tiers

**Goal:** Create admin-only UI for pricing management, restrict dev mode for non-admin users, and implement subscription tier logic.

---

#### Part A: Database Schema for Pricing Tiers

**File:** `src/models/PricingTier.js` (NEW FILE)

**Implementation:**

```javascript
// src/models/PricingTier.js

const { Model, DataTypes } = require('sequelize');

class PricingTier extends Model {}

const fields = {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  tier_name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Tier name (e.g., Free, Pro, Enterprise)'
  },
  price_monthly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Monthly price in USD'
  },
  price_yearly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Yearly price in USD'
  },
  features: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'JSON array of features included in this tier'
  },
  max_conversations: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: -1,
    comment: 'Max conversations per month (-1 = unlimited)'
  },
  max_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: -1,
    comment: 'Max tokens per month (-1 = unlimited)'
  },
  dev_mode_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether dev mode is enabled for this tier'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether this tier is currently available'
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Display order (lower = shown first)'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
};

const options = {
  tableName: 'pricing_tiers',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

module.exports = { PricingTier, fields, options };
```

**File:** `src/models/UserSubscription.js` (NEW FILE)

**Implementation:**

```javascript
// src/models/UserSubscription.js

const { Model, DataTypes } = require('sequelize');

class UserSubscription extends Model {}

const fields = {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    comment: 'Foreign key to users table'
  },
  tier_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: 'Foreign key to pricing_tiers table'
  },
  billing_cycle: {
    type: DataTypes.ENUM('monthly', 'yearly'),
    allowNull: false,
    defaultValue: 'monthly'
  },
  status: {
    type: DataTypes.ENUM('active', 'cancelled', 'expired', 'trial'),
    allowNull: false,
    defaultValue: 'trial'
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
};

const options = {
  tableName: 'user_subscriptions',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

module.exports = { UserSubscription, fields, options };
```

**File:** `src/models/sync.js` (UPDATE)

**Add these lines:**

```javascript
// src/models/sync.js

const { PricingTier, fields: pricingTierFields, options: pricingTierOptions } = require('./PricingTier');
const { UserSubscription, fields: userSubscriptionFields, options: userSubscriptionOptions } = require('./UserSubscription');

// ... in the sync function

PricingTier.init(pricingTierFields, { ...pricingTierOptions, sequelize });
UserSubscription.init(userSubscriptionFields, { ...userSubscriptionOptions, sequelize });

// Define associations
UserSubscription.belongsTo(User, { foreignKey: 'user_id' });
UserSubscription.belongsTo(PricingTier, { foreignKey: 'tier_id' });
User.hasOne(UserSubscription, { foreignKey: 'user_id' });
PricingTier.hasMany(UserSubscription, { foreignKey: 'tier_id' });
```

---

#### Part B: Backend API for Pricing Management

**File:** `src/routers/admin/pricing.js` (NEW FILE)

**Implementation:**

```javascript
// src/routers/admin/pricing.js

const Router = require('koa-router');
const router = new Router();
const { PricingTier } = require('@src/models');

// Middleware to check if user is admin
const isAdmin = async (ctx, next) => {
  const user_id = ctx.state.user?.id;
  
  // Admin check: user_id === 1 OR no user_id found (local development)
  if (user_id === 1 || !user_id) {
    await next();
  } else {
    ctx.status = 403;
    ctx.body = { success: false, message: 'Admin access required' };
  }
};

// GET /api/admin/pricing - Get all pricing tiers
router.get('/pricing', isAdmin, async (ctx) => {
  try {
    const tiers = await PricingTier.findAll({
      order: [['sort_order', 'ASC']]
    });
    
    ctx.body = {
      success: true,
      tiers
    };
  } catch (error) {
    console.error('Error fetching pricing tiers:', error);
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// POST /api/admin/pricing - Create new pricing tier
router.post('/pricing', isAdmin, async (ctx) => {
  try {
    const tier = await PricingTier.create(ctx.request.body);
    
    ctx.body = {
      success: true,
      tier
    };
  } catch (error) {
    console.error('Error creating pricing tier:', error);
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// PUT /api/admin/pricing/:id - Update pricing tier
router.put('/pricing/:id', isAdmin, async (ctx) => {
  try {
    const tier = await PricingTier.findByPk(ctx.params.id);
    
    if (!tier) {
      ctx.status = 404;
      ctx.body = { success: false, message: 'Tier not found' };
      return;
    }
    
    await tier.update(ctx.request.body);
    
    ctx.body = {
      success: true,
      tier
    };
  } catch (error) {
    console.error('Error updating pricing tier:', error);
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// DELETE /api/admin/pricing/:id - Delete pricing tier
router.delete('/pricing/:id', isAdmin, async (ctx) => {
  try {
    const tier = await PricingTier.findByPk(ctx.params.id);
    
    if (!tier) {
      ctx.status = 404;
      ctx.body = { success: false, message: 'Tier not found' };
      return;
    }
    
    await tier.destroy();
    
    ctx.body = {
      success: true,
      message: 'Tier deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting pricing tier:', error);
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

module.exports = router;
```

**File:** `src/routers/index.js` (UPDATE)

**Add this line:**

```javascript
const adminPricingRouter = require('./admin/pricing');

// ... in the router setup

router.use('/api/admin', adminPricingRouter.routes(), adminPricingRouter.allowedMethods());
```

---

#### Part C: Frontend Admin Pricing UI

**File:** `frontend/src/view/admin/pricing.vue` (NEW FILE)

**Implementation:**

```vue
<template>
  <div class="admin-pricing">
    <div class="pricing-header">
      <h1>💰 Pricing Management</h1>
      <p>Manage subscription tiers and pricing</p>
      <button @click="showAddTierModal = true" class="btn-primary">
        + Add New Tier
      </button>
    </div>

    <div class="pricing-grid">
      <div
        v-for="tier in tiers"
        :key="tier.id"
        class="tier-card"
        :class="{ inactive: !tier.is_active }"
      >
        <div class="tier-header">
          <h2>{{ tier.tier_name }}</h2>
          <div class="tier-actions">
            <button @click="editTier(tier)" class="btn-icon">✏️</button>
            <button @click="deleteTier(tier.id)" class="btn-icon">🗑️</button>
          </div>
        </div>
        
        <div class="tier-pricing">
          <div class="price-item">
            <span class="price">${{ tier.price_monthly }}</span>
            <span class="period">/month</span>
          </div>
          <div class="price-item">
            <span class="price">${{ tier.price_yearly }}</span>
            <span class="period">/year</span>
          </div>
        </div>
        
        <div class="tier-limits">
          <div class="limit-item">
            <span class="label">Conversations:</span>
            <span class="value">{{ tier.max_conversations === -1 ? 'Unlimited' : tier.max_conversations }}</span>
          </div>
          <div class="limit-item">
            <span class="label">Tokens:</span>
            <span class="value">{{ tier.max_tokens === -1 ? 'Unlimited' : tier.max_tokens }}</span>
          </div>
          <div class="limit-item">
            <span class="label">Dev Mode:</span>
            <span class="value">{{ tier.dev_mode_enabled ? '✅' : '❌' }}</span>
          </div>
        </div>
        
        <div class="tier-status">
          <label>
            <input
              type="checkbox"
              v-model="tier.is_active"
              @change="updateTier(tier)"
            />
            Active
          </label>
        </div>
      </div>
    </div>

    <!-- Add/Edit Tier Modal -->
    <div v-if="showAddTierModal || editingTier" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <h2>{{ editingTier ? 'Edit Tier' : 'Add New Tier' }}</h2>
        
        <div class="form-group">
          <label>Tier Name</label>
          <input v-model="tierForm.tier_name" type="text" placeholder="e.g., Pro" />
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Monthly Price ($)</label>
            <input v-model.number="tierForm.price_monthly" type="number" step="0.01" />
          </div>
          <div class="form-group">
            <label>Yearly Price ($)</label>
            <input v-model.number="tierForm.price_yearly" type="number" step="0.01" />
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Max Conversations/Month</label>
            <input v-model.number="tierForm.max_conversations" type="number" placeholder="-1 for unlimited" />
          </div>
          <div class="form-group">
            <label>Max Tokens/Month</label>
            <input v-model.number="tierForm.max_tokens" type="number" placeholder="-1 for unlimited" />
          </div>
        </div>
        
        <div class="form-group">
          <label>
            <input type="checkbox" v-model="tierForm.dev_mode_enabled" />
            Enable Dev Mode
          </label>
        </div>
        
        <div class="form-group">
          <label>Sort Order</label>
          <input v-model.number="tierForm.sort_order" type="number" />
        </div>
        
        <div class="modal-actions">
          <button @click="closeModal" class="btn-secondary">Cancel</button>
          <button @click="saveTier" class="btn-primary">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import http from '@/utils/http';

const tiers = ref([]);
const showAddTierModal = ref(false);
const editingTier = ref(null);
const tierForm = ref({
  tier_name: '',
  price_monthly: 0,
  price_yearly: 0,
  max_conversations: -1,
  max_tokens: -1,
  dev_mode_enabled: false,
  is_active: true,
  sort_order: 0
});

const loadTiers = async () => {
  try {
    const response = await http.get('/api/admin/pricing');
    if (response.data.success) {
      tiers.value = response.data.tiers;
    }
  } catch (error) {
    console.error('Failed to load pricing tiers:', error);
  }
};

const editTier = (tier) => {
  editingTier.value = tier;
  tierForm.value = { ...tier };
};

const saveTier = async () => {
  try {
    if (editingTier.value) {
      await http.put(`/api/admin/pricing/${editingTier.value.id}`, tierForm.value);
    } else {
      await http.post('/api/admin/pricing', tierForm.value);
    }
    await loadTiers();
    closeModal();
  } catch (error) {
    console.error('Failed to save tier:', error);
  }
};

const updateTier = async (tier) => {
  try {
    await http.put(`/api/admin/pricing/${tier.id}`, tier);
  } catch (error) {
    console.error('Failed to update tier:', error);
  }
};

const deleteTier = async (id) => {
  if (!confirm('Are you sure you want to delete this tier?')) return;
  
  try {
    await http.delete(`/api/admin/pricing/${id}`);
    await loadTiers();
  } catch (error) {
    console.error('Failed to delete tier:', error);
  }
};

const closeModal = () => {
  showAddTierModal.value = false;
  editingTier.value = null;
  tierForm.value = {
    tier_name: '',
    price_monthly: 0,
    price_yearly: 0,
    max_conversations: -1,
    max_tokens: -1,
    dev_mode_enabled: false,
    is_active: true,
    sort_order: 0
  };
};

onMounted(() => {
  loadTiers();
});
</script>

<style scoped>
.admin-pricing {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.pricing-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.pricing-header h1 {
  font-size: 2rem;
  margin: 0;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.tier-card {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

.tier-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
}

.tier-card.inactive {
  opacity: 0.6;
  background: #f9fafb;
}

.tier-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.tier-header h2 {
  font-size: 1.5rem;
  margin: 0;
}

.tier-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.25rem;
}

.tier-pricing {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.price-item {
  flex: 1;
  text-align: center;
  padding: 0.75rem;
  background: #f3f4f6;
  border-radius: 8px;
}

.price {
  display: block;
  font-size: 1.5rem;
  font-weight: bold;
  color: #3b82f6;
}

.period {
  font-size: 0.875rem;
  color: #6b7280;
}

.tier-limits {
  margin-bottom: 1rem;
}

.limit-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;
}

.label {
  color: #6b7280;
}

.value {
  font-weight: 600;
}

.tier-status {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.form-group input[type="text"],
.form-group input[type="number"] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.btn-secondary:hover {
  background: #e5e7eb;
}
</style>
```

**File:** `frontend/src/router/index.js` (UPDATE)

**Add this route:**

```javascript
{
  path: '/admin/pricing',
  name: 'AdminPricing',
  component: () => import('@/view/admin/pricing.vue'),
  meta: { requiresAdmin: true }
}
```

**File:** `frontend/src/router/index.js` (UPDATE navigation guard)

**Add admin check:**

```javascript
router.beforeEach((to, from, next) => {
  const userStore = useUserStore();
  
  if (to.meta.requiresAdmin) {
    const user_id = userStore.user?.id;
    if (user_id === 1 || !user_id) {
      next();
    } else {
      next('/'); // Redirect non-admin users
    }
  } else {
    next();
  }
});
```

---

#### Part D: Grey Out Dev Mode for Non-Admin Users

**File:** `frontend/src/components/ModeSelector.vue` (or wherever dev mode toggle is)

**Implementation:**

```vue
<template>
  <div class="mode-selector">
    <button
      @click="toggleDevMode"
      :disabled="!canUseDevMode"
      :class="{ disabled: !canUseDevMode }"
    >
      🔧 Dev Mode
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useUserStore } from '@/store/modules/user';

const userStore = useUserStore();

const canUseDevMode = computed(() => {
  const user_id = userStore.user?.id;
  // Only admin (user_id === 1) or local user (no user_id) can use dev mode
  return user_id === 1 || !user_id;
});

const toggleDevMode = () => {
  if (!canUseDevMode.value) {
    alert('Dev Mode is only available for admin users. Please upgrade your subscription.');
    return;
  }
  // Toggle dev mode logic
};
</script>

<style scoped>
.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #e5e7eb !important;
}
</style>
```

---

#### Part E: Subscription Tier Logic in Auth Middleware

**File:** `src/middlewares/auth.js`

**Lines:** ~20 (inside auth middleware)

**Implementation:**

```javascript
// src/middlewares/auth.js

const { UserSubscription, PricingTier } = require('@src/models');

// ... after user is authenticated

if (ctx.state.user) {
  // Fetch user's subscription status from database
  try {
    const subscription = await UserSubscription.findOne({
      where: { user_id: ctx.state.user.id },
      include: [{ model: PricingTier }]
    });
    
    if (subscription && subscription.PricingTier) {
      ctx.state.user.subscription = {
        plan: subscription.PricingTier.tier_name,
        status: subscription.status,
        dev_mode_enabled: subscription.PricingTier.dev_mode_enabled,
        max_conversations: subscription.PricingTier.max_conversations,
        max_tokens: subscription.PricingTier.max_tokens,
        has_access: subscription.status === 'active' || subscription.status === 'trial'
      };
    } else {
      // No subscription found - assign free tier
      ctx.state.user.subscription = {
        plan: 'free',
        status: 'trial',
        dev_mode_enabled: false,
        max_conversations: 10,
        max_tokens: 10000,
        has_access: true
      };
    }
  } catch (error) {
    console.error('Error fetching subscription:', error);
    // Fallback to free tier on error
    ctx.state.user.subscription = {
      plan: 'free',
      status: 'trial',
      dev_mode_enabled: false,
      max_conversations: 10,
      max_tokens: 10000,
      has_access: true
    };
  }
}

await next();
```

**Explanation:**

*   This fetches the user's subscription from the database and attaches it to `ctx.state.user`.
*   If no subscription is found, it assigns a free tier with limited access.
*   This ensures the `user.subscription` object is always present and accurate.

---

## 4. Implementation & Testing

**Implementation Order:**

1.  Apply Fix #2 (UI Persistence) - Easiest, no backend changes
2.  Apply Fix #3 (Default API Keys) - Critical for new users
3.  Apply Fix #1 (Profile Injection) - Connects profile to AI
4.  Apply Fix #4 (Subscription Placeholder) - Future-proofing

**Testing Plan:**

1.  **UI Test:**
    *   Go to Profile settings
    *   Change your name and profession
    *   Refresh the page
    *   **Expected:** Changes persist without flickering.
2.  **New User Test:**
    *   Log in with a new user account (or incognito window)
    *   Start a conversation with Grace
    *   **Expected:** Grace responds using the system's default API key.
3.  **Profile Context Test:**
    *   Set your profession to "Expert Rocket Scientist"
    *   Ask Grace: "Explain quantum physics to me"
    *   **Expected:** Grace's response should be tailored to an expert level.
4.  **Regression Test:**
    *   Run existing test suite (`test_grace_live.js`)
    *   **Expected:** All existing tests pass.

---

## 5. Conclusion

These fixes address all critical issues in the profile and session management system with minimal, safe, and targeted changes. They will significantly improve the user experience, enable new user onboarding, and lay the groundwork for future monetization.

