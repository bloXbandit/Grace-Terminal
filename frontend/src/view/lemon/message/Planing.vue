<template>
    <div class="planing">
        <div class="planing-item" v-for="(item, index) in planing" :key="item.id">
            <!-- {{ item }} -->
            <div class="planing-item-content" v-if="item.status && item.status != 'pending' ">
                <div class="planing-item-content-icon" :class="{
                    running: item.status === 'pending' || item.status === 'running',
                    error: item.status === 'failure'
                }">
                    <Success v-if="item.status == 'success' || item.status == 'completed' " />
                    <Failure v-if="item.status == 'failure'" />

                </div>
                <span class="planing-item-content-description">{{ getCleanDescription(item.description) }}</span>
                <div class="planing-item-content-collapse" :class="{ 'rotate-180': item.is_collapse }"
                    @click="toggleCollapse(item)">
                    <Collapse />
                </div>
            </div>
            <div class="loading" style="margin-top: 5px;" v-if="item.is_collapse && item.status && item.status == 'running' && (!item.actions || item.actions.length == 0)">
                <LoadingOutlined/><span>{{ $t('thinking') }}</span>
            </div>
            <div class="sub_planing" v-if="item.is_collapse && item.actions && item.actions.length > 0">
                <!-- 垂直虚线 v-if="index !== planing.length - 1" 判断是否有 border-->
                <div 
                    class="sub_planing-item-line" 
                    :class="{ 
                        'noborder': ( index == planing.length - 1 || item.status === 'running' )
                    }">
                    <div></div>
                </div>
                <div class="sub_planing-item-content">
                    <div class="sub_planing-item" v-for="(subItem,subIndex) in item.actions" :key="subItem.id">
                        <div class="sub_planing-item-action">
                            <Observation :action="subItem" v-if="subItem.content!=''" />
                        </div>
                        <div class="loading" v-if="subItem.status!='running' && subIndex== item.actions.length-1 && item.status=='running'">
                            <LoadingOutlined/><span>{{ $t('thinking') }}</span>
                        </div>
                    </div>
                   
                </div>

            </div>
            <!-- 虚线 最后一个不显示 -->
            <div class="planing-item-line" v-if="index !== planing.length - 1 && item.status && item.status != 'pending' ">
                <div></div>
            </div>
            <div class="planing-item-err" v-if="item.status == 'failure'">
                <div class="planing-item-line" :class="{ 'noborder': ( index == planing.length - 1 || item.status === 'running' ) }">
                    <div></div>
                </div>
                <div>
                    <a-alert v-if="item.meta.json.comments.indexOf('Insufficient credits balance') == -1" :message="item.meta.json.comments" type="error" />
                </div>
            </div>


        </div>
    </div>
</template>

<script setup>
import Success from '@/assets/message/success.svg'
import Failure from '@/assets/message/failure.svg'
import Collapse from '@/assets/message/collapse.svg'
import Observation from './Observation.vue'
import { LoadingOutlined } from '@ant-design/icons-vue';
import { formatTime } from '@/utils/time';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
//complete.svg

import { onMounted } from 'vue'

const props = defineProps({
    planing: {
        type: Array,
        required: true
    }
})

//默认 item.is_collapse 为 false (collapsed by default)

onMounted(() => {
    props.planing.forEach(item => {
        item.is_collapse = false
    })
})


const toggleCollapse = (item) => {
    console.log(item)
    item.is_collapse = !item.is_collapse
}

