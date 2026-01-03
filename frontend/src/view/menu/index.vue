<template>
  <div class="left-menu" :class="{ 'menu-visible': isShowMenu }" v-show="showMenu" @click.self="closeMenu">
    <div class="menu-panel">
      <div class="menu-top">
        <div class="menu-header">
          <Logo />
        </div>
        <div class="menu-actions">
          <div class="menu-button" @click="changeMode('task')">
            <Edit />
            <span class="truncate">New Agent</span>
          </div>
          <div class="menu-button assistant-button" :class="{ active: isAssistantPage }" @click="toAssistant">
            <AssistantIcon />
            <span class="truncate">My Assistant</span>
          </div>
          <div class="menu-button twin-button" :class="{ active: isDigitalTwinPage }" @click="toDigitalTwin">
            <TwinIcon />
            <span class="truncate">Digital Twin</span>
          </div>
        </div>
        <AgentList />
      </div>

      <div class="menu-bottom">
        <div style="display: flex;align-items: flex-end; justify-content: space-between;">
          <div class="user-profile-container" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
            <div class="user-info-bar">
              <userSvg style="height: 20px;width: 20px;" />
              <div class="user-info-text">
                <span class="user-name">{{ user.user_name || user.mobile || user.user_email }}</span>
                <span class="user-plan">{{ membership?.planName || $t("member.freePlan") }}</span>
              </div>
            </div>
            <div class="profile-wrapper" v-show="showProfile">
              <UserProFile :isCollapsed="isCollapsed" :chats="chats" />
            </div>
          </div>

          <div class="version-text" @click="handleVersionClick">
            V {{ versionInfo.localVersion }}
          </div>
        </div>

        <!-- Footer Social Links -->
        <div class="footer-social">
          <a-tooltip title="Homepage">
            <a href="https://www.lemonai.ai" target="_blank" rel="noopener noreferrer" class="footer-social-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="footer-social-icon" xmlns="http://www.w3.org/2000/svg">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9,22 9,12 15,12 15,22"></polyline>
              </svg>
            </a>
          </a-tooltip>
          
          <a-tooltip title="Email">
            <a href="mailto:hello@lemonai.ai" target="_blank" rel="noopener noreferrer" class="footer-social-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="footer-social-icon" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </a>
          </a-tooltip>

          <a-tooltip title="Discord">
            <a href="https://discord.gg/gjEXg4UBR4" target="_blank" rel="noopener noreferrer" class="footer-social-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="footer-social-icon" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0189 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"></path>
              </svg>
            </a>
          </a-tooltip>

         

          <a-tooltip title="Digital Twin">
            <div @click="toDigitalTwin" class="footer-social-link" style="cursor: pointer;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="footer-social-icon" xmlns="http://www.w3.org/2000/svg">
                <circle cx="9" cy="7" r="4"/>
                <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
                <circle cx="17" cy="10" r="3" stroke-dasharray="2 2" opacity="0.6"/>
                <path d="M19 21v-1.5a3 3 0 0 0-3-3" stroke-dasharray="2 2" opacity="0.6"/>
              </svg>
            </div>
          </a-tooltip>
        </div>

      </div>
    </div>

  </div>

  <div class="second-menu">
    <secondMenu :chats="chatList" />
  </div>

  <AgentsEdit v-model:visible="visible" id="" />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'

import Logo from '@/components/logo.vue'
import AgentList from '@/view/agents/index.vue'
import AgentsEdit from '@/view/agents/components/agentsEdit.vue'
import UserProFile from '@/view/auth/components/user-profile.vue'
import secondMenu from './secondMenu.vue'

import userSvg from '@/assets/sidebar/user.svg'
import Edit from '@/assets/svg/menu-edit.svg'
import Store from '@/assets/svg/store.svg'
import Case from '@/assets/svg/case.svg'

// Assistant icon - using a simple inline SVG component
const AssistantIcon = {
  template: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4"/>
    <path d="M12 8h.01"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
  </svg>`
}

// Digital Twin icon - person with reflection/duplicate effect
const TwinIcon = {
  template: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="9" cy="7" r="4"/>
    <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
    <circle cx="17" cy="10" r="3" stroke-dasharray="2 2" opacity="0.6"/>
    <path d="M19 21v-1.5a3 3 0 0 0-3-3" stroke-dasharray="2 2" opacity="0.6"/>
  </svg>`
}

