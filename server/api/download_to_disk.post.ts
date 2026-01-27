import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
// @ts-ignore
import { downloadManager } from '../utils/downloader'

const log = (msg: string) => {
    try {
        const { appendFileSync } = require('node:fs')
        appendFileSync('d:\\Projects D\\server_debug.log', `[${new Date().toISOString()}] ${msg}\n`)
    } catch (e) { }
}

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event)
        const { url, filename, avoidFolders = [], targetDownloads = false, workflowId, flat = false } = body
        let { outputFolder } = body

        if (targetDownloads) {
            const os = await import('node:os')
            outputFolder = join(os.homedir(), 'Downloads')
        }

        log(`API Request received: ${filename}`)
        log(`Target: ${outputFolder}`)
        log(`Avoid: ${JSON.stringify(avoidFolders)}`)
        log(`Target Downloads: ${targetDownloads}`)
        log(`Flat: ${flat}`)
        log(`Workflow ID: ${workflowId}`)
        log(`URL: ${url}`)

        if (!url || !filename || !outputFolder) {
            log('Missing fields')
            return { status: 'error', message: 'Missing required fields: url, filename, outputFolder' }
        }

        const db = useDB()
        let maxSongs = 20

        if (workflowId) {
            const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'playlistSize' AND workflow_id = ?").get(workflowId) as any
            if (settingsRow) maxSongs = parseInt(settingsRow.value)
        } else {
            // Fallback for legacy calls (though we should always pass it now)
            const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'playlistSize'").get() as any
            if (settingsRow) maxSongs = parseInt(settingsRow.value)
        }

        log(`Settings loaded. Max songs: ${maxSongs}`)

        const result = await downloadManager.process({
            url,
            filename,
            outputFolder,
            maxSongsPerPlaylist: maxSongs,
            avoidFolders: avoidFolders,
            flatStructure: targetDownloads || flat
        })

        if (!result.success) {
            log(`DownloadManager failed: ${result.error}`)
            return { status: 'error', message: result.error || 'Unknown download error' }
        }

        log(`Success: ${result.path} in ${result.folderUsed}`)
        return { status: 'success', path: result.path, folderUsed: result.folderUsed }

    } catch (e: any) {
        log(`CRITICAL API ERROR: ${e.message}`)
        console.error('[SaveToDisk Error]', e)
        return { status: 'error', message: e.message }
    }
})
