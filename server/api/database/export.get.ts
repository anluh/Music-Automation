import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'

export default defineEventHandler(async (event) => {
    let dbDir = './.data'
    // Reuse logic from db.ts 
    // Ideally duplicate strictly or export the path logic. 
    // For now, duplicate check to be safe
    if (process.env.IS_ELECTRON && process.env.USER_DATA_PATH) {
        dbDir = process.env.USER_DATA_PATH
    }

    const dbPath = join(dbDir, 'automation.db')

    if (!existsSync(dbPath)) {
        throw createError({ statusCode: 404, statusMessage: 'Database not found' })
    }

    // Set headers for file download
    setHeader(event, 'Content-Type', 'application/x-sqlite3')
    setHeader(event, 'Content-Disposition', 'attachment; filename="automation.db"')

    return readFileSync(dbPath)
})
