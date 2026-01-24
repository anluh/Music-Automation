
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
    try {
        const db = useDB()

        // 1. Find all rows that are PENDING_MUSIC and have a suno_task_id
        // These are the ones waiting for Suno to finish.
        const pendingRows = db.prepare(`
            SELECT id, suno_task_id 
            FROM generations 
            WHERE status = 'PENDING_MUSIC' 
              AND suno_task_id IS NOT NULL
        `).all() as any[]

        if (pendingRows.length === 0) {
            return { processed: 0, updates: [] }
        }

        console.log(`[Poll Pending] Checking ${pendingRows.length} pending Suno tasks...`)

        // 2. Poll Kie/Suno for each in parallel
        const results = await Promise.all(pendingRows.map(async (row) => {
            try {
                const info = await kie.getTaskInfo(row.suno_task_id)

                // Logic from process.post.ts reused here
                if (info && (info.status === 'SUCCESS' || info.progress === 100)) {
                    const clips = info.response?.sunoData || info.sunoData || info.clips || []

                    if (clips && clips.length >= 2) {
                        const l1 = clips[0].metadata?.prompt || clips[0].prompt || 'No lyrics found in metadata'
                        const l2 = clips[1].metadata?.prompt || clips[1].prompt || 'No lyrics found in metadata'

                        db.prepare(`
                            UPDATE generations 
                            SET audio_url_1 = ?, audio_url_2 = ?, 
                                lyrics_content = ?,
                                status = 'DOWNLOADING' 
                            WHERE id = ?
                        `).run(clips[0].audioUrl, clips[1].audioUrl, JSON.stringify({ l1, l2 }), row.id)

                        console.log(`[Poll Pending] Task ${row.suno_task_id} (ID: ${row.id}) completed!`)
                        return { id: row.id, status: 'DOWNLOADING', success: true }
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
