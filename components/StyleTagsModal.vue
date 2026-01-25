<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import Switch from '@/components/ui/switch/Switch.vue' 

interface StyleTag {
  id: string
  text: string
  active: boolean
}

const props = defineProps<{
  modelValue: boolean
  tags: StyleTag[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:tags', value: StyleTag[]): void
}>()

const newTagText = ref('')
const localTags = ref<StyleTag[]>([])

// Only initialize/reset local state when the modal triggers to OPEN
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    localTags.value = JSON.parse(JSON.stringify(props.tags)) 
  }
}, { immediate: true })

// Sync active state back to parent immediately on change
watch(localTags, (newVal) => {
  emit('update:tags', newVal)
}, { deep: true })

const closeModal = () => {
  emit('update:modelValue', false)
}

const addTag = () => {
  if (!newTagText.value.trim()) return
  
  localTags.value.push({
    id: Date.now().toString(),
    text: newTagText.value.trim(),
    active: true
  })
  newTagText.value = ''
}

const removeTag = (id: string) => {
  localTags.value = localTags.value.filter(t => t.id !== id)
}

const moveTag = (index: number, direction: 'up' | 'down') => {
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= localTags.value.length) return
  
  const temp = localTags.value[index]
  localTags.value[index] = localTags.value[newIndex]
  localTags.value[newIndex] = temp
}

const toggleActive = (index: number) => {
  // Direct mutation of local state triggers the watcher
  localTags.value[index].active = !localTags.value[index].active
}

// Editing
const editingId = ref<string | null>(null)
const editingText = ref('')

const startEdit = (tag: StyleTag) => {
    editingId.value = tag.id
    editingText.value = tag.text
    
    // Focus logic
    nextTick(() => {
        const input = document.getElementById(`edit-input-${tag.id}`) as HTMLInputElement
        if (input) {
            input.focus()
            input.select()
        }
    })
}

const saveEdit = () => {
    if (editingId.value && editingText.value.trim()) {
        const tag = localTags.value.find(t => t.id === editingId.value)
        if (tag) tag.text = editingText.value.trim()
    }
    editingId.value = null
    editingText.value = ''
}

const cancelEdit = () => {
    editingId.value = null
    editingText.value = ''
}

// Drag and Drop
const draggedIndex = ref<number | null>(null)

const onDragStart = (e: DragEvent, index: number) => {
    draggedIndex.value = index
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.dropEffect = 'move'
    }
}

const onDragOver = (e: DragEvent) => {
    e.preventDefault() // Necessary to allow dropping
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move'
    }
}

const onDrop = (e: DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex.value === null) return
    if (draggedIndex.value === dropIndex) return

    // Reorder
    const item = localTags.value[draggedIndex.value]
    localTags.value.splice(draggedIndex.value, 1)
    localTags.value.splice(dropIndex, 0, item)
    
    draggedIndex.value = null
}

const onDragEnd = () => {
    draggedIndex.value = null
}

</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" @click="closeModal">
        <div class="bg-card border border-white/10 text-card-foreground rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" @click.stop>
          
          <!-- Header -->
          <div class="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
            <div>
                <h3 class="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Style Tags Manager</h3>
                <p class="text-xs text-muted-foreground mt-1">Manage, order, and activate your musical styles.</p>
            </div>
            <Button variant="ghost" size="icon" @click="closeModal" class="h-8 w-8 rounded-full hover:bg-white/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </Button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6 bg-black/20">
            
            <!-- Input Area -->
            <div class="flex gap-3">
                <Input 
                    v-model="newTagText" 
                    @keyup.enter="addTag"
                    placeholder="Enter a style tag (e.g. 'Cyberpunk', 'Lo-fi')" 
                    class="h-11 bg-background/50 border-white/10 focus:border-indigo-500 shadow-inner block w-full"
                />
                <Button @click="addTag" :disabled="!newTagText.trim()" class="h-11 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium">
                    Add
                </Button>
            </div>

            <!-- Tags List -->
            <div class="space-y-3">
                <div v-if="localTags.length === 0" class="text-center py-8 text-muted-foreground border border-dashed border-white/10 rounded-lg bg-white/5">
                    No tags added yet.
                </div>

                <TransitionGroup name="list">
                    <div v-for="(tag, index) in localTags" :key="tag.id" 
                         class="group flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-card/40 hover:bg-card/60 transition-all duration-200 cursor-move"
                         :class="{ 
                             'opacity-60 grayscale-[0.5]': !tag.active,
                             'border-indigo-500/50 bg-indigo-500/10': draggedIndex === index,
                             'opacity-50': draggedIndex !== null && draggedIndex !== index
                         }"
                         draggable="true"
                         @dragstart="onDragStart($event, index)"
                         @dragover="onDragOver"
                         @drop="onDrop($event, index)"
                         @dragend="onDragEnd">
                        
                        <!-- Drag Handle -->
                        <div class="text-muted-foreground/30 group-hover:text-muted-foreground transition-colors mr-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                        </div>

                        <!-- Active Toggle -->
                        <div class="flex items-center">
                             <Switch :checked="tag.active" @update:checked="toggleActive(index)" />
                        </div>

                        <!-- Content -->
                        <!-- Content -->
                        <div v-if="editingId === tag.id" class="flex-1 min-w-0 pr-2">
                            <Input 
                                :id="`edit-input-${tag.id}`"
                                v-model="editingText" 
                                class="h-8 text-sm bg-black/40 border-indigo-500/50 focus:border-indigo-500 edit-input"
                                @keyup.enter="saveEdit"
                                @keyup.esc="cancelEdit"
                                @blur="saveEdit"
                            />
                        </div>
                        <div v-else 
                             class="flex-1 font-mono text-sm truncate cursor-text hover:text-indigo-300 transition-colors" 
                             :class="{ 'line-through text-muted-foreground': !tag.active, 'text-foreground': tag.active }"
                             @dblclick="startEdit(tag)"
                             title="Double click to edit">
                            {{ tag.text }}
                        </div>

                        <!-- Actions -->
                        <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                            <Button v-if="editingId !== tag.id" variant="ghost" size="icon" @click="startEdit(tag)" class="h-8 w-8 text-muted-foreground hover:text-indigo-400 hover:bg-indigo-400/10">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                            </Button>
                            <Button variant="ghost" size="icon" @click="removeTag(tag.id)" class="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-400/10">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </Button>
                        </div>
                    </div>
                </TransitionGroup>
            </div>

          </div>

          <!-- Footer -->
          <div class="p-4 border-t border-white/5 bg-white/5 flex justify-between items-center text-xs text-muted-foreground">
             <span>{{ localTags.filter(t => t.active).length }} active tags</span>
             <Button variant="outline" size="sm" @click="closeModal" class="border-white/10 hover:bg-white/10">Done</Button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
.list-leave-active {
  position: absolute;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
