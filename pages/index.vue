<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Slider } from '@/components/ui/slider'
import Switch from '@/components/ui/switch/Switch.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const mood = ref('')
const stylePrompt = ref('')

// Slider arrays
const weirdnessRange = ref([40, 60])
const styleRange = ref([40, 60])
const bpmRange = ref([100, 130])

const songCount = ref(1) // Default 1 pair (2 songs)
const outputFolder = ref('C:\\MusicOutput')
const autoDownload = ref(false)

const { data: generations, refresh, error } = await useFetch('/api/automation', {
  transform: (response: any) => response.data
})

// Polling
let pollInterval: NodeJS.Timeout
let autoProcessInterval: NodeJS.Timeout

const isLoading = ref(false)
const processingRowIds = ref<Set<number>>(new Set()) // Track multiple active IDs

// Modal State
const activeModalType = ref<'prompt' | 'lyrics' | null>(null)
const activeModalContent = ref('')

const openModal = (type: 'prompt' | 'lyrics', content: string) => {
    activeModalType.value = type
    activeModalContent.value = content
}

const closeModal = () => {
    activeModalType.value = null
    activeModalContent.value = ''
}

// Load Settings & Start Polling
onMounted(async () => {
    try {
        const settings = await $fetch('/api/settings') as any
        const d = settings.data || {}

        if (d.stylePrompt) stylePrompt.value = d.stylePrompt
        if (d.weirdnessRange) weirdnessRange.value = JSON.parse(d.weirdnessRange)
        if (d.styleRange) styleRange.value = JSON.parse(d.styleRange)
        if (d.bpmRange) bpmRange.value = JSON.parse(d.bpmRange)
        if (d.songCount) songCount.value = parseInt(d.songCount)
        if (d.outputFolder) outputFolder.value = d.outputFolder
        if (d.autoDownload) autoDownload.value = d.autoDownload === 'true'

        if (!d.outputFolder && d.defaultDownloadPath && outputFolder.value === 'C:\\MusicOutput') {
             outputFolder.value = d.defaultDownloadPath
        }
    } catch (e) {
        console.error('Failed to load settings', e)
    }

  // 1. General Data Refresh (UI sync)
  pollInterval = setInterval(() => {
    refresh()
  }, 3000)

  // 2. Automation Loop (Async Batch Processing)
  autoProcessInterval = setInterval(async () => {
    if (!generations.value) return
    
    // A. Batch Poll for Suno Updates
    try {
        await $fetch('/api/automation/poll_pending', { method: 'POST' })
    } catch (e) {
        console.error('Poll pending failed', e)
    }

    // B. Identify Next Actions for ALL items
    if (autoProcess.value) {
        const gens = generations.value as any[]
        const isBatchGenerating = gens.some(g => ['PENDING_GEMINI', 'PENDING_LYRICS', 'PENDING_MUSIC'].includes(g.status))

        gens.forEach(g => {
            if (g.status === 'COMPLETED') return
            if (processingRowIds.value.has(g.id)) return

            let shouldProcess = false

            if (g.status === 'PENDING_GEMINI') shouldProcess = true
            if (g.status === 'PENDING_MUSIC' && !g.suno_task_id) shouldProcess = true
            if (g.status === 'DOWNLOADING' && autoDownload.value) {
                 if (!isBatchGenerating) {
                     shouldProcess = true
                 }
            }

            if (shouldProcess) {
                console.log(`[Auto-Run] Triggering process for ID ${g.id} (${g.status})`)
                processRow(g.id)
            }
        })
    }
  }, 3000)
})

// Auto-Process Loop
const autoProcess = ref(false)
const toggleAutoProcess = () => {
  autoProcess.value = !autoProcess.value
}

