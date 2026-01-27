
import { useDB } from '../../utils/db'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { id, isActive } = body

    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Workflow ID is required' })
    }

    const db = useDB()
    const stmt = db.prepare('UPDATE workflows SET is_active = ? WHERE id = ?')

    // Convert boolean/string to integer (0 or 1)
    const val = isActive ? 1 : 0
    stmt.run(val, id)

    return {
        success: true,
        id,
        is_active: val
    }
})
