export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { key, value, workflowId } = body
    const wId = workflowId || 1

    if (!key) throw createError({ statusCode: 400, statusMessage: 'Key required' })

    const db = useDB()
    const stmt = db.prepare(`
        INSERT INTO settings (key, value, workflow_id) VALUES (?, ?, ?)
        ON CONFLICT(key, workflow_id) DO UPDATE SET value = excluded.value
    `)

    stmt.run(key, value || '', wId)

    return { code: 200, msg: 'Saved' }
})
