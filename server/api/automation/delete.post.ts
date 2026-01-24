export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { id } = body

    if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

    const db = useDB()
    const stmt = db.prepare('DELETE FROM generations WHERE id = ?')
    console.log('[Delete API] Attempting to delete ID:', id, 'Type:', typeof id)
    const info = stmt.run(id)
    console.log('[Delete API] Result:', info)

    if (info.changes === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Generation not found or already deleted' })
    }

    return { code: 200, msg: 'Deleted', changes: info.changes }
})
