import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let db: Database.Database | null = null

export const useDB = () => {
  if (db) return db

  const dbDir = './.data'
  mkdirSync(dbDir, { recursive: true })

  db = new Database(join(dbDir, 'automation.db'))

  // Initialize Schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  return db
}
