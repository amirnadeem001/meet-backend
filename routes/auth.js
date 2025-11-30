import express from 'express'
import { User } from '../models/User.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, language } = req.body

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    if (name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' })
    }

    // Language is optional but validate if provided
    if (language && typeof language !== 'string') {
      return res.status(400).json({ error: 'Language must be a string' })
    }

    // Create user
    const user = User.create({ email, password, name, language })

    // Generate token
    const token = User.generateToken(user)

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        language: user.language,
      },
      token,
    })
  } catch (error) {
    if (error.message === 'Email already exists') {
      return res.status(409).json({ error: 'Email already exists' })
    }
    console.error('Signup error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Find user
    const user = User.findByEmail(email)
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Verify password
    if (!User.verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Generate token
    const token = User.generateToken(user)

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        language: user.language,
      },
      token,
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Verify token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const decoded = User.verifyToken(token)
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const user = User.findById(decoded.id)
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        language: user.language,
      },
    })
  } catch (error) {
    console.error('Verify error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update user profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { email, password, name } = req.body
    const userId = req.user.id

    // Validation
    const updates = {}
    
    if (email !== undefined) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' })
      }
      updates.email = email
    }

    if (password !== undefined) {
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' })
      }
      updates.password = password
    }

    if (name !== undefined) {
      if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' })
      }
      updates.name = name
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    // Update user
    const updatedUser = User.update(userId, updates)

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        language: updatedUser.language,
      },
    })
  } catch (error) {
    if (error.message === 'Email already exists') {
      return res.status(409).json({ error: 'Email already exists' })
    }
    console.error('Profile update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

