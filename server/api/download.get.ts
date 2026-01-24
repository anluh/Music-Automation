
// ... existing imports
export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const url = query.url as string
    const filename = query.filename as string

    // Log incoming request
    console.log(`[Proxy] Download Request. URL: ${url}, Filename: ${filename}`)

    if (!url) {
        throw createError({ statusCode: 400, statusMessage: 'URL is required' })
    }

    try {
        console.log(`[Proxy] Fetching: ${url}`)
        const response = await fetch(url)
        if (!response.ok) {
            console.error(`[Proxy] Upstream error: ${response.status} ${response.statusText}`)
            throw new Error(`Failed to fetch file: ${response.statusText}`)
        }

        const contentType = response.headers.get('content-type') || ''
        console.log(`[Proxy] Upstream Content-Type: ${contentType}`)

        // Validate content type
        if (!contentType.includes('audio') && !contentType.includes('octet-stream')) {
            // Sometimes it might be octet-stream, but if it's text/html, it's definitely an error page
            if (contentType.includes('text') || contentType.includes('html') || contentType.includes('json')) {
                const text = await response.text()
                console.error(`[Proxy] Invalid Content-Type. Response body preview: ${text.substring(0, 200)}`)
                throw new Error(`Upstream returned invalid content type: ${contentType}`)
            }
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        console.log(`[Proxy] Buffer size: ${buffer.length}`)

        if (buffer.length < 1000) {
            console.error('[Proxy] Buffer too small for MP3')
            throw new Error('File too small, partial or corrupt download')
        }

        // Sanitize filename: ASCII only, replace spaces with underscores, remove special chars
        const safeFilename = filename
            .replace(/[^a-zA-Z0-9.\-_]/g, '_') // Replace non-safe chars with _
            .replace(/_+/g, '_') // Collapse multiple underscores
            .trim()

        let finalFilename = safeFilename
        if (!finalFilename) finalFilename = 'download'
        if (!finalFilename.toLowerCase().endsWith('.mp3')) finalFilename += '.mp3'

        console.log(`[Proxy] Final Filename: ${finalFilename}`)

        // Force headers
        // Simple quoting, no UTF-8 extended parameter for now to maximize compatibility
        setHeader(event, 'Content-Disposition', `attachment; filename="${finalFilename}"`)
        setHeader(event, 'Content-Type', 'application/octet-stream')
        setHeader(event, 'Content-Length', buffer.length)

        return buffer
    } catch (e: any) {
        console.error('Download proxy error:', e)
        throw createError({ statusCode: 500, statusMessage: e.message })
    }
})
