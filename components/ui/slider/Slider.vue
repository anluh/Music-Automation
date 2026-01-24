<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import type { SliderRootEmits, SliderRootProps } from 'radix-vue'
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<SliderRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<SliderRootEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})
</script>

<template>
  <SliderRoot
    v-bind="delegatedProps"
    :class="cn(
      'relative flex w-full touch-none select-none items-center',
      props.class,
    )"
    @update:model-value="emits('update:modelValue', $event)"
  >
    <SliderTrack class="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderRange class="absolute h-full bg-primary" />
    </SliderTrack>
    <!-- Render thumbs dynamically based on value array length -->
     <template v-for="(_, index) in modelValue" :key="index">
        <SliderThumb
            v-if="modelValue"
            class="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        />
    </template>
  </SliderRoot>
</template>
