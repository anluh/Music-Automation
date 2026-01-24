export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { key, value } = body

    if (!key) throw createError({ statusCode: 400, statusMessage: 'Key required' })

    const db = useDB()
    const stmt = db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)

    stmt.run(key, value || '')

    return { code: 200, msg: 'Saved' }
})
