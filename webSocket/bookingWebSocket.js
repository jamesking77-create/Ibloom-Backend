// bookingWebSocket.js - FIXED VERSION with proper CORS support
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
        // FIXED: Enhanced CORS support for cross-device communication
        verifyClient: (info) => {
          const allowedOrigins = [
            'https://ibloomrentals.com',
            'https://www.ibloomrentals.com',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
            'https://localhost:3001',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5173',
            // Add your Netlify preview URLs if needed
            /^https:\/\/.*\.netlify\.app$/,
            // Add your frontend production domain
            /^https:\/\/ibloomrentals\.com$/,
          ];
          
          const origin = info.origin;
          const userAgent = info.req.headers['user-agent'] || '';
          const ip = info.req.connection.remoteAddress || info.req.socket.remoteAddress;
          
          console.log('🔍 WebSocket connection attempt:', {
            origin,
            ip,
            userAgent: userAgent.substring(0, 100) + '...',
            timestamp: new Date().toISOString()
          });
          
          // FIXED: More permissive CORS for mobile devices
          if (process.env.NODE_ENV === 'production') {
            // In production, be more permissive for mobile apps
            if (!origin) {
              console.log('✅ Allowing connection without origin (likely mobile app)');
              return true; // Allow mobile apps and native clients
            }
            
            // Check against allowed origins (including regex patterns)
            const isAllowed = allowedOrigins.some(allowed => {
              if (typeof allowed === 'string') {
                return origin === allowed;
              } else if (allowed instanceof RegExp) {
                return allowed.test(origin);
              }
              return false;
            });
            
            if (isAllowed) {
              console.log('✅ Origin allowed:', origin);
              return true;
            }
            
            console.log('❌ Origin not allowed:', origin);
            return false;
          }
          
          // Development - allow all
          console.log('✅ Development mode - allowing all connections');
          return true;
        }
      });

      // Handle server errors
      this.wss.on('error', (error) => {
        console.error('❌ WebSocket Server Error:', error);
      });

      this.wss.on('connection', (ws, req) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        // Extract more connection info
        const clientInfo = {
          ip: req.connection.remoteAddress || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          origin: req.headers.origin,
          forwarded: req.headers['x-forwarded-for'],
          realIp: req.headers['x-real-ip'],
        };
        
        // Log connection details
        console.log('📱 New WebSocket connection:', {
          clientId,
          ...clientInfo,
          timestamp: new Date().toISOString()
        });
        
        this.clients.set(clientId, {
          id: clientId,
          ws: ws,
          type: 'unknown',
          connectedAt: new Date(),
          ...clientInfo,
          lastPing: new Date(),
          isAlive: true
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
            
            // Update last activity
            const client = this.clients.get(clientId);
            if (client) {
              client.lastPing = new Date();
              client.isAlive = true;
            }
          } catch (error) {
            console.error('❌ Message parse error:', error);
            try {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
              }));
            } catch (sendError) {
              console.error('❌ Failed to send error response:', sendError);
            }
          }
        });

        // Handle disconnect
        ws.on('close', (code, reason) => {
          console.log(`📵 Client disconnected: ${clientId}`, {
            code, 
            reason: reason.toString(),
            timestamp: new Date().toISOString()
          });
          this.clients.delete(clientId);
          console.log(`📊 Remaining connections: ${this.clients.size}`);
        });

        // Handle errors
        ws.on('error', (error) => {
          console.error(`❌ WebSocket client error: ${clientId}:`, error);
          this.clients.delete(clientId);
        });

        // Handle pong responses (keep connection alive)
        ws.on('pong', () => {
          console.log(`🏓 Pong received from ${clientId}`);
          const client = this.clients.get(clientId);
          if (client) {
            client.isAlive = true;
            client.lastPing = new Date();
          }
        });

        // FIXED: Improved heartbeat mechanism
        const pingInterval = setInterval(() => {
          const client = this.clients.get(clientId);
          if (!client) {
            clearInterval(pingInterval);
            return;
          }

          if (ws.readyState === WebSocket.OPEN) {
            try {
              // Check if client responded to last ping
              const timeSinceLastPing = Date.now() - client.lastPing.getTime();
              if (timeSinceLastPing > 60000) { // 60 seconds without response
                console.warn(`⚠️ Client ${clientId} appears unresponsive, closing connection`);
                ws.terminate();
                clearInterval(pingInterval);
                return;
              }

              // Send ping
              client.isAlive = false;
              ws.ping();
            } catch (error) {
              console.error('❌ Ping error:', error);
              clearInterval(pingInterval);
              this.clients.delete(clientId);
            }
          } else {
            console.log(`📵 Client ${clientId} connection not open, clearing ping interval`);
            clearInterval(pingInterval);
            this.clients.delete(clientId);
          }
        }, 30000); // Ping every 30 seconds
      });

      console.log('✅ WebSocket server initialized successfully on path: /websocket');
      console.log(`📊 Server ready to accept connections`);
      
      // FIXED: Add periodic cleanup for dead connections
      setInterval(() => {
        this.cleanupDeadConnections();
      }, 60000); // Cleanup every minute
      
    } catch (error) {
      console.error('❌ WebSocket initialization error:', error);
      throw error;
    }
  }

  // FIXED: Add method to clean up dead connections
  cleanupDeadConnections() {
    let cleanedUp = 0;
    this.clients.forEach((client, clientId) => {
      if (client.ws.readyState !== WebSocket.OPEN) {
        console.log(`🧹 Cleaning up dead connection: ${clientId}`);
        this.clients.delete(clientId);
        cleanedUp++;
      }
    });
    
    if (cleanedUp > 0) {
      console.log(`🧹 Cleaned up ${cleanedUp} dead connections. Active: ${this.clients.size}`);
    }
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`⚠️ Message from unknown client: ${clientId}`);
      return;
    }

    // Update client activity
    client.lastPing = new Date();

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
    let failedClients = [];
    
    this.clients.forEach((client, clientId) => {
      if (client.type === clientType) {
        totalTargets++;
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.send(JSON.stringify({
              ...message,
              timestamp: new Date().toISOString()
            }));
            sentCount++;
            console.log(`📤 Message sent to ${clientType} client: ${clientId}`);
          } catch (error) {
            console.error(`❌ Send error to ${clientId}:`, error);
            failedClients.push(clientId);
          }
        } else {
          console.warn(`⚠️ Client ${clientId} connection not open (state: ${client.ws.readyState})`);
          failedClients.push(clientId);
        }
      }
    });

    // Clean up failed clients
    failedClients.forEach(clientId => {
      console.log(`🧹 Removing failed client: ${clientId}`);
      this.clients.delete(clientId);
    });

    console.log(`📢 Broadcasted to ${sentCount}/${totalTargets} ${clientType} clients`);
    return { sent: sentCount, total: totalTargets, failed: failedClients.length };
  }

  emitNewBooking(bookingData) {
    console.log('🔔 Emitting new booking notification:', bookingData.bookingId || bookingData._id);
    
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

    const result = this.broadcastToType('admin', message);
    console.log(`🔔 New booking broadcast result:`, result);
    return result;
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

    const result = this.broadcastToType('admin', message);
    console.log(`🔄 Status update broadcast result:`, result);
    return result;
  }

  emitBookingDeletion(bookingId, bookingData = {}) {
    console.log(`🗑️ Emitting deletion notification: ${bookingId}`);
    
    const message = {
      type: 'booking_deleted',
      data: {
        bookingId,
        customerName: bookingData.customerName,
        timestamp: new Date().toISOString()
      }
    };

    const result = this.broadcastToType('admin', message);
    console.log(`🗑️ Deletion broadcast result:`, result);
    return result;
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
        realIp: client.realIp,
        origin: client.origin,
        state: client.ws.readyState,
        isAlive: client.isAlive,
        lastPing: client.lastPing
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

  // FIXED: Enhanced close method
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