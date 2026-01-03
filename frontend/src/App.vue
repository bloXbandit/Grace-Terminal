<template>
  <a-config-provider :theme="{
    token: {
      colorPrimary: '#1a1a19',  // 主色
      colorLink: '#1a1a19',     // 链接色
      colorSuccess: '#52c41a',  // 成功色（可按需修改）
      colorWarning: '#faad14',  // 警告色（可按需修改）
      colorError: '#ff4d4f',    // 错误色（可按需修改）
    }
  }">
    <router-view></router-view>
  </a-config-provider>
</template>

<script setup>
import { onMounted } from 'vue';
import { useUserStore } from '@/store/modules/user.js';

const userStore = useUserStore();

// Initialize default user for local development if not logged in
onMounted(() => {
  if (!userStore.user.id) {
    console.log('⚠️  [App] No user logged in, setting default local user');
    userStore.setUser({
      id: 1,
      email: 'kmanjoll@gmail.com',
      user_name: 'Kenny',
      is_admin: true
    });
  }
});
</script>

<style scoped>

/* 移动端适配 */
@media (max-width: 768px) {
  .language-switcher {
    display: none;
  }
}
</style>
