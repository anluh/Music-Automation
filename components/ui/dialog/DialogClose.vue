<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue'
import { DialogClose, type DialogCloseProps, useForwardProps } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<DialogCloseProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DialogClose
    v-bind="forwardedProps"
    :class="cn('', props.class)"
  >
    <slot />
  </DialogClose>
</template>