const saveSettings = async () => {
    const settingsToSave = {
        stylePrompt: stylePrompt.value,
        weirdnessRange: JSON.stringify(weirdnessRange.value),
        styleRange: JSON.stringify(styleRange.value),
        bpmRange: JSON.stringify(bpmRange.value),
        songCount: songCount.value.toString(),
        outputFolder: outputFolder.value,
        autoDownload: autoDownload.value.toString()
    }

    try {
        await Promise.all(Object.entries(settingsToSave).map(([key, value]) => 
            $fetch('/api/settings', { method: 'POST', body: { key, value } })
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
        stylePrompt: stylePrompt.value,
        weirdnessMin: weirdnessRange.value[0],
        weirdnessMax: weirdnessRange.value[1],
        bpmMin: bpmRange.value[0],
        bpmMax: bpmRange.value[1],
        styleInfluenceMin: styleRange.value[0],
        styleInfluenceMax: styleRange.value[1],
        songCount: songCount.value,
        outputFolder: outputFolder.value 
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

const handleDownload = async (gen: any) => {
    if (autoDownload.value) {
        manualUpdateStatus(gen.id, 'DOWNLOADING')
        return
    }

    const outputTarget = outputFolder.value || 'C:\\MusicOutput'
    
    const saveToDisk = async (url: string, name: string) => {
        try {
            console.log(`Saving ${name} to ${outputTarget}...`)
            await $fetch('/api/download_to_disk', {
                method: 'POST',
                body: { 
                    url, 
                    filename: name, 
                    outputFolder: outputTarget 
                }
            })
            alert(`Saved: ${name}\nLocation: ${outputTarget}`)
        } catch (e: any) {
            console.error('Save failed', e)
            alert(`Failed to save ${name}: ${e.message}`)
        }
    }

    if (gen.audio_url_1) {
        saveToDisk(gen.audio_url_1, gen.song_name_1 || 'track1')
    }
    if (gen.audio_url_2) {
         setTimeout(() => {
             saveToDisk(gen.audio_url_2, gen.song_name_2 || 'track2')
         }, 1000)
    }
}

const downloadAll = async () => {
    if (!generations.value) return
    if (confirm('Download all available tracks? This will trigger multiple downloads.')) {
        const forceDownload = (url: string, name: string) => {
             const finalUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(name)}&t=${Date.now()}`
             const a = document.createElement('a')
             a.href = finalUrl
             a.download = name + '.mp3'
             document.body.appendChild(a)
             a.click()
             document.body.removeChild(a)
        }

        for (const gen of generations.value as any[]) {
             if (gen.audio_url_1) {
                 forceDownload(gen.audio_url_1, gen.song_name_1 || 'track1')
                 await new Promise(resolve => setTimeout(resolve, 500))
             }
             if (gen.audio_url_2) {
                 forceDownload(gen.audio_url_2, gen.song_name_2 || 'track2')
                 await new Promise(resolve => setTimeout(resolve, 500))
             }
        }
    }
}

const deleteRow = async (id: number) => {
    if(!confirm('Delete this generation task?')) return
    try {
        await $fetch('/api/automation/delete', {
            method: 'POST',
            body: { id }
        })
        refresh()
    } catch(e) {
        console.error(e)
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
  clearInterval(autoProcessInterval)
})
</script>

<template>
  <div class="container mx-auto p-6 max-w-6xl space-y-8 select-none">
    
    <!-- 1. Header Section -->
    <header class="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 pb-6 border-b border-primary/10">
        <div>
            <h1 class="text-4xl md:text-5xl font-extrabold tracking-tighter self-end">
                <span class="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Sonic</span>
                <span class="text-foreground">Forge</span>
            </h1>
            <p class="text-muted-foreground mt-1 text-sm font-medium tracking-wide">AI Music Automation Suite</p>
        </div>
        
        <div class="flex items-center gap-3">
             <Button variant="secondary" size="sm" @click="downloadAll" :disabled="autoDownload || !generations || generations.length === 0" class="hover:bg-primary/20 transition-colors">
                 Download All
             </Button>
             <Button 
                size="sm" 
                :class="autoProcess ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 border-0' : ''" 
                variant="outline"
                @click="toggleAutoProcess">
                 {{ autoProcess ? 'Auto-Run Active' : 'Enable Auto-Run' }}
             </Button>
        </div>
    </header>

    <!-- 2. Control Panel -->
    <section>
        <Card class="border-white/5 bg-black/20 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
            <CardHeader>
                <CardTitle class="text-xl flex items-center gap-2">
                    <span class="text-primary">✨</span> New Generation
                </CardTitle>
                <CardDescription>Configure your track parameters below.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
                <!-- Row 1: Main Inputs -->
                <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div class="md:col-span-8 space-y-2">
                        <Label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mood / Prompt</Label>
                        <div class="relative">
                            <Input v-model="mood" placeholder="Describe your sound (e.g., 'Dark synthwave with heavy bassline')" 
                                   class="h-12 text-md bg-background/50 border-white/10 focus:border-indigo-500 transition-all pl-4 shadow-inner" />
                        </div>
                    </div>
                    <div class="md:col-span-4 space-y-2">
                        <Label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Style Tag</Label>
                        <Input v-model="stylePrompt" placeholder="e.g. 'Techno'" class="h-12 bg-background/50 border-white/10" />
                    </div>
                </div>

                <!-- Row 2: Sliders -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 pt-2">
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

                <!-- Row 3: Settings -->
                <div class="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2 items-end">
                    <div class="md:col-span-2 space-y-2">
                         <Label class="text-xs">Batch Count</Label>
                         <Input type="number" min="1" max="50" v-model.number="songCount" class="bg-background/50 border-white/10" />
                    </div>
                    <div class="md:col-span-7 space-y-2">
                         <Label class="text-xs">Output Folder</Label>
                         <Input v-model="outputFolder" class="bg-background/50 border-white/10 font-mono text-xs" />
                    </div>
                    <div class="md:col-span-3 flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                        <Label for="auto-dl" class="text-xs cursor-pointer select-none">Auto Download</Label>
                        <Switch id="auto-dl" :checked="autoDownload" @update:checked="autoDownload = $event" />
                    </div>
                </div>
            </CardContent>
            <CardFooter class="bg-black/20 py-4 flex justify-end border-t border-white/5">
                <Button size="lg" @click="startAutomation" :disabled="isLoading || !mood" 
                        class="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border-0 shadow-lg shadow-indigo-500/20 text-white font-semibold tracking-wide">
                    {{ isLoading ? 'Initializing...' : 'Generate Tracks' }}
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
                                : (gen.status === 'PENDING_GEMINI' || gen.status === 'PENDING_LYRICS')
                                    ? 'border-purple-500/50 shadow-[0_0_30px_-5px_rgba(168,85,247,0.3)]'
                                    : 'hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10'
                          ]">
                        
                        <!-- Animated Shimmer Border for Pending Music -->
                        <div v-if="gen.status === 'PENDING_MUSIC'" class="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                            <div class="absolute top-0 left-0 w-[200%] h-full bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent animate-shimmer"></div>
                        </div>
                        <!-- Animated Shimmer for Gemini -->
                        <div v-if="gen.status === 'PENDING_GEMINI' || gen.status === 'PENDING_LYRICS'" class="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                            <div class="absolute top-0 left-0 w-[200%] h-full bg-gradient-to-r from-transparent via-purple-500/10 to-transparent animate-shimmer"></div>
                        </div>

                        <!-- Background Status Gradient (Subtle) -->
                        <div class="absolute inset-0 opacity-[0.03] transition-colors duration-500 pointer-events-none"
                             :class="{
                                 'bg-purple-500': gen.status === 'PENDING_GEMINI' || gen.status === 'PENDING_LYRICS',
                                 'bg-indigo-600': gen.status === 'PENDING_MUSIC',
                                 'bg-green-500': gen.status === 'COMPLETED',
                                 'bg-blue-500': gen.status === 'DOWNLOADING'
                             }">
                        </div>

                        <div class="flex flex-col md:flex-row items-center gap-4 p-4 relative z-10">
                            <!-- ID -->
                            <div class="text-xs font-mono text-muted-foreground w-8 text-center">#{{ index + 1 }}</div>
                            
                            <!-- Info -->
                            <div class="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <!-- Col 1: Song Names / Status -->
                                <div class="space-y-1">
                                    <div class="flex items-center gap-2">
                                        <!-- Special Music Generation Status -->
                                        <div v-if="gen.status === 'PENDING_MUSIC'" class="flex items-center gap-2 text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                            <!-- Animated Equalizer Icon -->
                                            <div class="flex gap-[2px] items-end h-3">
                                                <div class="w-1 bg-indigo-400 rounded-sm animate-music-bar-1"></div>
                                                <div class="w-1 bg-indigo-400 rounded-sm animate-music-bar-2"></div>
                                                <div class="w-1 bg-indigo-400 rounded-sm animate-music-bar-3"></div>
                                            </div>
                                            <span class="text-[10px] font-bold tracking-wide uppercase animate-pulse">Generating Music...</span>
                                        </div>

                                        <!-- Special Gemini Status -->
                                        <div v-else-if="gen.status === 'PENDING_GEMINI' || gen.status === 'PENDING_LYRICS'" class="flex items-center gap-2 text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin-slow"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m7.8 16.2-2.9 2.9"/><path d="M6 12H2"/><path d="m7.8 7.8-2.9-2.9"/></svg>
                                            <span class="text-[10px] font-bold tracking-wide uppercase animate-pulse">Dreaming...</span>
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
                                             :disabled="processingRowIds.has(gen.id)"
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
                                    class="h-10 w-10 rounded-full transition-all"
                                    :class="gen.status === 'COMPLETED' ? 'bg-green-600 hover:bg-green-500' : ''"
                                    @click.stop="handleDownload(gen)"
                                    :disabled="isLoading || processingRowIds.has(gen.id) || !gen.audio_url_1"
                                 >
                                    <span v-if="processingRowIds.has(gen.id) && gen.status === 'DOWNLOADING'" class="animate-spin">⏳</span>
                                    <svg v-else-if="gen.status === 'COMPLETED'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                 </Button>
                                 
                                 <!-- Delete -->
                                 <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:bg-destructive/10" @click="deleteRow(gen.id)">
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
                            {{ activeModalType === 'prompt' ? 'Lyric Prompt' : 'Generated Lyrics' }}
                        </h3>
                        <Button variant="ghost" size="icon" @click="closeModal" class="h-8 w-8 rounded-full hover:bg-white/10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </Button>
                    </div>
                    
                    <div class="p-6 overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap bg-black/20">
                         <template v-if="activeModalType === 'prompt'">
                             {{ isJson(activeModalContent) ? JSON.parse(activeModalContent).p1 : activeModalContent }}
                         </template>
                         <template v-else>
                             {{ isJson(activeModalContent) ? JSON.parse(activeModalContent).l1 : activeModalContent }}
                         </template>
                    </div>

                    <div class="p-4 border-t border-white/5 bg-white/5 flex justify-end">
                        <Button variant="default" size="sm" @click="closeModal">Close</Button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
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

</style>
