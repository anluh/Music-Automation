<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Switch from '@/components/ui/switch/Switch.vue'

const { workflows, refreshWorkflows, toggleWorkflow, init } = useWorkflows()
const newWorkflowName = ref('')
const isLoading = ref(false)

const createWorkflow = async () => {
    if (!newWorkflowName.value) return
    isLoading.value = true
    try {
        const res = await $fetch('/api/workflows/create', {
            method: 'POST',
            body: { name: newWorkflowName.value }
        }) as any
        if (res.success) {
            // Refresh list before navigating so it's there when we come back
            await refreshWorkflows()
            await navigateTo(`/workflow/${res.id}`)
        }
    } catch (e) {
        console.error('Failed to create', e)
    } finally {
        isLoading.value = false
    }
}

const deleteWorkflow = async (id: number) => {
    if (!confirm('Are you sure? This will delete all generations and settings for this workflow.')) return
    try {
        await $fetch('/api/workflows/delete', {
            method: 'POST',
            body: { id }
        })
        refreshWorkflows()
    } catch (e) {
        console.error('Failed to delete', e)
    }
}

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString() + ' ' + new Date(dateStr).toLocaleTimeString()
}

onMounted(() => {
    init()
})
</script>

<template>
<div class="container mx-auto p-10 max-w-5xl space-y-10">
    <header class="text-center space-y-4">
        <h1 class="text-5xl font-extrabold tracking-tighter bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Sonic Forge</h1>
        <p class="text-muted-foreground text-lg">Manage your automation workflows</p>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <!-- Create New -->
        <Card class="border-dashed border-2 border-white/10 bg-white/5 hover:bg-white/10 transition-colors flex flex-col justify-center items-center p-8 gap-4">
            <div class="w-full space-y-4">
                <Label>New Workflow Name</Label>
                <Input v-model="newWorkflowName" placeholder="e.g. Techno Experiments" @keyup.enter="createWorkflow" />
                <Button class="w-full" @click="createWorkflow" :disabled="!newWorkflowName || isLoading">
                    {{ isLoading ? 'Creating...' : 'Create Workflow' }}
                </Button>
            </div>
        </Card>

        <!-- List -->
        <Card v-for="wf in workflows" :key="wf.id" class="group relative overflow-hidden transition-all hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/20 bg-card/50 backdrop-blur-sm">
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            
            <CardHeader>
                <CardTitle class="text-xl tracking-tight">{{ wf.name }}</CardTitle>
                <CardDescription>Created: {{ formatDate(wf.created_at) }}</CardDescription>
            </CardHeader>
            <CardContent>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="h-2 w-2 rounded-full transition-all duration-500" :class="wf.is_active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-neutral-600'"></div>
                        <span class="text-xs text-muted-foreground uppercase tracking-widest font-semibold transition-colors" :class="wf.is_active ? 'text-green-500/80' : ''">{{ wf.is_active ? 'Autorun On' : 'Paused' }}</span>
                    </div>
                    <Switch :checked="!!wf.is_active" @update:checked="() => toggleWorkflow(wf.id)" />
                </div>
            </CardContent>
            <CardFooter class="flex justify-between border-t border-white/5 pt-4 bg-black/20">
                <Button variant="ghost" size="sm" class="text-destructive hover:text-red-400" @click.stop="deleteWorkflow(wf.id)">Delete</Button>
                <Button @click="navigateTo(`/workflow/${wf.id}`)" class="bg-indigo-600 hover:bg-indigo-500 text-white">Open</Button>
            </CardFooter>
        </Card>
    </div>
</div>
</template>
