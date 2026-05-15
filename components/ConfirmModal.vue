<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  open: boolean
  title?: string
  description?: string
  confirmText?: string
  variant?: 'default' | 'destructive'
}>()

const emit = defineEmits(['update:open', 'confirm'])

const onConfirm = () => {
    emit('confirm')
    emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ title || 'Are you sure?' }}</DialogTitle>
        <DialogDescription>
          {{ description || 'This action cannot be undone.' }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button :variant="variant || 'default'" @click="onConfirm">{{ confirmText || 'Confirm' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
