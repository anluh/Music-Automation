<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Slider } from '@/components/ui/slider'
import Switch from '@/components/ui/switch/Switch.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import StyleTagsModal from '@/components/StyleTagsModal.vue'

const mood = ref('')
// const stylePrompt = ref('') // Deprecated in favor of tags
const styleTags = ref<{ id: string, text: string, active: boolean }[]>([])
const showStyleModal = ref(false)

// Composable
const { init, getWorkflowState, toggleWorkflow, refreshWorkflows } = useWorkflows()

const route = useRoute()
const workflowId = computed(() => Number(route.params.id))
const workflowName = ref('')

// Reactive State from Global Store
const isWorkflowActive = computed(() => getWorkflowState(workflowId.value))

// Fetch Workflow Name (Legacy / Init)
const loadWorkflowDetails = async () => {
    try {
        await init()
        const res = await $fetch('/api/workflows') as any
        console.log('[LoadWorkflow] Workflows:', res.data.length)
        const wf = res.data.find((w: any) => w.id == workflowId.value)
        if (wf) { 
            workflowName.value = wf.name 
            console.log('[LoadWorkflow] Found:', wf.name)
        } else {
            console.warn('[LoadWorkflow] Not Found for ID:', workflowId.value)
        }
    } catch (e) {
        console.error('Failed to load workflow details', e)
    }
}
loadWorkflowDetails()

const activeStylePrompt = computed(() => {
    return styleTags.value.filter(t => t.active).map(t => t.text).join(', ')
})

// Slider arrays
const weirdnessRange = ref([40, 60])
const styleRange = ref([40, 60])
const bpmRange = ref([100, 130])

const songCount = ref(1) // Default 1 pair (2 songs)
const playlistSize = ref(20) // Default 20
const outputFolder = ref('C:\\MusicOutput')
const autoDownload = ref(false)
const vocalGender = ref([50])
const isInstrumental = ref(false)

const { data: generations, refresh, error } = await useFetch('/api/automation', {
  query: { workflowId },
  transform: (response: any) => response.data
})

// Polling
let pollInterval: NodeJS.Timeout

const isLoading = ref(false)
const isInteracting = ref(false) // Pause polling during user actions
const processingRowIds = ref<Set<number>>(new Set()) // Track multiple active IDs

// Modal State
const activeModalType = ref<'prompt' | 'lyrics' | 'delete' | null>(null)
const deletingId = ref<number | null>(null)
const activeModalContent = ref('')

const openModal = (type: 'prompt' | 'lyrics', content: string) => {
    activeModalType.value = type
    activeModalContent.value = content
}

const closeModal = () => {
    activeModalType.value = null
    activeModalContent.value = ''
    deletingId.value = null
}

const openStyleTagsModal = () => {
    console.log('Opening Style Tags Modal...')
    showStyleModal.value = true
}

// Load Settings & Start Polling
onMounted(async () => {
    // Init global store
    init()

    try {
        const settings = await $fetch('/api/settings', { query: { workflowId: workflowId.value } }) as any
        const d = settings.data || {}

        // if (d.stylePrompt) stylePrompt.value = d.stylePrompt // Legacy
        
        if (d.styleTags) {
             try {
                 styleTags.value = JSON.parse(d.styleTags)
             } catch (e) { console.error('Error parsing styleTags', e) }
        } else if (d.stylePrompt) {
             // Migration from legacy string
             const legacy = d.stylePrompt.split(',').map((s: string) => s.trim()).filter((s: string) => s)
             styleTags.value = legacy.map((text: string) => ({ id: Date.now().toString() + Math.random(), text, active: true }))
        }

        if (d.weirdnessRange) weirdnessRange.value = JSON.parse(d.weirdnessRange)
        if (d.styleRange) styleRange.value = JSON.parse(d.styleRange)
        if (d.bpmRange) bpmRange.value = JSON.parse(d.bpmRange)
        if (d.songCount) songCount.value = parseInt(d.songCount)
        if (d.playlistSize) playlistSize.value = parseInt(d.playlistSize)
        if (d.outputFolder) outputFolder.value = d.outputFolder
        if (d.autoDownload) autoDownload.value = d.autoDownload === 'true'

        if (!d.outputFolder && d.defaultDownloadPath && outputFolder.value === 'C:\\MusicOutput') {
             outputFolder.value = d.defaultDownloadPath
        }
        if (d.vocalGender) vocalGender.value = JSON.parse(d.vocalGender)
        if (d.isInstrumental) isInstrumental.value = d.isInstrumental === 'true'
    } catch (e) {
        console.error('Failed to load settings', e)
    }

  // 1. General Data Refresh (UI sync)
  pollInterval = setInterval(() => {
    if (!isInteracting.value) {
        refresh()
        // Sync global state too to catch up with backend/dashboard changes
        refreshWorkflows()
    }
  }, 3000)
})