import { useChatStore } from '@/store/modules/chat'
import { useUserStore } from '@/store/modules/user.js'
import emitter from '@/utils/emitter'
import { useI18n } from 'vue-i18n'

import service from '@/services/default-model-setting'

const router = useRouter()
const route = useRoute()
const chatStore = useChatStore()
const userStore = useUserStore()
const { agent, mode } = storeToRefs(chatStore)
const { user, membership } = storeToRefs(userStore)


const { t } = useI18n()
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let tourDriver = null;

const tour = async () => {
  tourDriver = driver({
    animate: true,
    showProgress: false,
    prevBtnText: t('setting.prevStep'),
    nextBtnText: t('setting.nextStep'),
    doneBtnText: t('setting.doneStep'),
    steps: [
      {
        element: '.user-profile-container',
        popover: {
          side: 'top',
          title: t('setting.settingModel'),
          description: t('setting.tourHoverDescription'),
          showButtons: ['next'],
          nextBtnText: t('setting.tourUnderstood'),
          onNextClick: () => {
            // 结束引导并跳转到设置页面
            localStorage.setItem('tour_end', 'true');
            router.push({ path: '/setting/basic' });
            tourDriver.destroy();
          }
        }
      }
    ]
  });

  tourDriver.drive();
}

// 处理鼠标进入事件
const handleMouseEnter = () => {
  if (profileHideTimeout) {
    clearTimeout(profileHideTimeout)
    profileHideTimeout = null
  }
  showProfile.value = true;
  
  // 如果第一步引导正在进行中，关闭它
  if (tourDriver && tourDriver.isActive()) {
    tourDriver.destroy();
  }
}

// 处理鼠标离开事件
const handleMouseLeave = () => {
  if (profileHideTimeout) {
    clearTimeout(profileHideTimeout)
    profileHideTimeout = null
  }
  profileHideTimeout = setTimeout(() => {
    profileHideTimeout = null
    showProfile.value = false
  }, 160)
}



const selectedMenu = ref('task')
const visible = ref(false)
const isShowMenu = ref(false)
const chats = ref([])
const showProfile = ref(false)
let profileHideTimeout = null
const isAssistantPage = ref(false)
const isDigitalTwinPage = ref(false)
const isCollapsed = ref(false)



//检查是否配置模型
async function checkModel() {
  //判断有没有 localStorage.setItem('tour_end', 'true');
  if (localStorage.getItem('tour_end') == 'true') {
    localStorage.setItem('tour', 'false');
    return;
  }
  let res = await service.checkModel();
  if (res.has_default_platform && res.has_enabled_platform && res.has_search_setting) {
    localStorage.setItem('tour', 'false');
  } else {
    localStorage.setItem('tour', 'true');
    tour();
  }
}

const isMobile = ref(window.innerWidth <= 768)
const handleResize = () => {
  const newIsMobile = window.innerWidth <= 768
  if (isMobile.value && !newIsMobile && isShowMenu.value) {
    isShowMenu.value = false
  }
  isMobile.value = newIsMobile
}
onMounted(() => {
  checkModel();
  selectedMenu.value = localStorage.getItem('mode') || 'task'
  window.addEventListener('resize', handleResize)
  
  emitter.on('toggleMobileMenu', toggleMobileMenu)
  
  // Update active page states
  isAssistantPage.value = route.path === '/assistant'
  isDigitalTwinPage.value = route.path === '/digital-twin'
  
  watch(() => route.path, (newPath) => {
    isAssistantPage.value = newPath === '/assistant'
    isDigitalTwinPage.value = newPath === '/digital-twin'
  })
})
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  emitter.off('toggleMobileMenu', toggleMobileMenu)
})

const showMenu = computed(() => {
  // Force show menu for debugging Digital Twin visibility
  return true;
  // return !isMobile.value || isShowMenu.value
})

