
import { useDB } from '../../utils/db'

export default defineEventHandler((event) => {
    const db = useDB()
    try {
        const workflows = db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all()
        return {
            success: true,
            data: workflows
        }
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            statusMessage: e.message
        })
    }
})
