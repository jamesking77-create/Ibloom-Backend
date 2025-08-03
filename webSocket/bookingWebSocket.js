// bokingwebsocket.js - FIXED VERSION with CORS support
const WebSocket = require('ws');

class BookingWebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Map();
  }

  initialize(server) {
    console.log('🔌 Initializing WebSocket server...');
    
    try {
      this.wss = new WebSocket.Server({ 
        server,
        path: '/websocket',
        // Add CORS support
        verifyClient: (info) => {
          // Allow all origins in production, or specify your frontend URL
          const allowedOrigins = [
            'https://ibloomrentals.com',
            'http://localhost:3000',
            'http://localhost:3001',
            'https://localhost:3001'
          ];
          
          const origin = info.origin;
          console.log('🔍 WebSocket connection attempt from origin:', origin);
          
          // In production, you might want to be more restrictive
          if (process.env.NODE_ENV === 'production') {
            return allowedOrigins.includes(origin) || !origin; // Allow no origin for native apps
          }
          
          return true; // Allow all in development
        }
      });

      // Handle server errors
      this.wss.on('error', (error) => {
        console.error('❌ WebSocket Server Error:', error);
      });

      this.wss.on('connection', (ws, req) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        // Log connection details
        console.log('📱 New WebSocket connection:', {
          clientId,
          origin: req.headers.origin,
          userAgent: req.headers['user-agent'],
          ip: req.connection.remoteAddress || req.socket.remoteAddress
        });
        
        this.clients.set(clientId, {
          id: clientId,
          ws: ws,
          type: 'unknown',
          connectedAt: new Date(),
          ip: req.connection.remoteAddress || req.socket.remoteAddress
        });

        console.log(`📱 Client connected: ${clientId} (Total: ${this.clients.size})`);

        // Send welcome message immediately
        const welcomeMessage = {
          type: 'connection_established',
          clientId: clientId,
          message: 'Connected to booking notifications',
          serverTime: new Date().toISOString()
        };
        
        try {
          ws.send(JSON.stringify(welcomeMessage));
          console.log('✅ Welcome message sent to:', clientId);
        } catch (error) {
          console.error('❌ Failed to send welcome message:', error);
        }

        // Handle messages
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            console.log(`📥 Message from ${clientId}:`, message.type);
            this.handleMessage(clientId, message);
          } catch (error) {
            console.error('❌ Message parse error:', error);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid message format'
            }));
          }
        });

        // Handle disconnect
        ws.on('close', (code, reason) => {
          console.log(`📵 Client disconnected: ${clientId} (Code: ${code}, Reason: ${reason})`);
          this.clients.delete(clientId);
          console.log(`📊 Remaining connections: ${this.clients.size}`);
        });

        // Handle errors
        ws.on('error', (error) => {
          console.error(`❌ WebSocket client error: ${clientId}:`, error);
          this.clients.delete(clientId);
        });

        // Send ping every 30 seconds to keep connection alive
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.ping();
            } catch (error) {
              console.error('❌ Ping error:', error);
              clearInterval(pingInterval);
            }
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);

        // Handle pong responses
        ws.on('pong', () => {
          console.log(`🏓 Pong received from ${clientId}`);
        });
      });

      console.log('✅ WebSocket server initialized successfully on path: /websocket');
      console.log(`📊 Server ready to accept connections`);
      
    } catch (error) {
      console.error('❌ WebSocket initialization error:', error);
      throw error;
    }
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`⚠️ Message from unknown client: ${clientId}`);
      return;
    }

    switch (message.type) {
      case 'identify':
        client.type = message.clientType;
        client.userId = message.userId;
        console.log(`👤 Client ${clientId} identified as: ${message.clientType}`);
        
        const confirmMessage = {
          type: 'identification_confirmed',
          clientType: client.type,
          timestamp: new Date().toISOString()
        };
        
        try {
          client.ws.send(JSON.stringify(confirmMessage));
        } catch (error) {
          console.error('❌ Failed to send identification confirmation:', error);
        }
        break;
      
      case 'subscribe_booking_updates':
        client.subscribedToBookings = true;
        console.log(`📻 Client ${clientId} subscribed to booking updates`);
        
        const subMessage = {
          type: 'subscription_confirmed',
          subscription: 'booking_updates',
          timestamp: new Date().toISOString()
        };
        
        try {
          client.ws.send(JSON.stringify(subMessage));
        } catch (error) {
          console.error('❌ Failed to send subscription confirmation:', error);
        }
        break;

      case 'ping':
        try {
          client.ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          console.error('❌ Failed to send pong:', error);
        }
        break;
        
      default:
        console.log(`❓ Unknown message from ${clientId}: ${message.type}`);
        try {
          client.ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`
          }));
        } catch (error) {
          console.error('❌ Failed to send error response:', error);
        }
    }
  }

  broadcastToType(clientType, message) {
    let sentCount = 0;
    let totalTargets = 0;
    
    this.clients.forEach((client) => {
      if (client.type === clientType) {
        totalTargets++;
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.send(JSON.stringify({
              ...message,
              timestamp: new Date().toISOString()
            }));
            sentCount++;
          } catch (error) {
            console.error(`❌ Send error to ${client.id}:`, error);
            // Remove dead connections
            this.clients.delete(client.id);
          }
        } else {
          console.warn(`⚠️ Client ${client.id} connection not open (state: ${client.ws.readyState})`);
          // Clean up dead connections
          this.clients.delete(client.id);
        }
      }
    });

    console.log(`📢 Broadcasted to ${sentCount}/${totalTargets} ${clientType} clients`);
    return { sent: sentCount, total: totalTargets };
  }

  emitNewBooking(bookingData) {
    console.log('🔔 Emitting new booking:', bookingData.bookingId || bookingData._id);
    
    const message = {
      type: 'new_booking',
      data: {
        bookingId: bookingData.bookingId || bookingData._id,
        customerName: bookingData.customer?.personalInfo?.name,
        eventType: bookingData.customer?.eventDetails?.eventType,
        total: bookingData.pricing?.formatted?.total,
        timestamp: new Date().toISOString()
      }
    };

    return this.broadcastToType('admin', message);
  }

  emitBookingStatusUpdate(bookingId, oldStatus, newStatus, bookingData = {}) {
    console.log(`🔄 Emitting status update: ${bookingId} (${oldStatus} → ${newStatus})`);
    
    const message = {
      type: 'booking_status_update',
      data: {
        bookingId,
        oldStatus,
        newStatus,
        customerName: bookingData.customer?.personalInfo?.name,
        timestamp: new Date().toISOString()
      }
    };

    return this.broadcastToType('admin', message);
  }

  emitBookingDeletion(bookingId, bookingData = {}) {
    console.log(`🗑️ Emitting deletion: ${bookingId}`);
    
    const message = {
      type: 'booking_deleted',
      data: {
        bookingId,
        customerName: bookingData.customerName,
        timestamp: new Date().toISOString()
      }
    };

    return this.broadcastToType('admin', message);
  }

  getStats() {
    const stats = {
      totalConnections: this.clients.size,
      adminConnections: 0,
      userConnections: 0,
      unknownConnections: 0,
      connections: []
    };

    this.clients.forEach((client) => {
      const clientInfo = {
        id: client.id,
        type: client.type,
        connectedAt: client.connectedAt,
        ip: client.ip,
        state: client.ws.readyState
      };
      
      stats.connections.push(clientInfo);
      
      switch (client.type) {
        case 'admin':
          stats.adminConnections++;
          break;
        case 'user':
          stats.userConnections++;
          break;
        default:
          stats.unknownConnections++;
      }
    });

    return stats;
  }

  // Method to check server health
  healthCheck() {
    const stats = this.getStats();
    console.log('🏥 WebSocket Health Check:', {
      isRunning: !!this.wss,
      connections: stats.totalConnections,
      breakdown: {
        admin: stats.adminConnections,
        user: stats.userConnections,
        unknown: stats.unknownConnections
      }
    });
    return stats;
  }

  close() {
    console.log('🔌 Closing WebSocket server...');
    
    if (this.wss) {
      // Notify all clients about shutdown
      const shutdownMessage = {
        type: 'server_shutdown',
        message: 'Server is shutting down',
        timestamp: new Date().toISOString()
      };

      this.clients.forEach((client) => {
        try {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(shutdownMessage));
            client.ws.close(1000, 'Server shutdown');
          }
        } catch (error) {
          console.error('Error closing client:', error);
        }
      });

      this.clients.clear();

      this.wss.close(() => {
        console.log('✅ WebSocket server closed');
      });
    }
  }
}

const bookingWebSocketServer = new BookingWebSocketServer();
module.exports = bookingWebSocketServer;