function changeMode(modeType) {
  closeOtherWindows()
  selectedMenu.value = modeType
  mode.value = modeType
  console.log("changeMode",modeType)
  const oldMode = localStorage.getItem('mode')
  if (oldMode !== modeType) {
    localStorage.setItem('mode', modeType)
    agent.value = {}
    chatStore.conversationId = null
  }

  if (modeType === 'task') {
    emitter.emit('close-collapse')
    chatStore.clearAgent()
  } else {
    chatStore.init(modeType)
  }
  
  if (isMobile.value && isShowMenu.value) {
    isShowMenu.value = false
    emitter.emit('mobileMenuStateChange', false)
  }
  
  router.push('/grace')
}

function toAssistant() {
  if (isMobile.value && isShowMenu.value) {
    isShowMenu.value = false
    emitter.emit('mobileMenuStateChange', false)
  }
  router.push('/assistant')
}

function toDigitalTwin() {
  if (isMobile.value && isShowMenu.value) {
    isShowMenu.value = false
    emitter.emit('mobileMenuStateChange', false)
  }
  router.push('/digital-twin')
}

function closeMenu() {
  if (!isMobile.value) return
  isShowMenu.value = false
  emitter.emit('mobileMenuStateChange', false)
}

function toggleMobileMenu(show) {
  if (!isMobile.value) return
  if (typeof show === 'boolean') {
    isShowMenu.value = show
  } else {
    isShowMenu.value = !isShowMenu.value
  }
  emitter.emit('mobileMenuStateChange', isShowMenu.value)
}

function closeOtherWindows() {
  emitter.emit('preview-close', false)
  emitter.emit('terminal-visible', false)
  emitter.emit('fullPreviewVisible-close')
}

const chatList = computed(() => chatStore.list)

const versionInfo = ref({
  localVersion: '0.4.0',
  latestVersion: '0.4.0',
  isLatest: true,
  updateUrl: 'https://github.com/yu-mengyun/vue-admin-template',
  message: 'the current version is the latest version',
})

const handleVersionClick = () => {
  //https://lemon-11.gitbook.io/lemonai/version-update
  window.open('https://lemon-11.gitbook.io/lemonai/version-update', '_blank')
}
</script>

<style scoped lang="less">
.left-menu {
  position: relative;
  display: flex;
  height: 100vh;
  width: 100%;
  z-index: 1000;
  background-color: rgba(0, 0, 0, 0.5);
  transition: opacity 2s ease;

  @media (min-width: 769px) {
    background-color: transparent;
    width: auto;
  }

  @media (max-width: 768px) {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 80%;
    max-width: 320px;
    background-color: transparent;
    z-index: 1000;
    
    .menu-panel {
      transform: translateX(-100%);
      transition: transform 0.3s ease;
      width: 100%;
    }
    
    &.menu-visible .menu-panel {
      transform: translateX(0);
    }
  }
}

.menu-panel {
  width: 248px;
  height: 100%;
  background-color: #f2f2f2;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;

  @media (max-width: 768px) {
    width: 80%;
    max-width: 320px;
  }
}

.menu-top {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.menu-header {
  padding: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.menu-actions {
  width: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .menu-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    font-size: 14px;
    cursor: pointer;
    border-radius: 10px;
    transition: background-color 0.2s;

    &:hover {
      background-color: #eaeaea;
    }

    &:active {
      background-color: #dcdcdc;
    }

    .truncate {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.menu-bottom {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

.user-profile-container {
  position: relative;
  padding-top: 10px;
}

.user-info-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  .user-info-text {
    display: flex;
    flex-direction: column;
    font-size: 12px;

    .user-name {
      font-weight: bold;
    }

    .user-plan {
      color: #999;
    }
  }
}

.profile-wrapper {
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 298px;
  padding: 10px 16px;
  font-size: 12px;
  background: #fff;
  border-radius: 6px;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.04);
  z-index: 1000000;
  
  &::before {
    content: '';
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    height: 10px;
    background: transparent;
  }
}

.version-text {
  font-size: 11px;
  color: #999;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
  user-select: none;
  
  &:hover {
    color: #000;
    background-color: #e5e5e5;
    transform: translateY(-1px);
  }
  
  &:active {
    transform: translateY(0);
  }
}

.second-menu {
  flex: 1;
}

.footer-social {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  border-top: 1px solid #e5e5e5;
  padding-top: 8px;
}

.footer-social-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: #666;
  text-decoration: none;
  border-radius: 6px;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    background-color: #eaeaea;
    color: #333;
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
}

.footer-social-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

</style>
