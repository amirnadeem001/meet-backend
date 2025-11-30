import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Create database connection
const dbPath = path.join(__dirname, 'meet.db')
const db = new Database(dbPath)

// Enable foreign keys
db.pragma('foreign_keys = ON')

// Initialize database tables
export const initializeDatabase = () => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      language TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Add language column to existing users table if it doesn't exist
  try {
    db.exec(`ALTER TABLE users ADD COLUMN language TEXT`)
  } catch (error) {
    // Column already exists, ignore error
    if (!error.message.includes('duplicate column name')) {
      console.warn('Error adding language column:', error.message)
    }
  }

  // Create index on email for faster lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
  `)

  console.log('Database initialized successfully')
}

// Get database instance
export const getDb = () => db

// Close database connection
export const closeDatabase = () => {
  db.close()
}

export default db

