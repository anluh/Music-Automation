
import Database from 'better-sqlite3'
const db = new Database('./.data/automation.db')
// Wait, app uses useDB(). Where is DB?
// server/utils/db.ts should tell me.

// I'll try to guess or read db.ts first.
console.log('Checking DB...')
try {
    const meta = db.prepare("PRAGMA table_info(generations)").all()
    console.log(JSON.stringify(meta, null, 2))
} catch (e) {
    console.error(e)
}
