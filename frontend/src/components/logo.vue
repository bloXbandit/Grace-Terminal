<template>
    <div class="logo-title">
        <img src="@/assets/image/lemon.png" alt="Grace AI" class="logo-image" />
        <!-- <span class="beta-tag">Beta</span> -->
    </div>
</template>
<script setup> 
// Using Grace logo image for branding
</script>
<style scoped> 
.logo-title {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
}

.logo-image {
    width: 192px;
    height: 192px;
    object-fit: contain;
}

.beta-tag {
    font-size: 11px;
    background-color: #FFD43B;
    color: #fff;
    padding: 2px 6px;
    border-radius: 8px;
    margin-left: 8px;
}

</style>