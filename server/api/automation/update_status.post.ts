
export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event)
        const { id, status } = body

        if (!id || !status) {
            throw createError({ statusCode: 400, statusMessage: 'ID and Status required' })
        }

        const db = useDB()

        // simple validation or logic if needed, for now direct update
        db.prepare('UPDATE generations SET status = ? WHERE id = ?').run(status, id)

        return { success: true, id, status }
    } catch (e: any) {
        throw createError({ statusCode: 500, statusMessage: e.message })
    }
})
