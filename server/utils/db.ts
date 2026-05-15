import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let db: any = null

export const closeDB = () => {
    if (db) {
        try {
            db.close()
        } catch (e) {
            console.error('[DB] Error closing DB:', e)
        }
        db = null
    }
}

export const useDB = () => {
  if (db) return db

  let dbDir = './.data'

  // In Electron (Production), use the User Data path passed from main process
  if (process.env.IS_ELECTRON && process.env.USER_DATA_PATH) {
    dbDir = process.env.USER_DATA_PATH
    console.log('[DB] Using Electron User Data Path:', dbDir)
  }

  mkdirSync(dbDir, { recursive: true })

  db = new Database(join(dbDir, 'automation.db'))

  // Initialize Schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Check if we need to migrate generations table
  try {
    const info = db.pragma('table_info(generations)') as any[]
    if (!info.some(col => col.name === 'workflow_id')) {
      console.log('[DB] Migrating generations table to include workflow_id...')

      // 1. Create Default Workflow if not exists
      db.prepare("INSERT OR IGNORE INTO workflows (id, name) VALUES (1, 'Default Workflow')").run()

      // 2. Add Column
      db.prepare('ALTER TABLE generations ADD COLUMN workflow_id INTEGER DEFAULT 1').run()

      console.log('[DB] Migration complete.')
    }

    const info2 = db.pragma('table_info(generations)') as any[]
    if (!info2.some(col => col.name === 'archived_at')) {
      console.log('[DB] Migrating generations table to include archived_at...')
      db.prepare('ALTER TABLE generations ADD COLUMN archived_at DATETIME').run()
      console.log('[DB] Archive Migration complete.')
    }

  } catch (e) {
    console.error('[DB] Migration failed', e)
  }

  try {
    const info3 = db.pragma('table_info(generations)') as any[]
    if (!info3.some(col => col.name === 'negative_tags')) {
      console.log('[DB] Migrating generations table to include negative_tags...')
      db.prepare('ALTER TABLE generations ADD COLUMN negative_tags TEXT').run()
      console.log('[DB] Negative Tags Migration complete.')
    }
  } catch (e) {
    console.error('[DB] Negative Tags Migration failed', e)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER DEFAULT 1,
      mood TEXT,
      song_name_1 TEXT,
      song_name_2 TEXT,
      lyric_prompt TEXT,
      lyrics_content TEXT,
      style_prompt TEXT,
      weirdness_min INTEGER,
      weirdness_max INTEGER,
      bpm_min INTEGER,
      bpm_max INTEGER,
      style_influence_min INTEGER,
      style_influence_max INTEGER,
      status TEXT DEFAULT 'PENDING_GEMINI',
      lyrics_task_id TEXT,
      suno_task_id TEXT,
      audio_url_1 TEXT,
      audio_url_2 TEXT,
      local_path_1 TEXT,
      local_path_2 TEXT,
      vocal_gender_probability INTEGER,
      is_instrumental BOOLEAN,
      negative_tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Check if we need to migrate settings table
  try {
    const info = db.pragma('table_info(settings)') as any[]
    if (!info.some(col => col.name === 'workflow_id')) {
      console.log('[DB] Migrating settings table to include workflow_id...')

      // We need to recreate the table to change the Primary Key
      // 1. Rename old
      db.exec('ALTER TABLE settings RENAME TO settings_old')

      // 2. Create new
      db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT,
              workflow_id INTEGER DEFAULT 1,
              value TEXT,
              PRIMARY KEY (key, workflow_id)
            )
          `)

      // 3. Copy data (assign to Default Workflow ID 1)
      db.exec('INSERT INTO settings (key, value, workflow_id) SELECT key, value, 1 FROM settings_old')

      // 4. Drop old
      db.exec('DROP TABLE settings_old')

      console.log('[DB] Settings Migration complete.')
    }
  } catch (e) {
    console.error('[DB] Settings Migration failed', e)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT,
      workflow_id INTEGER DEFAULT 1,
      value TEXT,
      PRIMARY KEY (key, workflow_id)
    )
  `)

  return db
}
