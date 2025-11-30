import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import os from 'os'
import { socketHandler } from './socket/socketHandler.js'
import { initializeDatabase } from './database/db.js'
import authRoutes from './routes/auth.js'

dotenv.config()

// Initialize database
initializeDatabase()

const app = express()
const httpServer = createServer(app)

// Allow connections from local network (for testing on multiple devices)
// Also allow ngrok, Vercel, and other deployment platforms
const getAllowedOrigins = () => {
  const origins = []
  
  // Add CLIENT_URL if provided (can be comma-separated for multiple URLs)
  if (process.env.CLIENT_URL) {
    const clientUrls = process.env.CLIENT_URL.split(',').map(url => url.trim())
    origins.push(...clientUrls)
  }
  
  // Development origins
  origins.push(
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    // Allow any local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    /^http:\/\/192\.168\.\d+\.\d+:5173$/,
    /^http:\/\/10\.\d+\.\d+\.\d+:5173$/,
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:5173$/,
    // Also allow any port for localhost/127.0.0.1 (for flexibility)
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
    // Allow any local network IP with any port (for development)
    /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
    /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$/,
  )
  
  // Production origins - ngrok and tunnel services
  origins.push(
    /^https:\/\/.*\.ngrok-free\.dev$/,
    /^https:\/\/.*\.ngrok\.io$/,
    /^https:\/\/.*\.ngrok\.app$/,
    /^https:\/\/.*\.ngrok[^.]*\.(dev|io|app)$/,
    // Allow any ngrok domain (for flexibility)
    /^https:\/\/[a-z0-9-]+\.ngrok[^.]*\.(dev|io|app|com)$/,
  )
  
  // Production origins - Vercel deployments
  origins.push(
    // Production deployments
    /^https:\/\/.*\.vercel\.app$/,
    // Preview deployments
    /^https:\/\/.*\.vercel\.dev$/,
    // Custom domains on Vercel
    /^https:\/\/.*\.vercel\.app\/.*$/,
    /^https:\/\/.*\.vercel\.dev\/.*$/,
  )
  
  return origins
}

const allowedOrigins = getAllowedOrigins()

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        console.log('Socket.IO CORS: Allowing request with no origin')
        return callback(null, true)
      }
      
      console.log(`Socket.IO CORS: Checking origin: ${origin}`)
      
      // Check if origin matches allowed patterns
      const isAllowed = allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') {
          const matches = origin === allowed
          if (matches) console.log(`Socket.IO CORS: Matched string origin: ${allowed}`)
          return matches
        }
        if (allowed instanceof RegExp) {
          const matches = allowed.test(origin)
          if (matches) console.log(`Socket.IO CORS: Matched regex pattern: ${allowed}`)
          return matches
        }
        return false
      })
      
      if (isAllowed) {
        console.log(`Socket.IO CORS: Allowing origin: ${origin}`)
        callback(null, true)
      } else {
        console.error(`Socket.IO CORS: Rejecting origin: ${origin}`)
        console.error(`Socket.IO CORS: Allowed origins:`, allowedOrigins.map(o => typeof o === 'string' ? o : o.toString()).join(', '))
        callback(new Error(`Not allowed by CORS. Origin: ${origin}. Please check CLIENT_URL environment variable or add origin to allowed list.`))
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('CORS: Allowing request with no origin')
      return callback(null, true)
    }
    
    console.log(`CORS: Checking origin: ${origin}`)
    
    // Check if origin matches allowed patterns
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        const matches = origin === allowed
        if (matches) console.log(`CORS: Matched string origin: ${allowed}`)
        return matches
      }
      if (allowed instanceof RegExp) {
        const matches = allowed.test(origin)
        if (matches) console.log(`CORS: Matched regex pattern: ${allowed}`)
        return matches
      }
      return false
    })
    
    if (isAllowed) {
      console.log(`CORS: Allowing origin: ${origin}`)
      callback(null, true)
    } else {
      console.error(`CORS: Rejecting origin: ${origin}`)
      console.error(`CORS: Allowed origins:`, allowedOrigins.map(o => typeof o === 'string' ? o : o.toString()).join(', '))
      callback(new Error(`Not allowed by CORS. Origin: ${origin}. Please check CLIENT_URL environment variable or add origin to allowed list.`))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' })
})

app.use('/api/auth', authRoutes)

// Socket.io connection handling
io.on('connection', (socket) => {
  socketHandler(socket, io)
})

const PORT = process.env.PORT || 5000
const HOST = process.env.HOST || '0.0.0.0' // Listen on all network interfaces

httpServer.listen(PORT, HOST, () => {
  console.log(`Server is running on port ${PORT}`)
  console.log(`Server accessible on:`)
  console.log(`  - http://localhost:${PORT}`)
  console.log(`  - http://127.0.0.1:${PORT}`)
  
  // Get local IP address
  const networkInterfaces = os.networkInterfaces()
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  - http://${iface.address}:${PORT}`)
      }
    })
  })
  
  console.log(`Client URL: ${process.env.CLIENT_URL || 'http://localhost:5173'}`)
})

