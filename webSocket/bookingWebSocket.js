// backend/websocket/bookingWebSocket.js - WebSocket Server Setup
const WebSocket = require('ws');
const url = require('url');

class BookingWebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws/bookings'
    });
    
    this.adminClients = new Set();
    this.userClients = new Set();
    
    this.setupWebSocketServer();
    this.setupHeartbeat();
    
    console.log('📡 BookingWebSocketServer initialized');
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws, request) => {
      const clientIp = request.connection.remoteAddress;
      const userAgent = request.headers['user-agent'];
      
      console.log(`📡 New WebSocket connection from ${clientIp}`);
      
      // Set client properties
      ws.isAlive = true;
      ws.clientId = this.generateClientId();
      ws.connectedAt = new Date().toISOString();
      ws.lastPingAt = new Date().toISOString();
      
      // Handle client messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle client disconnect
      ws.on('close', (code, reason) => {
        console.log(`📡 WebSocket disconnected: ${code} - ${reason}`);
        this.adminClients.delete(ws);
        this.userClients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.adminClients.delete(ws);
        this.userClients.delete(ws);
      });

      // Handle pong (heartbeat response)
      ws.on('pong', () => {
        ws.isAlive = true;
        ws.lastPingAt = new Date().toISOString();
      });

      // Send connection confirmation
      this.sendMessage(ws, {
        type: 'CONNECTION_CONFIRMED',
        clientId: ws.clientId,
        timestamp: new Date().toISOString(),
        server: 'BookingWebSocketServer v1.0'
      });
    });

    this.wss.on('error', (error) => {
      console.error('❌ WebSocket Server error:', error);
    });
  }

  setupHeartbeat() {
    // Ping clients every 30 seconds to keep connection alive
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.log('💀 Terminating dead connection');
          this.adminClients.delete(ws);
          this.userClients.delete(ws);
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  handleClientMessage(ws, data) {
    console.log('📨 WebSocket message received:', data);

    switch (data.type) {
      case 'ADMIN_CONNECT':
        this.handleAdminConnect(ws, data);
        break;
        
      case 'USER_CONNECT':
        this.handleUserConnect(ws, data);
        break;
        
      case 'PING':
        this.handlePing(ws, data);
        break;
        
      case 'NEW_BOOKING_CREATED':
        // Forward new booking to all admin clients
        this.broadcastToAdmins({
          type: 'NEW_BOOKING',
          booking: data.booking,
          timestamp: data.timestamp || new Date().toISOString(),
          source: data.source || 'user_booking'
        });
        break;
        
      case 'BOOKING_STATUS_UPDATE':
        // Forward status update to all clients
        this.broadcastToAll({
          type: 'BOOKING_STATUS_UPDATED',
          bookingId: data.bookingId,
          status: data.status,
          timestamp: data.timestamp || new Date().toISOString(),
          source: data.source || 'admin_update'
        });
        break;
        
      case 'BOOKING_PAYMENT_UPDATE':
        // Forward payment update to all clients
        this.broadcastToAll({
          type: 'BOOKING_PAYMENT_UPDATED',
          bookingId: data.bookingId,
          paymentStatus: data.paymentStatus,
          amountPaid: data.amountPaid,
          timestamp: data.timestamp || new Date().toISOString(),
          source: data.source || 'admin_update'
        });
        break;
        
      default:
        console.log('❓ Unknown message type:', data.type);
        this.sendError(ws, `Unknown message type: ${data.type}`);
    }
  }

  handleAdminConnect(ws, data) {
    console.log('🔐 Admin client connected');
    ws.clientType = 'admin';
    this.adminClients.add(ws);
    
    this.sendMessage(ws, {
      type: 'ADMIN_CONNECTED',
      clientId: ws.clientId,
      timestamp: new Date().toISOString(),
      adminCount: this.adminClients.size
    });
  }

  handleUserConnect(ws, data) {
    console.log('👤 User client connected');
    ws.clientType = 'user';
    this.userClients.add(ws);
    
    this.sendMessage(ws, {
      type: 'USER_CONNECTED',
      clientId: ws.clientId,
      timestamp: new Date().toISOString(),
      userCount: this.userClients.size
    });
  }

  handlePing(ws, data) {
    this.sendMessage(ws, {
      type: 'PONG',
      timestamp: new Date().toISOString(),
      clientId: ws.clientId
    });
  }

  // Broadcast new booking to all admin clients
  broadcastNewBooking(bookingData) {
    console.log(`📢 Broadcasting new booking to ${this.adminClients.size} admin clients`);
    
    const message = {
      type: 'NEW_BOOKING',
      booking: bookingData,
      timestamp: new Date().toISOString(),
      source: 'api_creation'
    };

    this.broadcastToAdmins(message);
  }

  // Broadcast to all admin clients
  broadcastToAdmins(message) {
    if (this.adminClients.size === 0) {
      console.log('⚠️ No admin clients connected to receive broadcast');
      return;
    }

    console.log(`📢 Broadcasting to ${this.adminClients.size} admin clients:`, message.type);
    
    this.adminClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message);
      } else {
        console.log('🗑️ Removing dead admin client');
        this.adminClients.delete(client);
      }
    });
  }

  // Broadcast to all user clients
  broadcastToUsers(message) {
    if (this.userClients.size === 0) {
      console.log('⚠️ No user clients connected to receive broadcast');
      return;
    }

    console.log(`📢 Broadcasting to ${this.userClients.size} user clients:`, message.type);
    
    this.userClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message);
      } else {
        console.log('🗑️ Removing dead user client');
        this.userClients.delete(client);
      }
    });
  }

  // Broadcast to all clients
  broadcastToAll(message) {
    console.log(`📢 Broadcasting to all clients:`, message.type);
    this.broadcastToAdmins(message);
    this.broadcastToUsers(message);
  }

  // Send message to specific client
  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('❌ Error sending WebSocket message:', error);
      }
    }
  }

  // Send error message
  sendError(ws, errorMessage) {
    this.sendMessage(ws, {
      type: 'ERROR',
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  // Generate unique client ID
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get connection statistics
  getStats() {
    return {
      totalConnections: this.wss.clients.size,
      adminConnections: this.adminClients.size,
      userConnections: this.userClients.size,
      timestamp: new Date().toISOString()
    };
  }

  // Close all connections and server
  close() {
    console.log('📡 Closing BookingWebSocketServer...');
    
    this.wss.clients.forEach((client) => {
      client.close(1000, 'Server shutting down');
    });
    
    this.wss.close();
    console.log('✅ BookingWebSocketServer closed');
  }
}

module.exports = BookingWebSocketServer;

// backend/routes/bookings.js - Updated to include WebSocket notifications
const express = require('express');
const router = express.Router();
const Booking = require('../models/Bookings'); // Your booking model

// Inject WebSocket server instance (you'll do this in your main server file)
let wsServer = null;

const setWebSocketServer = (webSocketServer) => {
  wsServer = webSocketServer;
};

// POST /api/bookings - Create new booking with real-time notification
router.post('/', async (req, res) => {
  try {
    console.log('📝 Creating new booking...');
    console.log('Request body:', req.body);

    // Create booking in database
    const newBooking = new Booking(req.body);
    const savedBooking = await newBooking.save();

    console.log('✅ Booking saved to database:', savedBooking._id);

    // IMPORTANT: Broadcast to admin clients via WebSocket
    if (wsServer) {
      console.log('📡 Broadcasting new booking via WebSocket...');
      wsServer.broadcastNewBooking(savedBooking);
    } else {
      console.warn('⚠️ WebSocket server not available for real-time notification');
    }

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      bookingId: savedBooking._id,
      ...savedBooking.toObject()
    });

  } catch (error) {
    console.error('❌ Error creating booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message
    });
  }
});

// PATCH /api/bookings/:id/status - Update booking status with real-time notification
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Broadcast status update via WebSocket
    if (wsServer) {
      wsServer.broadcastToAll({
        type: 'BOOKING_STATUS_UPDATED',
        bookingId: id,
        status: status,
        timestamp: new Date().toISOString(),
        source: 'admin_update'
      });
    }

    res.json({
      success: true,
      message: 'Booking status updated',
      status: updatedBooking.status
    });

  } catch (error) {
    console.error('❌ Error updating booking status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
      error: error.message
    });
  }
});

module.exports = { router, setWebSocketServer };