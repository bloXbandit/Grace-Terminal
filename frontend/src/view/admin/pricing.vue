<template>
  <div class="admin-pricing">
    <div class="pricing-header">
      <div>
        <h1>💰 Pricing Management</h1>
        <p>Manage subscription tiers and pricing</p>
      </div>
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
  margin: 0 0 0.5rem 0;
}

.pricing-header p {
  margin: 0;
  color: #6b7280;
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

.modal-content h2 {
  margin-top: 0;
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
  box-sizing: border-box;
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

