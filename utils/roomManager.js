// Room management utility
const rooms = new Map()

export const roomManager = {
  // Create a new room
  createRoom(roomId, hostSocketId = null, hostUserId = null) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        participants: new Map(),
        pendingParticipants: new Map(), // Waiting room participants
        hostSocketId: hostSocketId, // Track the host/creator (current socket ID)
        hostUserId: hostUserId, // Track the original host user ID (persistent)
        createdAt: new Date(),
      })
    }
    return rooms.get(roomId)
  },
  
  // Get host socket ID
  getHost(roomId) {
    const room = this.getRoom(roomId)
    return room?.hostSocketId || null
  },
  
  // Check if user is host (by socket ID or user ID)
  isHost(roomId, socketId, userId = null) {
    const room = this.getRoom(roomId)
    if (!room) return false
    // Check by socket ID (current connection)
    if (room.hostSocketId === socketId) return true
    // Check by user ID (for reconnection)
    if (userId && room.hostUserId === userId) return true
    return false
  },
  
  // Set host by user ID (for reconnection)
  setHostByUserId(roomId, socketId, userId) {
    const room = this.getRoom(roomId)
    if (room) {
      room.hostSocketId = socketId
      if (userId) {
        room.hostUserId = userId
      }
      return true
    }
    return false
  },
  
  // Transfer host to another participant (if host leaves permanently)
  transferHost(roomId) {
    const room = this.getRoom(roomId)
    if (room && room.participants.size > 0) {
      // Transfer to first participant
      const firstParticipant = Array.from(room.participants.keys())[0]
      const firstParticipantData = room.participants.get(firstParticipant)
      room.hostSocketId = firstParticipant
      // Update host user ID if available
      if (firstParticipantData?.userId) {
        room.hostUserId = firstParticipantData.userId
      }
      return firstParticipant
    }
    return null
  },

  // Get room by ID
  getRoom(roomId) {
    return rooms.get(roomId)
  },

  // Add participant to room
  addParticipant(roomId, socketId, userData) {
    const room = this.getRoom(roomId)
    if (room) {
      // Ensure displayName is always present
      const displayName = userData.displayName || userData.name || 'User'
      room.participants.set(socketId, {
        socketId,
        displayName: displayName,
        videoEnabled: userData.videoEnabled !== false,
        audioEnabled: userData.audioEnabled !== false,
        ...userData, // Spread to include any other properties
        displayName: displayName, // Ensure displayName is set after spread
        joinedAt: new Date(),
      })
      return true
    }
    return false
  },

  // Remove participant from room
  removeParticipant(roomId, socketId) {
    const room = this.getRoom(roomId)
    if (room) {
      room.participants.delete(socketId)
      // Clean up empty rooms
      if (room.participants.size === 0) {
        rooms.delete(roomId)
      }
      return true
    }
    return false
  },

  // Get all participants in a room
  getParticipants(roomId) {
    const room = this.getRoom(roomId)
    if (room) {
      return Array.from(room.participants.values())
    }
    return []
  },

  // Add participant to waiting room
  addPendingParticipant(roomId, socketId, userData) {
    const room = this.getRoom(roomId)
    if (room) {
      // Ensure displayName is always present
      const displayName = userData.displayName || userData.name || 'User'
      room.pendingParticipants.set(socketId, {
        socketId,
        displayName: displayName,
        videoEnabled: userData.videoEnabled !== false,
        audioEnabled: userData.audioEnabled !== false,
        ...userData, // Spread to include any other properties
        displayName: displayName, // Ensure displayName is set after spread
        requestedAt: new Date(),
      })
      return true
    }
    return false
  },

  // Remove participant from waiting room
  removePendingParticipant(roomId, socketId) {
    const room = this.getRoom(roomId)
    if (room) {
      room.pendingParticipants.delete(socketId)
      return true
    }
    return false
  },

  // Get all pending participants in waiting room
  getPendingParticipants(roomId) {
    const room = this.getRoom(roomId)
    if (room) {
      return Array.from(room.pendingParticipants.values())
    }
    return []
  },

  // Get all rooms (for debugging)
  getAllRooms() {
    return Array.from(rooms.keys())
  },
}

