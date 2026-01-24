import { join } from 'node:path'

export default defineEventHandler(async (event) => {
    const db = useDB()
    const stmts = db.prepare('SELECT key, value FROM settings')
    const rows = stmts.all() as { key: string, value: string }[]

    // Convert to object
    const settings: Record<string, string> = {}
    rows.forEach(r => settings[r.key] = r.value)

    // Add default download path
    const homedir = process.env.USERPROFILE || process.env.HOME || 'C:\\'
    const defaultDownloadPath = join(homedir, 'Downloads')

    return {
        code: 200,
        data: {
            ...settings,
            defaultDownloadPath
        }
    }
})
