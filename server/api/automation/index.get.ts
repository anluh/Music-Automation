export default defineEventHandler(async (event) => {
    const db = useDB()
    const query = getQuery(event)
    const workflowId = query.workflowId || 1

    const stmts = db.prepare('SELECT * FROM generations WHERE workflow_id = ? ORDER BY created_at DESC')
    const generations = stmts.all(workflowId)
    return {
        code: 200,
        msg: 'success',
        data: generations
    }
})