// Clean up phase descriptions and make them more personality-driven
const getCleanDescription = (description) => {
    if (!description) return '';
    
    // Remove "Phase X:" prefixes and make descriptions more friendly
    let cleaned = description.replace(/^Phase\s+\d+:\s*/i, '');
    
    // Map common planning terms to more personality-driven alternatives
    const friendlyMappings = {
        'Planning': '🧠 Thinking',
        'Analysis': '🔍 Analyzing', 
        'Research': '🔎 Researching',
        'Implementation': '⚡ Building',
        'Execution': '🚀 Executing',
        'Generation': '✨ Creating',
        'Processing': '⚙️ Processing',
        'Validation': '✅ Validating',
        'Completion': '🎯 Finishing',
        'Review': '👀 Reviewing',
        'Testing': '🧪 Testing',
        'Optimization': '⚡ Optimizing'
    };
    
    // Apply friendly mappings
    for (const [formal, friendly] of Object.entries(friendlyMappings)) {
        if (cleaned.toLowerCase().includes(formal.toLowerCase())) {
            cleaned = cleaned.replace(new RegExp(formal, 'gi'), friendly);
            break; // Only replace the first match to avoid over-processing
        }
    }
    
    // If no specific mapping found, add a thinking emoji for generic descriptions
    if (!cleaned.match(/^[🧠🔍🔎⚡✨⚙️✅🎯👀🧪]/)) {
        // Check if it's a thinking/planning type activity
        if (cleaned.toLowerCase().match(/think|plan|consider|analyze|process/)) {
            cleaned = '🧠 ' + cleaned;
        } else if (cleaned.toLowerCase().match(/creat|generat|build|make/)) {
            cleaned = '✨ ' + cleaned;
        } else if (cleaned.toLowerCase().match(/execut|run|perform/)) {
            cleaned = '⚡ ' + cleaned;
        } else {
            cleaned = '💭 ' + cleaned;
        }
    }
    
    return cleaned;
}

const isLastPending = (item, index) => {
    const lastPendingIndex = this.planing
      .map((item, idx) => item.status === 'pending' ? idx : -1)
      .filter(idx => idx !== -1)
      .pop(); // 获取最后一个符合条件的索引

    return index === lastPendingIndex;
}



</script>

<style scoped lang="scss">

.loading{
    font-size: 14px;
    span{
        margin-left: 5px;
    }
}
.planing {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
}

.planing-item-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.planing-item-content-icon {
    color: #fff;
    background-color: #b9b9b7;
    border: 1px solid #0000001f;
    border-radius: 15px;
    width: 1rem;
    height: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
}

.planing-item-content-description{
    width: calc(100% - 1rem - 32px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.planing-item-err-icon {
    width: 1rem;
    height: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
}

.planing-item-err {
    display: flex;
    font-size: 14px;
    padding-bottom: 8px;
}



.running {
    background-color: #fff !important;
}

.error {
    background-color: #f25a5a !important;
}

.planing-item-content-collapse {
    width: 1rem;
    height: 1rem;
    cursor: pointer;



    display: inline-block;
    transition: transform 0.3s ease-in-out;
    /* 添加平滑动画 */
}

.planing-item-line {
    width: 16px;
    min-width: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;

    div {
        border: 1px dashed #0000001f;
        height: 100%;
    }
}

.sub_planing {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
}

.sub_planing-item {
    display: flex;
    flex-direction: column;
    gap: .75rem;
    color: #535350;
    font-size: 14px;
}

.sub_planing-item-line {
    width: 16px;
    min-width: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;

    div {
        border: 1px dashed #0000001f;
        height: 100%;
    }
}

.noborder {
    div {
        border: unset !important;
    }
}

.sub_planing-item-content {
    padding: 12px 0px;
    width: calc(100% - 16px);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

/* 旋转 180 度的样式 */
.rotate-180 {
    transform: rotate(180deg);

    display: flex;
    justify-content: center;
    align-content: center;
    align-items: center;
}

.planing-item-content-time {
    font-size: 12px;
    color: #858481;
    position: absolute;
    right: 0px;
    display: none;
}

.sub_planing-item-action-item {
    display: flex;
    flex-direction: row;
    align-items: center;

    .sub_planing-item-action-item-time {
        font-size: 12px;
        color: #858481;
        position: absolute;
        right: 0px;
        display: none;
    }
}

@media (hover: hover) {
    .planing-item-content:hover {
        .planing-item-content-time {
            display: block;
        }
    }

    .sub_planing-item-action-item:hover {
        .sub_planing-item-action-item-time {
            display: block;
        }
    }
}
</style>