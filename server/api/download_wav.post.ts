import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
// @ts-ignore
import { downloadManager } from '../utils/downloader'
import { kie } from '../utils/kie'
import { useDB } from '../utils/db'

const log = (msg: string) => {
    try {
        const { appendFileSync } = require('node:fs')
        appendFileSync('d:\\Projects D\\server_debug.log', `[${new Date().toISOString()}] ${msg}\n`)
    } catch (e) { }
}

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event)
        const { url, filename, avoidFolders = [], workflowId, genId } = body

        const os = await import('node:os')
        const outputFolder = join(os.homedir(), 'Downloads')

        const targetDownloads = true
        const flat = true

        log(`API Request received (WAV): ${filename}`)
        log(`Target: ${outputFolder}`)
        log(`Avoid: ${JSON.stringify(avoidFolders)}`)
        log(`Workflow ID: ${workflowId}`)
        log(`URL: ${url}`)
        log(`Gen ID: ${genId}`)

        if (!url || !filename || !outputFolder || !genId) {
            log('Missing fields')
            return { status: 'error', message: 'Missing required fields: url, filename, genId' }
        }

        const db = useDB()

        // Find task ID from DB 
        const genRow = db.prepare('SELECT suno_task_id, workflow_id FROM generations WHERE id = ?').get(genId) as any

        if (!genRow || !genRow.suno_task_id) {
            return { status: 'error', message: 'Task ID not found for this generation' }
        }

        const taskId = genRow.suno_task_id
        const effectiveWorkflowId = genRow.workflow_id || workflowId || 1
        const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'kieApiKey' AND workflow_id = ?").get(effectiveWorkflowId) as any
        const kieApiKey = apiKeyRow?.value || undefined

        // Fetch task info to find the correct audioId
        const taskInfo = await kie.getTaskInfo(taskId, kieApiKey)
        let audioId = ''

        if (taskInfo && taskInfo.response) {
            const clips = taskInfo.response.sunoData || taskInfo.response.clips || []
            // Match the stored audio_url to the clip to find its true ID
            const match = clips.find((c: any) => c.audioUrl === url || c.sourceAudioUrl === url || url.includes(c.id))
            if (match) {
                audioId = match.id
            }
        }

        if (!audioId) {
            log(`Warning: Could not find audioId for url ${url} in task ${taskId}.`)
            return { status: 'error', message: 'True Audio ID not found. Generation might be missing.' }
        }

        log(`Extracted Audio ID: ${audioId} for Task ID: ${taskId}`)

        // 1. Request WAV conversion
        let wavTaskId = ''
        try {
            const wavRes = await kie.generateWav(taskId, audioId, 'https://google.com', kieApiKey)
            if (wavRes && wavRes.taskId) {
                wavTaskId = wavRes.taskId
            } else {
                return { status: 'error', message: 'Did not receive a WAV task ID' }
            }
        } catch (e: any) {
            log(`Generate WAV threw an error (might exist already): ${e.message}`)
            return { status: 'error', message: `WAV generation failed to start: ${e.message}` }
        }

        log(`Started WAV generation task: ${wavTaskId}`)

        // 2. Poll for completion
        let attempts = 0
        const maxAttempts = 30 // 30 * 2 = 60 seconds
        let wavUrl = ''

        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 2000))
            try {
                // Poll the NEW wav task ID, not the original music generation one
                const info = await kie.getWavTask(wavTaskId, kieApiKey)
                if (info) {
                    const statusVal = info.successFlag || info.status || ''
                    if (statusVal === 'SUCCESS') {
                        wavUrl = info.response?.audioWavUrl || info.audioWavUrl || info.mediaUrl || info.audioUrl || ''
                        if (wavUrl) break
                    } else if (statusVal === 'FAILED') {
                        return { status: 'error', message: 'WAV conversion failed at provider' }
                    }
                    log(`Polling WAV... Status: ${statusVal}`)
                }
            } catch (pollErr: any) {
                log(`Poll Error: ${pollErr.message}`)
            }
            attempts++
        }

        if (!wavUrl) {
            return { status: 'error', message: 'WAV conversion timed out' }
        }

        let maxSongs = 20

        if (effectiveWorkflowId) {
            const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'playlistSize' AND workflow_id = ?").get(effectiveWorkflowId) as any
            if (settingsRow) maxSongs = parseInt(settingsRow.value)
        } else {
            const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'playlistSize'").get() as any
            if (settingsRow) maxSongs = parseInt(settingsRow.value)
        }

        log(`Settings loaded. Max songs: ${maxSongs}`)

        const result = await downloadManager.process({
            url: wavUrl,
            filename,
            outputFolder,
            maxSongsPerPlaylist: maxSongs,
            avoidFolders: avoidFolders,
            flatStructure: targetDownloads || flat,
            isWav: true
        })

        if (!result.success) {
            log(`DownloadManager failed: ${result.error}`)
            return { status: 'error', message: result.error || 'Unknown download error' }
        }

        log(`Success (WAV): ${result.path} in ${result.folderUsed}`)
        return { status: 'success', path: result.path, folderUsed: result.folderUsed }

    } catch (e: any) {
        log(`CRITICAL API ERROR (WAV): ${e.message}`)
        console.error('[SaveToDisk Error WAV]', e)
        return { status: 'error', message: e.message }
    }
})
