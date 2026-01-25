import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'

interface DownloadOptions {
    url: string
    filename: string
    outputFolder: string
    maxSongsPerPlaylist?: number
    avoidFolders?: string[] // List of folders to avoid (e.g. for the second song of a pair)
}

interface DownloadResult {
    success: boolean
    path?: string
    folderUsed?: string
    error?: string
}

const logToFile = (msg: string) => {
    try {
        const logPath = join(process.cwd(), 'download_debug.log')
        const timestamp = new Date().toISOString()
        const line = `[${timestamp}] ${msg}\n`
        // Append synchronously to ensure we catch crashes
        const { appendFileSync } = require('node:fs')
        appendFileSync(logPath, line)
    } catch (e) {
        // console.error('Log failed', e) 
        // silent fail to avoid loops
    }
}

export const downloadManager = {
    /**
     * Sanitize filename: remove dashes, special chars, ensure .mp3
     */
    sanitizeFilename(name: string): string {
        // Remove dashes and underscores, replace with spaces
        let cleanName = name.replace(/[-_]/g, ' ')
        // Remove other special characters (keep alphanumeric and spaces)
        cleanName = cleanName.replace(/[^a-zA-Z0-9 ]/g, '')
        // Collapse multiple spaces
        cleanName = cleanName.replace(/\s+/g, ' ').trim()

        if (!cleanName) cleanName = 'Untitled Track'

        // Ensure extension
        if (!cleanName.toLowerCase().endsWith('.mp3')) {
            cleanName += '.mp3'
        }

        return cleanName
    },

    /**
     * Find the target folder (playlist-N)
     */
    findTargetFolder(root: string, maxSongs: number = 20, avoidFolders: string[] = []): string {
        let index = 1
        while (true) {
            const folderName = `playlist-${index}`
            const folderPath = join(root, folderName)

            // Check if we should avoid this folder
            if (avoidFolders.includes(folderPath)) {
                index++
                continue
            }

            if (!existsSync(folderPath)) {
                mkdirSync(folderPath, { recursive: true })
                return folderPath
            }

            // Check file count
            const files = readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.mp3'))
            if (files.length < maxSongs) {
                return folderPath
            }

            index++
        }
    },

    /**
     * Process Download
     */
    async process(opts: DownloadOptions): Promise<DownloadResult> {
        try {
            const { url, filename, outputFolder, maxSongsPerPlaylist = 20, avoidFolders = [] } = opts

            logToFile(`[Process] Request: ${filename}`)
            logToFile(`[Process] CWD: ${process.cwd()}`)
            logToFile(`[Process] URL: ${url}`)
            logToFile(`[Process] Out: ${outputFolder}`)
            logToFile(`[Process] Max: ${maxSongsPerPlaylist}`)

            // 1. Ensure Output Root Exists
            if (!existsSync(outputFolder)) {
                mkdirSync(outputFolder, { recursive: true })
            }

            // 2. Find Target Subfolder
            const targetFolder = this.findTargetFolder(outputFolder, maxSongsPerPlaylist, avoidFolders)
            logToFile(`[Process] Target: ${targetFolder}`)

            // 3. Prepare File Path
            const cleanName = this.sanitizeFilename(filename)
            const fullPath = join(targetFolder, cleanName)

            // 4. Download
            console.log(`[Downloader] Fetching ${url} -> ${fullPath}`)
            const response = await fetch(url)
            if (!response.ok) {
                const err = `HTTP Error ${response.status}: ${response.statusText}`
                logToFile(`[Process] Fetch Failed: ${err}`)
                throw new Error(err)
            }

            const arrayBuffer = await response.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)

            if (buffer.length < 1000) {
                logToFile(`[Process] File too small: ${buffer.length}`)
                throw new Error('File too small (corrupt download)')
            }

            // 5. Write
            writeFileSync(fullPath, buffer)
            console.log(`[Downloader] Saved to ${fullPath}`)
            logToFile(`[Process] Success: ${fullPath}`)

            return { success: true, path: fullPath, folderUsed: targetFolder }

        } catch (e: any) {
            console.error('[Downloader] Error:', e)
            logToFile(`[Process] Error: ${e.message}`)
            return { success: false, error: e.message }
        }
    }
}
