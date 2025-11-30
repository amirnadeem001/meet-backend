import { roomManager } from '../utils/roomManager.js'

export const socketHandler = (socket, io) => {
  // Track if user has already joined to avoid duplicate logs
  const joinedRooms = new Set()

  // Join room (with waiting room)
  socket.on('join-room', ({ roomId, userData }) => {
    const isFirstJoin = !joinedRooms.has(roomId)
    if (isFirstJoin) {
      joinedRooms.add(roomId)
    }
    
    const room = roomManager.getRoom(roomId)
    const isFirstUser = !room || room.participants.size === 0
    
    // Create room if it doesn't exist, set first user as host
    if (isFirstUser) {
      // Store user ID if available (for reconnection)
      const userId = userData?.userId || userData?.id || null
      roomManager.createRoom(roomId, socket.id, userId)
      // First user (host) is automatically admitted
      roomManager.addParticipant(roomId, socket.id, userData)
      socket.join(roomId)
      
      const isHost = true
      socket.emit('host-status', { isHost })
      socket.emit('admitted', { roomId })
      
      // Notify all participants about host
      io.to(roomId).emit('host-updated', {
        hostSocketId: roomManager.getHost(roomId),
      })
    } else {
      // Check if user is already a participant (rejoining after reconnection)
      const isAlreadyParticipant = room.participants.has(socket.id)
      // Check if user is host by socket ID or user ID
      const userId = userData?.userId || userData?.id || null
      const isHost = roomManager.isHost(roomId, socket.id, userId)
      
      if (isAlreadyParticipant || isHost) {
        // User is already a participant or is the host - re-admit them
        roomManager.createRoom(roomId) // Ensure room exists
        
        // If this is the original host reconnecting, restore their host status
        if (isHost && userId) {
          roomManager.setHostByUserId(roomId, socket.id, userId)
        }
        
        if (!isAlreadyParticipant) {
          roomManager.addParticipant(roomId, socket.id, userData)
        }
        socket.join(roomId)
        
        if (isHost) {
          socket.emit('host-status', { isHost: true })
        }
        socket.emit('admitted', { roomId })
        
        // Get existing participants
        const participants = roomManager.getParticipants(roomId)
        socket.emit('existing-users', participants
          .filter(p => p.socketId !== socket.id)
          .map(p => ({
            ...p,
            isHost: roomManager.isHost(roomId, p.socketId),
            language: p.language || null, // Ensure language is included
          }))
        )
        
        // Notify others (only if not already connected)
        if (!isAlreadyParticipant) {
          // Ensure displayName and language are included
          const userDataToSend = {
            ...userData,
            displayName: userData.displayName || userData.name || 'User',
            videoEnabled: userData.videoEnabled !== false,
            audioEnabled: userData.audioEnabled !== false,
            language: userData.language || null, // Ensure language is included
          }
          socket.to(roomId).emit('user-connected', {
            socketId: socket.id,
            userData: userDataToSend,
          })
        }
      } else {
        // Check if user is in waiting room
        const isInWaitingRoom = room.pendingParticipants.has(socket.id)
        
        if (!isInWaitingRoom) {
          // New user - add to waiting room
          roomManager.createRoom(roomId) // Ensure room exists
          roomManager.addPendingParticipant(roomId, socket.id, userData)
          
          // Notify user they're in waiting room
          socket.emit('waiting-room', { roomId })
          
          // Notify host about new pending participant
          const hostSocketId = roomManager.getHost(roomId)
          if (hostSocketId) {
            io.to(hostSocketId).emit('pending-participant', {
              socketId: socket.id,
              userData,
            })
          }
        } else {
          // User is already in waiting room - just notify them
          socket.emit('waiting-room', { roomId })
        }
      }
    }
  })

  // Host admits a participant
  socket.on('admit-participant', ({ roomId, targetSocketId }) => {
    // Verify user is host
    if (!roomManager.isHost(roomId, socket.id)) {
      socket.emit('error', { message: 'Only the host can admit participants' })
      return
    }
    
    // Get pending participant data
    const room = roomManager.getRoom(roomId)
    if (!room || !room.pendingParticipants.has(targetSocketId)) {
      socket.emit('error', { message: 'Participant not found in waiting room' })
      return
    }
    
    const pendingData = room.pendingParticipants.get(targetSocketId)
    
    if (!pendingData) {
      socket.emit('error', { message: 'Participant data not found' })
      return
    }
    
    
    // Remove from waiting room and add to participants
    roomManager.removePendingParticipant(roomId, targetSocketId)
    roomManager.addParticipant(roomId, targetSocketId, pendingData)
    
    // Add to socket room
    const targetSocket = io.sockets.sockets.get(targetSocketId)
    if (targetSocket) {
      targetSocket.join(roomId)
    }
    
    // Notify the admitted user
    io.to(targetSocketId).emit('admitted', { roomId })
    
    // Send existing participants to the admitted user
    const participants = roomManager.getParticipants(roomId)
    const existingUsersData = participants
      .filter(p => p.socketId !== targetSocketId)
      .map(p => ({
        socketId: p.socketId,
        displayName: p.displayName || p.name || 'User',
        videoEnabled: p.videoEnabled !== false,
        audioEnabled: p.audioEnabled !== false,
        isHost: roomManager.isHost(roomId, p.socketId),
        language: p.language || null, // Ensure language is included
        ...p, // Include any other properties
      }))
    io.to(targetSocketId).emit('existing-users', existingUsersData)
    
    // Notify others in the room - ensure displayName and language are included
    const userDataToSend = {
      ...pendingData,
      displayName: pendingData.displayName || pendingData.name || 'User', // Ensure displayName is present
      videoEnabled: pendingData.videoEnabled !== false,
      audioEnabled: pendingData.audioEnabled !== false,
      language: pendingData.language || null, // Ensure language is included
    }
    // Use io.to() to ensure all participants (including host) receive the event
    io.to(roomId).emit('user-connected', {
      socketId: targetSocketId,
      userData: userDataToSend,
    })
    
    // Notify host that participant was admitted
    socket.emit('participant-admitted', {
      socketId: targetSocketId,
    })
  })

  // Host rejects a participant
  socket.on('reject-participant', ({ roomId, targetSocketId }) => {
    // Verify user is host
    if (!roomManager.isHost(roomId, socket.id)) {
      socket.emit('error', { message: 'Only the host can reject participants' })
      return
    }
    
    // Remove from waiting room
    roomManager.removePendingParticipant(roomId, targetSocketId)
    
    // Notify the rejected user
    io.to(targetSocketId).emit('rejected', {
      roomId,
      message: 'You have been denied access to the meeting',
    })
    
    // Notify host that participant was rejected
    socket.emit('participant-rejected', {
      socketId: targetSocketId,
    })
  })

  // WebRTC signaling - Offer
  socket.on('offer', ({ offer, targetSocketId, roomId }) => {
    socket.to(targetSocketId).emit('offer', {
      offer,
      senderSocketId: socket.id,
    })
  })

  // WebRTC signaling - Answer
  socket.on('answer', ({ answer, targetSocketId, roomId }) => {
    socket.to(targetSocketId).emit('answer', {
      answer,
      senderSocketId: socket.id,
    })
  })

  // WebRTC signaling - ICE Candidate
  socket.on('ice-candidate', ({ candidate, targetSocketId, roomId }) => {
    socket.to(targetSocketId).emit('ice-candidate', {
      candidate,
      senderSocketId: socket.id,
    })
  })

  // Chat message
  socket.on('chat-message', ({ roomId, message, userData }) => {
    // Verify user is a participant (not in waiting room)
    const room = roomManager.getRoom(roomId)
    if (!room || !room.participants.has(socket.id)) {
      // User is not a participant - might be in waiting room
      return
    }
    
    io.to(roomId).emit('chat-message', {
      message,
      userData,
      timestamp: new Date().toISOString(),
    })
  })

  // Toggle audio
  socket.on('toggle-audio', ({ roomId, audioEnabled }) => {
    // Verify user is a participant (not in waiting room)
    const room = roomManager.getRoom(roomId)
    if (!room || !room.participants.has(socket.id)) {
      // User is not a participant - might be in waiting room
      return
    }
    
    socket.to(roomId).emit('user-audio-toggled', {
      socketId: socket.id,
      audioEnabled,
    })
  })

  // Toggle video
  socket.on('toggle-video', ({ roomId, videoEnabled }) => {
    // Verify user is a participant (not in waiting room)
    const room = roomManager.getRoom(roomId)
    if (!room || !room.participants.has(socket.id)) {
      // User is not a participant - might be in waiting room
      return
    }
    
    socket.to(roomId).emit('user-video-toggled', {
      socketId: socket.id,
      videoEnabled,
    })
  })

  // Transcription/Translation
  socket.on('transcription', ({ roomId, transcription }) => {
    // Verify user is a participant (not in waiting room)
    const room = roomManager.getRoom(roomId)
    if (!room || !room.participants.has(socket.id)) {
      // User is not a participant - might be in waiting room
      return
    }
    
    // Broadcast transcription to all participants in the room
    io.to(roomId).emit('transcription', {
      transcription: {
        ...transcription,
        socketId: socket.id,
      },
    })
  })

  // Screen share start
  socket.on('screen-share-start', ({ roomId }) => {
    // Verify user is a participant (not in waiting room)
    const room = roomManager.getRoom(roomId)
    if (!room || !room.participants.has(socket.id)) {
      return
    }
    
    socket.to(roomId).emit('screen-share-started', {
      socketId: socket.id,
    })
  })

  // Screen share stop
  socket.on('screen-share-stop', ({ roomId }) => {
    // Verify user is a participant (not in waiting room)
    const room = roomManager.getRoom(roomId)
    if (!room || !room.participants.has(socket.id)) {
      return
    }
    
    socket.to(roomId).emit('screen-share-stopped', {
      socketId: socket.id,
    })
  })

  // Host actions - Mute participant
  socket.on('mute-participant', ({ roomId, targetSocketId }) => {
    // Verify user is host
    if (!roomManager.isHost(roomId, socket.id)) {
      socket.emit('error', { message: 'Only the host can mute participants' })
      return
    }
    
    // Notify target user to mute
    io.to(targetSocketId).emit('force-mute', {
      socketId: socket.id,
    })
    
    // Notify others in room
    socket.to(roomId).emit('participant-muted', {
      targetSocketId,
      mutedBy: socket.id,
    })
  })

  // Host actions - Kick participant
  socket.on('kick-participant', ({ roomId, targetSocketId }) => {
    // Verify user is host
    if (!roomManager.isHost(roomId, socket.id)) {
      socket.emit('error', { message: 'Only the host can kick participants' })
      return
    }
    
    // Remove participant from room
    roomManager.removeParticipant(roomId, targetSocketId)
    
    // Notify target user to leave
    io.to(targetSocketId).emit('kicked', {
      socketId: socket.id,
      message: 'You have been removed from the meeting',
    })
    
    // Notify all participants in room (including host)
    io.to(roomId).emit('participant-kicked', {
      targetSocketId,
      kickedBy: socket.id,
    })
  })

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`)
    
    // Find and remove user from all rooms
    const allRooms = roomManager.getAllRooms()
    allRooms.forEach(roomId => {
      const room = roomManager.getRoom(roomId)
      if (room) {
        // Check if user was in participants
        if (room.participants.has(socket.id)) {
          const wasHost = roomManager.isHost(roomId, socket.id)
          
          roomManager.removeParticipant(roomId, socket.id)
          
          // Only transfer host if room is empty or after a delay (to allow reconnection)
          // For now, only transfer if room becomes empty
          if (wasHost && room.participants.size === 0) {
            // Room is empty, no need to transfer
            // Host will be set when they reconnect
          } else if (wasHost && room.participants.size > 0) {
            // Host left but room has participants - wait a bit before transferring
            // Store the host user ID to check if they reconnect
            const hostUserId = room.hostUserId
            const oldHostSocketId = socket.id
            
            // Set a timeout to allow reconnection
            setTimeout(() => {
              const currentRoom = roomManager.getRoom(roomId)
              if (!currentRoom) return
              
              // Check if the original host has reconnected (by checking if any participant has the hostUserId)
              let hostReconnected = false
              if (hostUserId) {
                for (const [participantSocketId, participantData] of currentRoom.participants.entries()) {
                  const participantUserId = participantData?.userId || participantData?.id
                  if (participantUserId === hostUserId) {
                    // Host reconnected - restore their host status
                    roomManager.setHostByUserId(roomId, participantSocketId, hostUserId)
                    io.to(participantSocketId).emit('host-status', { isHost: true })
                    io.to(roomId).emit('host-updated', {
                      hostSocketId: participantSocketId,
                    })
                    hostReconnected = true
                    break
                  }
                }
              }
              
              // Only transfer if host hasn't reconnected and current host is still the old socket ID
              if (!hostReconnected && currentRoom.hostSocketId === oldHostSocketId) {
                const newHost = roomManager.transferHost(roomId)
                if (newHost) {
                  io.to(roomId).emit('host-updated', {
                    hostSocketId: newHost,
                  })
                  io.to(newHost).emit('host-status', { isHost: true })
                }
              }
            }, 5000) // Wait 5 seconds before transferring host
          }
          
          socket.to(roomId).emit('user-disconnected', {
            socketId: socket.id,
          })
        }
        
        // Check if user was in pending participants
        if (room.pendingParticipants.has(socket.id)) {
          roomManager.removePendingParticipant(roomId, socket.id)
          // Notify host if they're still connected
          const hostSocketId = roomManager.getHost(roomId)
          if (hostSocketId) {
            io.to(hostSocketId).emit('participant-rejected', {
              socketId: socket.id,
              message: 'Pending participant disconnected',
            })
          }
        }
      }
    })
  })
}

