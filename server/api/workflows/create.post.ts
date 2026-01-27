
import { useDB } from '../../utils/db'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { name } = body

    if (!name) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Name is required'
        })
    }

    const db = useDB()
    try {
        const info = db.prepare('INSERT INTO workflows (name) VALUES (?)').run(name)
        return {
            success: true,
            id: info.lastInsertRowid
        }
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            statusMessage: e.message
        })
    }
})