const toggleWorkflowAutorun = async () => {
  await toggleWorkflow(workflowId.value)
}

// Auto-save tags on any change
watch([styleTags, outputFolder, playlistSize, songCount, autoDownload, vocalGender, isInstrumental], () => {
    saveSettings()
}, { deep: true })

const saveSettings = async () => {
    const settingsToSave = {
        stylePrompt: activeStylePrompt.value, // Save string for legacy/backend compatibility
        styleTags: JSON.stringify(styleTags.value),
        weirdnessRange: JSON.stringify(weirdnessRange.value),
        styleRange: JSON.stringify(styleRange.value),
        bpmRange: JSON.stringify(bpmRange.value),
        songCount: songCount.value.toString(),
        outputFolder: outputFolder.value,
        autoDownload: autoDownload.value.toString(),
        playlistSize: playlistSize.value.toString(),
        vocalGender: JSON.stringify(vocalGender.value),
        isInstrumental: isInstrumental.value.toString()
    }

    try {
        await Promise.all(Object.entries(settingsToSave).map(([key, value]) => 
            $fetch('/api/settings', { method: 'POST', body: { key, value, workflowId: workflowId.value } })
        ))
    } catch (e) {
        console.error('Failed to save settings', e)
    }
}

const startAutomation = async () => {
  if (!mood.value) return
  isLoading.value = true
  try {
    await $fetch('/api/automation', {
      method: 'POST',
      body: { 
        mood: mood.value, 
        stylePrompt: activeStylePrompt.value,
        tags: styleTags.value.filter(t => t.active).map(t => t.text),
        weirdnessMin: weirdnessRange.value[0],
        weirdnessMax: weirdnessRange.value[1],
        bpmMin: bpmRange.value[0],
        bpmMax: bpmRange.value[1],
        styleInfluenceMin: styleRange.value[0],
        styleInfluenceMax: styleRange.value[1],
        songCount: songCount.value,
        outputFolder: outputFolder.value,
        vocalGender: vocalGender.value[0],
        isInstrumental: isInstrumental.value,
        workflowId: workflowId.value
      }
    })
    mood.value = ''
    await saveSettings()
    refresh()
  } catch (e) {
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

const processRow = async (id: number) => {
  try {
    processingRowIds.value.add(id)
    await $fetch('/api/automation/process', {
      method: 'POST',
      body: { id, outputFolder: outputFolder.value }
    })
    refresh()
  } catch (e) {
    console.error(e)
  } finally {
    processingRowIds.value.delete(id)
  }
}

const downloadTrack = async (url: string, name: string, targetFolder: string, avoidFolders: string[] = [], targetDownloads: boolean = false) => {
    try {
        console.log(`[Download] Saving ${name} to ${targetFolder} (Downloads: ${targetDownloads})...`)
        const res = await $fetch('/api/download_to_disk', {
            method: 'POST',
            body: { 
                url, 
                filename: name, 
                outputFolder: targetFolder,
                avoidFolders,
                targetDownloads,
                workflowId: workflowId.value
            }
        }) as any
        
        console.log(`[Download] Success: ${name}`)
        if (res.path) console.log(`[Discovery] File Saved At: ${res.path}`)
        
        return { success: true, folderUsed: res.folderUsed }
    } catch (e: any) {
        console.error(`[Download] Failed ${name}`, e)
        throw e
    }
}

const handleDownload = async (gen: any) => {
    // Client-Side Download Sequence (Used for both Manual and Auto)
    
    // Prevent double-clicking or double-processing
    if (processingRowIds.value.has(gen.id)) return

    const base = outputFolder.value || 'C:\\MusicOutput'
    const outputTarget = workflowName.value ? `${base}\\${workflowName.value}` : base

    console.log('[HandleDownload] Base:', base)
    console.log('[HandleDownload] WorkflowName:', workflowName.value)
    console.log('[HandleDownload] OutputTarget:', outputTarget)

    try {
        // 1. UI: Show Spinner
        processingRowIds.value.add(gen.id)
        
        // 2. DB: Set status to DOWNLOADING
        await $fetch('/api/automation/update_status', {
            method: 'POST',
            body: { id: gen.id, status: 'DOWNLOADING' }
        })
        gen.status = 'DOWNLOADING' // Optimistic

        // 3. Perform Downloads Sequentially
        let usedFolder1 = ''

        if (gen.audio_url_1) {
            // Manual download -> Target Downloads folder (flat structure)
            const res = await downloadTrack(gen.audio_url_1, gen.song_name_1 || 'track1', outputTarget, [], false)
            usedFolder1 = res.folderUsed || ''
        }
        
        if (gen.audio_url_2) {
             await new Promise(resolve => setTimeout(resolve, 1000))
             
             // Logic: If song 1 went to playlist-N, song 2 must avoid N and N+1.
             // We can pass exact paths if we have them, or just let server handle it if we pass "playlist-1"
             const avoid = []
             if (usedFolder1) {
                 avoid.push(usedFolder1)
                 // Try to guess the next one
                 const match = usedFolder1.match(/playlist-(\d+)$/)
                 if (match) {
                     const idx = parseInt(match[1])
                     // Construct next folder path strictly
                     // Assuming usedFolder1 is full path, we replace the number
                     const nextFolder = usedFolder1.replace(`playlist-${idx}`, `playlist-${idx + 1}`)
                     avoid.push(nextFolder)
                 }
             }
             
             // Manual download -> Target Downloads folder (flat structure)
             await downloadTrack(gen.audio_url_2, gen.song_name_2 || 'track2', outputTarget, avoid, false)
        }

        // 4. Success: Set status to COMPLETED
        await $fetch('/api/automation/update_status', {
            method: 'POST',
            body: { id: gen.id, status: 'COMPLETED' }
        })
        gen.status = 'COMPLETED'
        refresh() 

    } catch (e: any) {
        console.error('Manual download sequence failed', e)
        // alert(`Download failed: ${e.message}`) // Suppress alert for auto-flow
    } finally {
        processingRowIds.value.delete(gen.id)
    }
}

// Watcher for Auto-Download
watch([generations, autoDownload], () => {
    if (!autoDownload.value || !generations.value) return
    
    // Find items ready to download
    const readyItems = generations.value.filter((g: any) => g.status === 'READY_TO_DOWNLOAD')
    
    readyItems.forEach(async (gen: any) => {
        if (!processingRowIds.value.has(gen.id)) {
            console.log(`[AutoDownload] Triggering download for ID ${gen.id}`)
            await handleDownload(gen)
        }
    })
}, { deep: true })

const downloadAll = async () => {
    console.log('[DownloadAll] Triggered')
    if (!generations.value || generations.value.length === 0) return

    const base = outputFolder.value || 'C:\\MusicOutput'
    const outputTarget = workflowName.value ? `${base}\\${workflowName.value}` : base
    
    // Count pending
    const items = generations.value as any[]
    const pendingItems = items.filter(g => g.status !== 'COMPLETED' && (g.audio_url_1 || g.audio_url_2))
    
    const mode = pendingItems.length > 0 ? 'PENDING' : 'ALL'
    const targets = mode === 'PENDING' ? pendingItems : items
    
    // Auto-proceed without native confirm to avoid browser blocking issues
    // Just inform via console/UI what is happening
    const msg = mode === 'PENDING' 
        ? `Downloading ${pendingItems.length} new tracks to ${outputTarget}...` 
        : `Redownloading all ${items.length} tracks to ${outputTarget}...`
    
    console.log(`[UI] ${msg}`)
    // alert(msg) // Optional: could re-enable if user wants feedback, but native dialogs are flaky here.

    let successCount = 0
    let failCount = 0
    let lastError = ''

    for (const gen of targets) {
        if (!gen.audio_url_1 && !gen.audio_url_2) continue

        try {
            if (gen.status !== 'COMPLETED' || mode === 'ALL') {
                gen.status = 'DOWNLOADING'
            }

            let usedFolder1 = ''

            if (gen.audio_url_1) {
                const res = await downloadTrack(gen.audio_url_1, gen.song_name_1 || 'track1', outputTarget)
                successCount++
                usedFolder1 = res.folderUsed || ''
                await new Promise(resolve => setTimeout(resolve, 500))
            }
            
            if (gen.audio_url_2) {
                const avoid = []
                if (usedFolder1) {
                     avoid.push(usedFolder1)
                     const match = usedFolder1.match(/playlist-(\d+)$/)
                     if (match) {
                         const idx = parseInt(match[1])
                         const nextFolder = usedFolder1.replace(`playlist-${idx}`, `playlist-${idx + 1}`)
                         avoid.push(nextFolder)
                     }
                }

                await downloadTrack(gen.audio_url_2, gen.song_name_2 || 'track2', outputTarget, avoid)
                successCount++
                await new Promise(resolve => setTimeout(resolve, 500))
            }

            await $fetch('/api/automation/update_status', {
                method: 'POST',
                body: { id: gen.id, status: 'COMPLETED' }
            })
            gen.status = 'COMPLETED'

        } catch (e: any) {
            failCount++
            lastError = e.message
            console.error(`Failed gen #${gen.id}`, e)
        }
    }

    if (failCount > 0) {
        alert(`Finished with errors.\nSuccess: ${successCount}\nFailed: ${failCount}\nLast Error: ${lastError}`)
    } else {
        // Success alert is fine at the end
        // alert(`Download Complete!`) 
    }
}


const deleteRow = (id: number) => {
    deletingId.value = id
    activeModalType.value = 'delete'
}

const confirmDelete = async () => {
    if (!deletingId.value) return
    const id = deletingId.value
    closeModal()
    
    isInteracting.value = true // Stop polling

    // Optimistic Update
    if (generations.value) {
        generations.value = generations.value.filter((g: any) => g.id !== id)
    }

    try {
        await $fetch('/api/automation/delete', {
            method: 'POST',
            body: { id }
        })
        console.log('[UI] Delete synced')
        await refresh() // Force one clean refresh
    } catch(e) {
        console.error(e)
        refresh() // Revert on failure
    } finally {
        isInteracting.value = false // Resume polling
    }
}

const manualUpdateStatus = async (id: number, status: string) => {
    try {
        await $fetch('/api/automation/update_status', {
            method: 'POST',
            body: { id, status }
        })
        await processRow(id)
    } catch (e) {
        console.error('Failed to update status', e)
    }
}

const isJson = (str: string) => {
    try {
        JSON.parse(str)
        return true
    } catch (e) {
        return false
    }
}

onUnmounted(() => {
  clearInterval(pollInterval)
})
</script>

<template>
  <div class="container mx-auto p-6 max-w-6xl space-y-8 select-none">
    
    <!-- 1. Header Section -->
    <header class="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 pb-6 border-b border-primary/10">
        <div>
            <div @click="navigateTo('/')" class="cursor-pointer group flex items-baseline gap-3 transition-all duration-300 hover:drop-shadow-[0_0_15px_rgba(139,92,246,0.5)]">
                <h1 class="text-4xl md:text-5xl font-extrabold tracking-tighter self-end">
                    <span class="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Track</span>
                    <span class="text-foreground">Tunnel</span>
                </h1>
                <span v-if="workflowName" class="text-2xl md:text-3xl font-bold text-indigo-400/80 tracking-tight">/ {{ workflowName }}</span>
            </div>
            <p class="text-muted-foreground mt-1 text-sm font-medium tracking-wide">
                AI Music Automation Suite 
            </p>
        </div>
        
        <div class="flex items-center gap-3">
             <!-- Dashboard Link Removed (Logo is link) -->
             <Button variant="secondary" size="sm" @click="downloadAll" :disabled="autoDownload || !generations || generations.length === 0" class="hover:bg-primary/20 transition-colors">
                 Download All
             </Button>
             <Button 
                size="sm" 
                :class="isWorkflowActive ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 border-0' : ''" 
                variant="outline"
                @click="toggleWorkflowAutorun">
                 {{ isWorkflowActive ? 'Automation Active' : 'Start Automation' }}
             </Button>
        </div>
    </header>

    <!-- 2. Control Panel -->
    <section>
        <Card class="border-white/5 bg-black/20 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
            <CardContent class="space-y-6">
                <!-- Row 1: Mood (Full Width) -->
                <div class="space-y-2 mt-5">
                    <Label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mood / Prompt</Label>
                    <div class="relative">
                        <Input v-model="mood" placeholder="Describe your sound (e.g., 'Dark synthwave with heavy bassline')" 
                               class="h-12 text-md bg-background/50 border-white/10 focus:border-indigo-500 transition-all pl-4 shadow-inner" />
                    </div>
                </div>

                <!-- Row 2: Main Controls (2 Columns) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-12 pt-2">
                    <!-- Left Column: Sliders -->
                    <div class="space-y-8">
                         <div class="space-y-4">
                            <div class="flex justify-between">
                                <Label class="text-xs">Weirdness</Label>
                                <span class="text-xs font-mono text-indigo-400">{{ weirdnessRange[0] }} - {{ weirdnessRange[1] }}%</span>
                            </div>
                            <Slider v-model="weirdnessRange" :max="100" :step="1" :min="0" class="col-span-2" />
                        </div>
                        <div class="space-y-4">
                            <div class="flex justify-between">
                                <Label class="text-xs">Style Influence</Label>
                                <span class="text-xs font-mono text-purple-400">{{ styleRange[0] }} - {{ styleRange[1] }}%</span>
                            </div>
                            <Slider v-model="styleRange" :max="100" :step="1" :min="0" />
                        </div>
                        <div class="space-y-4">
                            <div class="flex justify-between">
                                <Label class="text-xs">BPM Range</Label>
                                <span class="text-xs font-mono text-pink-400">{{ bpmRange[0] }} - {{ bpmRange[1] }}</span>
                            </div>
                            <Slider v-model="bpmRange" :min="60" :max="200" :step="1" />
                        </div>
                    </div>

                    <!-- Right Column: Style Tags & Vocal Settings -->
                    <div class="space-y-6">
                        <!-- Style Tags (Moved from top) -->
                        <div class="space-y-2">
                            <Label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex justify-between items-center">
                                Style Tags
                            </Label>
                            <div @click="openStyleTagsModal" 
                                 class="h-12 bg-background/50 border border-white/10 rounded-md p-2 flex items-center justify-center gap-2 overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-all shadow-inner relative group text-sm font-mono text-muted-foreground hover:text-foreground">
                                 
                                 <span v-if="styleTags.filter(t => t.active).length > 0">
                                     {{ styleTags.filter(t => t.active).length }} Active Style{{ styleTags.filter(t => t.active).length === 1 ? '' : 's' }}
                                 </span>
                                 <span v-else class="italic opacity-50">
                                     No active styles...
                                 </span>
                                 
                                 <div class="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 p-1 rounded-full opacity-50 group-hover:opacity-100 transition-opacity">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                                 </div>
                            </div>
                        </div>

                        <!-- Vocal Settings -->
                        <div class="space-y-4 rounded-lg bg-white/5 p-3 border border-white/5 transition-all duration-500 hover:border-white/10" :class="{ 'opacity-80': isInstrumental }">
                            <div class="flex justify-between items-center mb-2">
                                <Label class="text-xs font-semibold">Vocal Settings</Label>
                                <div class="flex items-center gap-2">
                                    <Label for="inst-mode-2" class="text-[10px] cursor-pointer select-none text-muted-foreground hover:text-white transition-colors">Instrumental</Label>
                                    <Switch id="inst-mode-2" :checked="isInstrumental" @update:checked="isInstrumental = $event" class="scale-75" />
                                </div>
                            </div>

                            <div class="transition-all duration-500 space-y-3" :class="{ 'opacity-30 pointer-events-none blur-[1px]': isInstrumental }">
                                 <div class="flex justify-between">
                                    <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Gender</span>
                                    <span class="text-[10px] font-mono text-cyan-400">
                                        {{ vocalGender[0] < 45 ? 'Masculine' : vocalGender[0] > 55 ? 'Feminine' : 'Balanced' }} {{ vocalGender[0] }}%
                                    </span>
                                </div>
                                <Slider v-model="vocalGender" :min="0" :max="100" :step="5" :disabled="isInstrumental" />
                                <div class="flex justify-between text-[10px] text-muted-foreground px-1 opacity-50">
                                    <span>Male</span>
                                    <span>Female</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>



                <!-- Row 3: Settings -->
                <div class="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2 items-end">
                     <div class="md:col-span-3 space-y-2">
                         <Label class="text-xs">Playlist Folder Songs Limit</Label>
                         <Input type="number" min="1" max="100" v-model.number="playlistSize" class="bg-background/50 border-white/10" placeholder="20" />
                    </div>
                    <div class="md:col-span-6 space-y-2">
                         <Label class="text-xs">Output Folder</Label>
                         <Input v-model="outputFolder" class="bg-background/50 border-white/10 font-mono text-xs" />
                    </div>
                    
                    <div class="md:col-span-3 flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                        <Label for="auto-dl" class="text-xs cursor-pointer select-none">Auto Download</Label>
                        <Switch id="auto-dl" :checked="autoDownload" @update:checked="autoDownload = $event" />
                    </div>
                </div>
            </CardContent>
            <CardFooter class="bg-black/20 py-4 flex justify-end items-center border-t border-white/5 gap-4">
                <div class="flex items-center gap-3">
                     <Label class="text-xs whitespace-nowrap">Batch Count:</Label>
                     <Input type="number" min="1" max="50" v-model.number="songCount" class="w-20 bg-background/50 border-white/10 text-center" />
                </div>
                
                <Button size="lg" @click="startAutomation" :disabled="isLoading || !mood" 
                        class="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border-0 shadow-lg shadow-indigo-500/20 text-white font-semibold tracking-wide">
                    {{ isLoading ? 'Initializing...' : 'Add to Playlist' }}
                </Button>
            </CardFooter>
        </Card>
    </section>

    <!-- 3. Generations List -->
    <section class="space-y-4">
        <div class="flex items-center justify-between px-2">
            <h2 class="text-lg font-semibold text-muted-foreground">Recent Generations</h2>
            <Badge variant="outline" class="font-mono text-[10px]">{{ generations?.length || 0 }} Items</Badge>
        </div>

        <div class="grid gap-3">
             <TransitionGroup name="list">
                <template v-for="(gen, index) in generations" :key="gen.id">
                    <Card class="group relative overflow-hidden transition-all duration-300 bg-card/60 backdrop-blur-sm"
                          :class="[
                              gen.status === 'PENDING_MUSIC' 
                                ? 'border-indigo-500/50 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]' 
                                : (gen.status === 'PENDING_GEMINI')
                                    ? 'border-purple-500/50 shadow-[0_0_30px_-5px_rgba(168,85,247,0.3)]'
                                : (gen.status === 'PENDING_LYRICS')
                                    ? 'border-pink-500/50 shadow-[0_0_30px_-5px_rgba(236,72,153,0.3)]'
                                    : 'hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10'
                          ]">
                        
                        <!-- Animated Shimmer for Music (Only if Active) -->
                        <div v-if="gen.status === 'PENDING_MUSIC' && (gen.suno_task_id || processingRowIds.has(gen.id))" class="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                            <div class="absolute top-0 left-0 w-[200%] h-full bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent animate-shimmer"></div>
                        </div>
                        <!-- Animated Shimmer for Gemini (Only if Active) -->
                        <div v-if="(gen.status === 'PENDING_GEMINI') && (isWorkflowActive || processingRowIds.has(gen.id))" class="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                            <div class="absolute top-0 left-0 w-[200%] h-full bg-gradient-to-r from-transparent via-purple-500/10 to-transparent animate-shimmer"></div>
                        </div>
                        <!-- Animated Shimmer for Lyrics (Only if Active) -->
                        <div v-if="(gen.status === 'PENDING_LYRICS') && (isWorkflowActive || processingRowIds.has(gen.id))" class="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                            <div class="absolute top-0 left-0 w-[200%] h-full bg-gradient-to-r from-transparent via-pink-500/10 to-transparent animate-shimmer"></div>
                        </div>

                        <!-- Background Status Gradient (Subtle) -->
                        <div class="absolute inset-0 opacity-[0.03] transition-colors duration-500 pointer-events-none"
                             :class="{
                                 'bg-purple-500': (gen.status === 'PENDING_GEMINI') && (isWorkflowActive || processingRowIds.has(gen.id)),
                                 'bg-pink-500': (gen.status === 'PENDING_LYRICS') && (isWorkflowActive || processingRowIds.has(gen.id)),
                                 'bg-indigo-600': gen.status === 'PENDING_MUSIC' && (gen.suno_task_id || processingRowIds.has(gen.id)),
                                 'bg-green-500': gen.status === 'COMPLETED',
                                 'bg-cyan-500': gen.status === 'READY_TO_DOWNLOAD',
                                 'bg-blue-500': gen.status === 'DOWNLOADING'
                             }">
                        </div>

                        <div class="flex flex-col md:flex-row items-center gap-4 p-4 relative z-10">
                            <!-- ID -->
                            <div class="text-xs font-mono text-muted-foreground w-8 text-center">#{{ (generations?.length || 0) - Number(index) }}</div>
                            
                            <!-- Info -->
                            <div class="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <!-- Col 1: Song Names / Status -->
                                <div class="space-y-1">
                                    <div class="flex items-center gap-2">
                                        <!-- Special Music Generation Status (Active) -->
                                        <div v-if="gen.status === 'PENDING_MUSIC' && (gen.suno_task_id || processingRowIds.has(gen.id))" class="flex items-center gap-2 text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                            <!-- Animated Equalizer Icon -->
                                            <div class="flex gap-[2px] items-end h-3">
                                                <div class="w-1 bg-indigo-400 rounded-sm animate-music-bar-1"></div>
                                                <div class="w-1 bg-indigo-400 rounded-sm animate-music-bar-2"></div>
                                                <div class="w-1 bg-indigo-400 rounded-sm animate-music-bar-3"></div>
                                            </div>
                                            <span class="text-[10px] font-bold tracking-wide uppercase animate-pulse">Generating Music...</span>
                                        </div>

                                        <!-- Special Music Generation Status (Ready/Waiting) -->
                                        <div v-else-if="gen.status === 'PENDING_MUSIC'" class="flex items-center gap-2 text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full border border-white/5">
                                             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                                            <span class="text-[10px] font-bold tracking-wide uppercase">Ready for Music</span>
                                        </div>

                                        <!-- READY TO DOWNLOAD -->
                                        <div v-else-if="gen.status === 'READY_TO_DOWNLOAD'" class="flex items-center gap-2 text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                            <span class="text-[10px] font-bold tracking-wide uppercase">Ready to Download</span>
                                        </div>

                                        <!-- Special Gemini Status (Active) -->
                                        <div v-else-if="(gen.status === 'PENDING_GEMINI') && (isWorkflowActive || processingRowIds.has(gen.id))" class="flex items-center gap-2 text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin-slow"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m7.8 16.2-2.9 2.9"/><path d="M6 12H2"/><path d="m7.8 7.8-2.9-2.9"/></svg>
                                            <span class="text-[10px] font-bold tracking-wide uppercase animate-pulse">Dreaming...</span>
                                        </div>

                                        <!-- Special Lyrics Status (Active) -->
                                        <div v-else-if="(gen.status === 'PENDING_LYRICS') && (isWorkflowActive || processingRowIds.has(gen.id))" class="flex items-center gap-2 text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-pulse"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            <span class="text-[10px] font-bold tracking-wide uppercase animate-pulse">Writing Lyrics...</span>
                                        </div>

                                        <!-- Standard Status -->
                                        <Badge v-else :variant="['COMPLETED', 'DOWNLOADING'].includes(gen.status) ? 'default' : 'secondary'" class="text-[10px]">
                                            {{ gen.status.replace('PENDING_', '').replace('_', ' ') }}
                                        </Badge>
                                        
                                        <span v-if="processingRowIds.has(gen.id) && !['PENDING_MUSIC', 'PENDING_GEMINI', 'PENDING_LYRICS'].includes(gen.status)" class="text-[10px] animate-pulse text-indigo-400">Processing...</span>
                                    </div>
                                    <div class="font-medium text-sm truncate" :title="gen.song_name_1">
                                        <span v-if="gen.song_name_1">1. {{ gen.song_name_1 }}</span>
                                        <span v-else class="italic opacity-50">...</span>
                                    </div>
                                    <div class="font-medium text-sm truncate opacity-80" :title="gen.song_name_2">
                                        <span v-if="gen.song_name_2">2. {{ gen.song_name_2 }}</span>
                                    </div>
                                </div>

                                <!-- Col 2: Actions & Links -->
                                <div class="flex flex-col justify-center space-y-2 text-xs">
                                    <div v-if="gen.lyric_prompt">
                                         <button @click="openModal('prompt', gen.lyric_prompt)" class="text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                            View Lyric Prompt
                                         </button>
                                    </div>
                                    <div v-if="gen.lyrics_content">
                                         <button @click="openModal('lyrics', gen.lyrics_content)" class="text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 transition-colors">
                                             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                             View Lyrics
                                         </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Actions -->
                            <div class="flex items-center gap-3 border-l border-white/5 pl-4 ml-2">
                                 <!-- Regen Buttons (Icon only) -->
                                 <div class="flex flex-col gap-1">
                                     <Button size="icon" variant="ghost" class="h-6 w-6 opacity-50 hover:opacity-100" 
                                             :disabled="processingRowIds.has(gen.id) || !!gen.audio_url_1"
                                             @click.stop="manualUpdateStatus(gen.id, 'PENDING_GEMINI')" title="Regen Info">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                                     </Button>
                                     <Button size="icon" variant="ghost" class="h-6 w-6 opacity-50 hover:opacity-100" 
                                             :disabled="processingRowIds.has(gen.id) || !gen.lyric_prompt"
                                             @click.stop="manualUpdateStatus(gen.id, 'PENDING_MUSIC')" title="Regen Music">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                                     </Button>
                                 </div>

                                 <!-- Download -->
                                 <Button 
                                    size="icon" 
                                    :variant="gen.status === 'COMPLETED' ? 'default' : 'outline'" 
                                    class="h-10 w-10 rounded-full transition-all group relative"
                                    :class="gen.status === 'COMPLETED' ? 'bg-green-600 hover:bg-green-500' : ''"
                                    @click.stop="handleDownload(gen)"
                                    :disabled="isLoading || processingRowIds.has(gen.id) || !gen.audio_url_1"
                                 >
                                    <span v-if="processingRowIds.has(gen.id) && gen.status === 'DOWNLOADING'" class="animate-spin">⏳</span>
                                    
                                    <!-- COMPLETED STATE: Swap Icons on Hover -->
                                    <template v-else-if="gen.status === 'COMPLETED'">
                                        <!-- Checkmark (Default Visible, Hover Hidden) -->
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" 
                                             class="absolute transition-all duration-300 opacity-100 scale-100 rotate-0 group-hover:opacity-0 group-hover:scale-75 group-hover:-rotate-90">
                                            <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                        <!-- Download (Default Hidden, Hover Visible) -->
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" 
                                             class="absolute transition-all duration-300 opacity-0 scale-75 rotate-90 group-hover:opacity-100 group-hover:scale-100 group-hover:rotate-0">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                                        </svg>
                                    </template>

                                    <!-- OTHER STATES: Default Download Icon -->
                                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                 </Button>
                                 
                                 <!-- Delete -->
                                 <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:bg-destructive/10" @click.stop="deleteRow(gen.id)">
                                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                 </Button>
                            </div>
                        </div>
                    </Card>
                </template>
             </TransitionGroup>

             <div v-if="!generations || generations.length === 0" class="text-center py-12 text-muted-foreground bg-black/10 rounded-xl border border-white/5 border-dashed">
                 <p class="text-lg">No generations yet</p>
                 <p class="text-sm">Start by creating a new track above.</p>
             </div>
        </div>
    </section>

    <!-- Global Modal (Teleport) -->
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="activeModalType" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click="closeModal">
                <div class="bg-card border border-white/10 text-card-foreground rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" @click.stop>
                    <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h3 class="font-semibold text-lg tracking-tight">
                            {{ activeModalType === 'prompt' ? 'Lyric Prompt' : activeModalType === 'lyrics' ? 'Generated Lyrics' : 'Confirm Deletion' }}
                        </h3>
                        <Button variant="ghost" size="icon" @click="closeModal" class="h-8 w-8 rounded-full hover:bg-white/10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </Button>
                    </div>
                    
                    <div class="p-6 overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap bg-black/20">
                         <template v-if="activeModalType === 'prompt'">
                             {{ isJson(activeModalContent) ? JSON.parse(activeModalContent).p1 : activeModalContent }}
                         </template>
                         <template v-else-if="activeModalType === 'lyrics'">
                             {{ isJson(activeModalContent) ? JSON.parse(activeModalContent).l1 : activeModalContent }}
                         </template>
                         <template v-else-if="activeModalType === 'delete'">
                             <div class="text-center py-4 space-y-2">
                                 <p class="text-base font-sans">Are you sure you want to delete this generation task?</p>
                                 <p class="text-muted-foreground text-xs font-sans">This action cannot be undone.</p>
                             </div>
                         </template>
                    </div>

                    <div class="p-4 border-t border-white/5 bg-white/5 flex justify-end gap-3">
                        <template v-if="activeModalType === 'delete'">
                            <Button variant="ghost" size="sm" @click="closeModal">Cancel</Button>
                            <Button variant="destructive" size="sm" @click="confirmDelete" class="bg-red-600 hover:bg-red-700 text-white">Delete</Button>
                        </template>
                        <Button v-else variant="default" size="sm" @click="closeModal">Close</Button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <StyleTagsModal 
        v-model="showStyleModal" 
        v-model:tags="styleTags" 
    />
  </div>
</template>

<style scoped>
.list-move, /* apply transition to moving elements */
.list-enter-active,
.list-leave-active {
  transition: all 0.5s cubic-bezier(0.55, 0, 0.1, 1);
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(30px);
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

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.animate-shimmer {
  animation: shimmer 2s infinite linear;
}

@keyframes music-bar {
  0%, 100% { height: 20%; }
  50% { height: 100%; }
}
.animate-music-bar-1 { animation: music-bar 0.6s infinite ease-in-out; }
.animate-music-bar-2 { animation: music-bar 0.8s infinite ease-in-out 0.1s; }
.animate-music-bar-3 { animation: music-bar 0.7s infinite ease-in-out 0.2s; }

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
