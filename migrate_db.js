
import Database from 'better-sqlite3'
const db = new Database('./.data/automation.db')

console.log('Migrating DB...')
try {
    const columns = [
        'weirdness_min INTEGER',
        'weirdness_max INTEGER',
        'bpm_min INTEGER',
        'bpm_max INTEGER',
        'style_influence_min INTEGER',
        'style_influence_max INTEGER'
    ]

    for (const col of columns) {
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
    }
    console.log('Migration complete.')
} catch (e) {
    console.error(e)
}
