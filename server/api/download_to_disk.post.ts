import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event)
        const { url, filename, outputFolder } = body

        if (!url || !filename || !outputFolder) {
            throw createError({ statusCode: 400, statusMessage: 'Missing required fields: url, filename, outputFolder' })
        }

        console.log(`[SaveToDisk] Request: ${filename} -> ${outputFolder}`)

        // Ensure output directory exists (create if not)
        if (!existsSync(outputFolder)) {
            mkdirSync(outputFolder, { recursive: true })
        }

        // Fetch the file
        console.log(`[SaveToDisk] Fetching: ${url}`)
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        if (buffer.length < 1000) {
            throw new Error('File too small, partial or corrupt download')
        }

        // Sanitize filename
        const safeFilename = filename.trim()
        let finalName = safeFilename
        if (!finalName.toLowerCase().endsWith('.mp3')) finalName += '.mp3'

        const fullPath = join(outputFolder, finalName)

        console.log(`[SaveToDisk] Writing to: ${fullPath}`)
        writeFileSync(fullPath, buffer)

        return { status: 'success', path: fullPath }

    } catch (e: any) {
        console.error('[SaveToDisk Error]', e)
        throw createError({ statusCode: 500, statusMessage: e.message })
    }
})
