<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

useHead({
  htmlAttrs: {
    class: 'dark bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] min-h-screen'
  }
})


useHead({
  htmlAttrs: {
    class: 'dark bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] min-h-screen'
  }
})

</script>

<template>
  <!-- Force Rebuild 2 -->
<NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
