import { join } from 'node:path'
import { writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { closeDB } from '../../utils/db'

export default defineEventHandler(async (event) => {
    try {
        const formData = await readMultipartFormData(event)
        if (!formData || formData.length === 0) {
            throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
        }

        const file = formData[0]
        if (!file.filename || !file.data) {
            throw createError({ statusCode: 400, statusMessage: 'Invalid file' })
        }

        let dbDir = './.data'
        if (process.env.IS_ELECTRON && process.env.USER_DATA_PATH) {
            dbDir = process.env.USER_DATA_PATH
        }

        const dbPath = join(dbDir, 'automation.db')
        const backupPath = join(dbDir, 'automation.db.bak')

        // 1. Backup existing
        if (existsSync(dbPath)) {
            copyFileSync(dbPath, backupPath)
        }

        // 2. Overwrite
        // Note: active connections might throw locking errors. 
        // We close the DB to release locks and force recreation with migrations.
        closeDB()

        writeFileSync(dbPath, file.data)

        return { success: true, message: 'Database imported successfully. Please restart the app.' }

    } catch (e: any) {
        console.error('Import failed', e)
        return { success: false, message: e.message }
    }
})
