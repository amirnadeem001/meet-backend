import db from '../database/db.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export class User {
  static create({ email, password, name, language }) {
    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10)

    // Insert user
    const stmt = db.prepare(`
      INSERT INTO users (email, password, name, language)
      VALUES (?, ?, ?, ?)
    `)

    try {
      const result = stmt.run(
        email.toLowerCase().trim(), 
        hashedPassword, 
        name.trim(),
        language || null
      )
      return {
        id: result.lastInsertRowid,
        email: email.toLowerCase().trim(),
        name: name.trim(),
        language: language || null,
      }
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Email already exists')
      }
      throw error
    }
  }

  static findByEmail(email) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?')
    return stmt.get(email.toLowerCase().trim())
  }

  static findById(id) {
    const stmt = db.prepare('SELECT id, email, name, language, created_at FROM users WHERE id = ?')
    return stmt.get(id)
  }

  static verifyPassword(password, hashedPassword) {
    return bcrypt.compareSync(password, hashedPassword)
  }

  static generateToken(user) {
    return jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return null
    }
  }

  static update(id, updates) {
    const allowedFields = ['email', 'password', 'name']
    const fieldsToUpdate = []
    const values = []

    // Build update query dynamically
    for (const field of allowedFields) {
      if (updates[field] !== undefined && updates[field] !== null) {
        if (field === 'password') {
          // Hash password if provided
          const hashedPassword = bcrypt.hashSync(updates[field], 10)
          fieldsToUpdate.push(`${field} = ?`)
          values.push(hashedPassword)
        } else if (field === 'email') {
          fieldsToUpdate.push(`${field} = ?`)
          values.push(updates[field].toLowerCase().trim())
        } else {
          fieldsToUpdate.push(`${field} = ?`)
          values.push(updates[field].trim())
        }
      }
    }

    if (fieldsToUpdate.length === 0) {
      throw new Error('No valid fields to update')
    }

    // Add updated_at timestamp
    fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    const stmt = db.prepare(`
      UPDATE users 
      SET ${fieldsToUpdate.join(', ')}
      WHERE id = ?
    `)

    try {
      stmt.run(...values)
      
      // Return updated user
      return User.findById(id)
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Email already exists')
      }
      throw error
    }
  }
}

