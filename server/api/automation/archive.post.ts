export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { workflowId } = body

    if (!workflowId) {
        throw createError({ statusCode: 400, statusMessage: 'Workflow ID required' })
    }

    const db = useDB()

    // Archive only items that are COMPLETED or READY_TO_DOWNLOAD and not yet archived
    const stmt = db.prepare(`
        UPDATE generations 
        SET archived_at = CURRENT_TIMESTAMP 
        WHERE workflow_id = ? 
        AND status IN ('COMPLETED', 'READY_TO_DOWNLOAD')
        AND archived_at IS NULL
    `)

    const info = stmt.run(workflowId)

    return {
        code: 200,
        msg: 'success',
        changes: info.changes
    }
})
