<template>
  <!-- <div>{{ message }}</div> -->
  <div style="display: flex; align-items: center" v-if="normalizedMessage.role === 'assistant' && normalizedMessage.is_temp && !normalizedMessage.meta">{{ content }} <LoadingDots /></div>
  <div v-else-if="normalizedMessage?.meta?.action_type === 'plan'">
    <Markdown :content="content" />
    <Planing :planing="normalizedMessage?.meta?.json" />
  </div>
  <div v-else-if="normalizedMessage?.meta?.action_type === 'update_status'">
    <LoadingOutlined />
    <span style="margin-left: 5px">{{ content }}</span>
  </div>
  <!-- Progress messages (e.g., video generation progress) -->
  <div v-else-if="normalizedMessage?.meta?.action_type === 'progress'" class="progress-message">
    <LoadingOutlined />
    <span style="margin-left: 5px">{{ content }}</span>
  </div>
  <!-- 代码编辑 -->
  <div v-else-if="normalizedMessage?.meta?.action_type === 'coding'">
    <CodingMessage :message="normalizedMessage" />
  </div>
  <!-- 停止 -->
  <div v-else-if="normalizedMessage?.meta?.action_type === 'stop'" class="stop">
    <Stop /> <span>{{ $t("stop_task") }}</span>
  </div>
  <!-- 任务异常 暂无积分-->
  <div v-else-if="normalizedMessage?.meta?.action_type === 'error' && normalizedMessage.content.includes('Insufficient credits balance')" class="credits">
    <div style="display: flex; align-items: center">
      <ShoppingCartOutlined class="icon" />
      <span>The task has been paused. Please upgrade plan or buy credits to continue.</span>
    </div>
    <a-button type="primary" v-if="route.name != 'share'" @click="handleUpgrade">Upgrade</a-button>
  </div>
  <!-- 任务异常 完成 -->
  <div v-else-if="normalizedMessage?.meta?.action_type === 'error'" class="error">
    <Failure /> <span>{{ $t("task_error") }}:{{ normalizedMessage?.content }}</span>
  </div>
  <Markdown v-else-if="normalizedMessage.role === 'assistant'" :content="content" />
  <span v-else>{{ content }}</span>
  <div class="file-list" v-if="showFiles">
    <MessageFileList :message="normalizedMessage" :role="normalizedMessage.role" :action_type="normalizedMessage?.meta?.action_type" />
  </div>
  <!-- <div v-if="message?.meta?.action_type === 'finish_summery'">
    <MessageRating :message="message" />
  </div> -->
</template>

<script setup>
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Markdown from "@/components/markdown/index.vue";
import LoadingDots from "@/view/lemon/components/LoadingDots.vue";
import { LoadingOutlined, ShoppingCartOutlined } from "@ant-design/icons-vue";
import Planing from "@/view/lemon/message/Planing.vue";
// import MessageRating from "@/view/lemon/components/MessageRating.vue";
import CodingMessage from "@/view/lemon/message/CodingMessage.vue";
import MessageFileList from "@/components/MessageFileList/index.vue";
import Stop from "@/assets/message/stop.svg";
import Failure from "@/assets/message/failure.svg";
import emitter from "@/utils/emitter";

const router = useRouter();
const route = useRoute();

const props = defineProps({
  message: {
    type: [Object, Array],
    required: true,
  },
});

const normalizedMessage = computed(() => {
  if (Array.isArray(props.message)) {
    return props.message[0] || { role: 'assistant', content: '', meta: {} };
  }
  return props.message;
});

const showFiles = computed(() => {
  const actions = new Set(["finish_summery", "question", "progress", "chat"]);
  return actions.has(normalizedMessage.value?.meta?.action_type);
});

const content = computed(() => {
  if (typeof normalizedMessage.value.content === 'string') {
    return normalizedMessage.value.content;
  }
  return normalizedMessage.value.content ? String(normalizedMessage.value.content) : '';
});

// 安全的JSON解析函数
const parseJsonSafely = (jsonString) => {
  try {
    if (!jsonString || typeof jsonString !== "string") {
      return null;
    }
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn("JSON parse error:", error);
    return null;
  }
};

// 检查是否应该显示文件列表 props.message?.meta?.action_type
const shouldShowFileList = () => {
  const actionType = normalizedMessage.value?.meta?.action_type;
  const isValidActionType = actionType === "finish_summery" || actionType === "question";
  console.log("isValidActionType", isValidActionType);
  if (!isValidActionType) {
    return false;
  }
  const jsonData = normalizedMessage.value?.meta?.json;
  console.log("jsonData", jsonData);
  return jsonData && Array.isArray(jsonData) && jsonData.length > 0;
};

//升级 emitter
const handleUpgrade = () => {
  emitter.emit("showUpgrade");
};
</script>

<style lang="scss" scoped>
code {
  max-width: 600px;
}

.stop {
  display: flex;
  width: 100%;
  color: #efa201;
  padding-top: 5px;
  padding-bottom: 5px;
  border-radius: 100px;
  gap: 0.375rem;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  background-color: #efa2011f;
  line-height: 18px;
  font-size: 13px;
  align-items: center;
  svg {
    min-width: 16px;
    min-height: 16px;
  }
}

.file-list {
  line-height: 0px !important;
}

.error {
  svg {
    min-width: 16px;
    min-height: 16px;
  }
  display: flex;
  width: 100%;
  color: #f25a5a;
  padding-top: 5px;
  padding-bottom: 5px;
  border-radius: 100px;
  gap: 0.375rem;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  background-color: #efa2011f;
  line-height: 18px;
  font-size: 13px;
  align-items: center;
}

.progress-message {
  display: flex;
  align-items: center;
  color: #1890ff;
  font-size: 14px;
  padding: 8px 0;
}

.credits {
  display: flex;
  align-items: center;
  color: #1a1a19;
  background-color: #fff; /* 更浅的黄色背景 */
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(55, 53, 47, 0.0392156863); /* 添加边框 */
  font-size: 13px;
  line-height: 1.5;
  gap: 8px;
  width: 100%;
  justify-content: space-between;
  // box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
}

.icon {
  font-size: 21px;
  color: #1a1a19;
  flex-shrink: 0;
  border-radius: 21px;
  padding: 5px;
}
</style>
