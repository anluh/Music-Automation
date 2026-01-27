
import { useDB } from '../../utils/db'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { id } = body

    if (!id) {
        throw createError({
            statusCode: 400,
            statusMessage: 'ID is required'
        })
    }

    const db = useDB()
    try {
        // 1. Delete associated settings
        db.prepare('DELETE FROM settings WHERE workflow_id = ?').run(id)

        // 2. Delete associated generations
        db.prepare('DELETE FROM generations WHERE workflow_id = ?').run(id)

        // 3. Delete workflow
        db.prepare('DELETE FROM workflows WHERE id = ?').run(id)

        return {
            success: true
        }
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            statusMessage: e.message
        })
    }
})
