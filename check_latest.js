
import Database from 'better-sqlite3'
const db = new Database('./.data/automation.db')

const row = db.prepare('SELECT * FROM generations ORDER BY id DESC LIMIT 1').get()
console.log(JSON.stringify(row, null, 2))
