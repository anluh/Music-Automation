
import Database from 'better-sqlite3'
const db = new Database('./.data/automation.db')

console.log('Migrating DB: Adding lyrics_task_id...')
try {
    const col = 'lyrics_task_id TEXT'
    try {
        db.prepare(`ALTER TABLE generations ADD COLUMN ${col}`).run()
        console.log(`Added column ${col}`)
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log(`Column ${col} already exists`)
        } else {
            console.error(`Failed to add ${col}:`, e.message)
        }
    }
    console.log('Migration complete.')
} catch (e) {
    console.error(e)
}
