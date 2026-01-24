export default defineEventHandler(async (event) => {
    const db = useDB()
    const stmts = db.prepare('SELECT * FROM generations ORDER BY created_at DESC')
    const generations = stmts.all()
    return {
        code: 200,
        msg: 'success',
        data: generations
    }
})
