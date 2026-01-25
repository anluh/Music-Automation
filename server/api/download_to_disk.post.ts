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
        const { url, filename, outputFolder, avoidFolders = [] } = body

        log(`API Request received: ${filename}`)
        log(`Target: ${outputFolder}`)
        log(`Avoid: ${JSON.stringify(avoidFolders)}`)
        log(`URL: ${url}`)

        if (!url || !filename || !outputFolder) {
            log('Missing fields')
            return { status: 'error', message: 'Missing required fields: url, filename, outputFolder' }
        }

        const db = useDB()
        const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'playlistSize'").get() as any
        const maxSongs = settingsRow ? parseInt(settingsRow.value) : 20
        log(`Settings loaded. Max songs: ${maxSongs}`)

        const result = await downloadManager.process({
            url,
            filename,
            outputFolder,
            maxSongsPerPlaylist: maxSongs,
            avoidFolders: avoidFolders
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
