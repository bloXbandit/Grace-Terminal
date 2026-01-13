<template>
    <div class="image-zoom-container">
        <!-- Modal -->
        <transition name="fade">
            <teleport :to="teleportTarget" :disabled="!props.visible">
                <div v-if="props.visible" class="modal" :class="{ 'modal--viewport': isViewportTarget }" @click="handleClose">
                    <!-- Loading Animation -->
                    <!-- <div v-if="isLoading" class="loader">loading...</div> -->
                    <!-- Large Image -->
                    <img class="large-image" :src="props.url" alt="Large Image" @load="onImageLoad" @error="onImageError" />
                </div>
            </teleport>
        </transition>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

// Define Props
const props = defineProps({
    url: String, // Image URL
    visible: Boolean, // Modal visibility
    teleportTo: {
        type: String,
        default: ''
    }
});

// Define Emits
const emit = defineEmits(['close', 'update:visible']);

// Loading state
const isLoading = ref(true);

const teleportTarget = computed(() => {
    if (props.teleportTo) return props.teleportTo;
    // IMPORTANT: document.getElementById is not reactive; key off visible so this
    // recomputes at open-time when the Computer UI overlay mount exists.
    if (!props.visible) return 'body';
    return document.getElementById('computer-ui-overlay') ? '#computer-ui-overlay' : 'body';
});

const isViewportTarget = computed(() => {
    return teleportTarget.value === 'body';
});

// Image load handler
const onImageLoad = () => {
    if (props.url) {
        console.log("getFile", props.url)
        isLoading.value = false;
    }

};

// Image error handler
const onImageError = () => {
    isLoading.value = false;
    console.error('Image failed to load');
    // Optional: emit('error', 'Image failed to load');
};

// Close handler
const handleClose = () => {
    emit('update:visible', false);
    emit('close');
};

// ESC key handler
const handleEsc = (e) => {
    if (e.key === 'Escape' && props.visible) {
        emit('update:visible', false);
        emit('close');
    }
};

// Add and clean up event listener
onMounted(() => {
    window.addEventListener('keydown', handleEsc);
});
onUnmounted(() => {
    window.removeEventListener('keydown', handleEsc);
});
</script>

<style scoped>
.image-zoom-container {
    display: inline-block;
}

.modal {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    overflow: auto;
    /* Enable scrolling for oversized images */
}

.modal--viewport {
    position: fixed;
}

.large-image {
    max-width: 90%;
    max-height: 90%;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    /* Neumorphic shadow */
    touch-action: pinch-zoom;
    /* Enable pinch-to-zoom on mobile */
}

.loader {
    color: #fff;
    font-size: 16px;
    font-weight: bold;
    animation: pulse 1.5s infinite;
}

@keyframes pulse {
    0% {
        opacity: 1;
    }

    50% {
        opacity: 0.5;
    }

    100% {
        opacity: 1;
    }
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
    .large-image {
        max-width: 95%;
        max-height: 95%;
    }
}
</style>