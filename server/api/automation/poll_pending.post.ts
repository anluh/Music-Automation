import { createGenerations } from '../../utils/generator'
import { processGeneration } from '../../utils/processor'
import { kie } from '../../utils/kie'

const getWorkflowKieApiKey = (db: any, workflowId: number) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'kieApiKey' AND workflow_id = ?").get(workflowId) as any
    return row?.value || undefined
}

export default defineEventHandler(async (event) => {
    try {
        const db = useDB()

        // --- AUTORUN START ---
        // Check for active workflows that need more songs
        try {
            const activeWorkflows = db.prepare('SELECT id FROM workflows WHERE is_active = 1').all() as { id: number }[]

            for (const wf of activeWorkflows) {
                // A. Check for Completion (Auto-Off)
                // We count how many non-completed items exist.
                const pendingCountFn = db.prepare(`
                    SELECT COUNT(*) as count FROM generations 
                    WHERE workflow_id = ? AND status NOT IN ('COMPLETED', 'FAILED')
                `)
                const countRes = pendingCountFn.get(wf.id) as { count: number }
                const currentPending = countRes.count

                if (currentPending === 0) {
                    console.log(`[Autorun] Workflow ${wf.id} queue complete. Turning OFF Autorun.`)
                    db.prepare('UPDATE workflows SET is_active = 0 WHERE id = ?').run(wf.id)
                    continue // Nothing left to process for this workflow
                }

                // If we are here, there are pending items.
                // We do NOT create new ones anymore (User Request).
                // We just ensure the existing ones keep moving.

                // B. Active Processing Scan 
                // Scan for rows that need processing (Gemini or Download) checks
                const stuckRows = db.prepare(`
                    SELECT id FROM generations 
                    WHERE workflow_id = ? AND status IN ('PENDING_GEMINI', 'PENDING_LYRICS', 'PENDING_MUSIC', 'DOWNLOADING')
                    LIMIT 20
                `).all(wf.id) as { id: number }[]

                // Parallelize the initiation to ensure we fill the queue fast
                await Promise.all(stuckRows.map(row => processGeneration(row.id)))
            }
        } catch (e: any) {
            console.error('[Autorun] Error:', e)
        }
        // --- AUTORUN END ---

        // --- POLLER START (PENDING_LYRICS check) ---
        const pendingLyricsRows = db.prepare(`
            SELECT g.id, g.workflow_id, g.lyrics_task_id, g.lyric_prompt
            FROM generations g
            WHERE g.status = 'PENDING_LYRICS' 
              AND g.lyrics_task_id IS NOT NULL
        `).all() as any[]

        if (pendingLyricsRows.length > 0) {
            console.log(`[Poll Pending] Checking ${pendingLyricsRows.length} pending Lyrics tasks...`)
            await Promise.all(pendingLyricsRows.map(async (row) => {
                try {
                    const info = await kie.getLyricsTask(row.lyrics_task_id, getWorkflowKieApiKey(db, row.workflow_id))
                    // Check if success
                    if (info && (info.status === 'SUCCESS' || info.status === 'COMPLETED' || info.progress === 100)) {
                        // Parse the prompt JSON
                        const prompts = JSON.parse(row.lyric_prompt || '{}')
                        // Extract lyrics text - assuming info.data or info.response contains the text
                        // Adjust based on actual API response structure for lyrics
                        // RESPONSE STRUCTURE: info.response.data[0].text
                        let lyricsText = ''
                        if (info.response?.data && Array.isArray(info.response.data) && info.response.data.length > 0) {
                            lyricsText = info.response.data[0].text
                        } else {
                            lyricsText = info.response?.lyrics || info.response?.text || info.lyrics || ''
                        }

                        if (lyricsText) {
                            prompts.lyrics = lyricsText

                            db.prepare(`
                                UPDATE generations 
                                SET lyric_prompt = ?, 
                                    lyrics_content = ?,
                                    status = 'PENDING_MUSIC' 
                                WHERE id = ?
                            `).run(JSON.stringify(prompts), JSON.stringify({ l1: lyricsText, l2: lyricsText }), row.id)

                            console.log(`[Poll Pending] Lyrics Task ${row.lyrics_task_id} completed for ID ${row.id}`)
                        }
                    } else if (info && (info.status === 'FAILED')) {
                        console.error(`[Poll Pending] Lyrics Task ${row.lyrics_task_id} failed.`)
                        // Optionally handle failure (retry or move to FAILED)
                    }
                } catch (e: any) {
                    console.error(`[Poll Pending] Error checking lyrics task ${row.lyrics_task_id}:`, e.message)
                }
            }))
        }

        // --- POLLER START (PENDING_MUSIC check) ---
        // 1. Find all rows that are PENDING_MUSIC and have a suno_task_id
        // We poll ALL pending tasks to receive responses, but only advance active ones.
        const pendingRows = db.prepare(`
            SELECT g.id, g.suno_task_id, g.workflow_id, g.lyric_prompt, w.is_active 
            FROM generations g
            JOIN workflows w ON g.workflow_id = w.id
            WHERE g.status = 'PENDING_MUSIC' 
              AND g.suno_task_id IS NOT NULL
        `).all() as any[]

        if (pendingRows.length === 0 && pendingLyricsRows.length === 0) {
            return { processed: 0, updates: [] }
        }

        console.log(`[Poll Pending] Checking ${pendingRows.length} pending Suno tasks...`)

        // 2. Poll Kie/Suno for each in parallel
        const results = await Promise.all(pendingRows.map(async (row) => {
            try {
                const info = await kie.getTaskInfo(row.suno_task_id, getWorkflowKieApiKey(db, row.workflow_id))

                if (info && (info.status === 'SUCCESS' || info.progress === 100)) {
                    const clips = info.response?.sunoData || info.sunoData || info.clips || []

                    if (clips && clips.length >= 2) {
                        const l1 = clips[0].metadata?.prompt || clips[0].prompt || 'No lyrics found in metadata'
                        const l2 = clips[1].metadata?.prompt || clips[1].prompt || 'No lyrics found in metadata'

                        // Check for pre-generated lyrics
                        const prompts = JSON.parse(row.lyric_prompt || '{}')
                        const preGeneratedLyrics = prompts.lyrics
                        const finalLyricsContent = preGeneratedLyrics
                            ? JSON.stringify({ l1: preGeneratedLyrics, l2: preGeneratedLyrics })
                            : JSON.stringify({ l1, l2 })

                        // ALWAYS set to READY_TO_DOWNLOAD. Client handles the rest.
                        const nextStatus = 'READY_TO_DOWNLOAD'

                        db.prepare(`
                            UPDATE generations 
                            SET audio_url_1 = ?, audio_url_2 = ?, 
                                lyrics_content = ?,
                                status = ? 
                            WHERE id = ?
                        `).run(clips[0].audioUrl, clips[1].audioUrl, finalLyricsContent, nextStatus, row.id)

                        console.log(`[Poll Pending] Task ${row.suno_task_id} (ID: ${row.id}) completed! Status -> ${nextStatus}`)
                        console.log(`[Poll Pending] ID ${row.id} ready (Status: ${nextStatus}). Waiting for Client...`)

                        return { id: row.id, status: nextStatus, success: true }
                    }
                }
                return { id: row.id, status: 'PENDING_MUSIC', success: false }
            } catch (e: any) {
                console.error(`[Poll Pending] Error checking task ${row.suno_task_id}:`, e.message)
                return { id: row.id, error: e.message }
            }
        }))

        // Filter for successful status changes
        const updates = results.filter(r => r.success)

        return {
            processed: pendingRows.length,
            updates
        }

    } catch (e: any) {
        console.error('[Poll Pending Error]', e)
        throw createError({ statusCode: 500, statusMessage: e.message || 'Internal Server Error' })
    }
})
