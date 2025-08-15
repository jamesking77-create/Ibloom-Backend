// webSocket/genericWebSocket.js - ENHANCED VERSION supporting all modules
const WebSocket = require('ws');

class GenericWebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Map();
    this.moduleHandlers = new Map(); // Store module-specific handlers
  }

  initialize(server) {
    console.log('🔌 Initializing Generic WebSocket server...');
    
    try {
      this.wss = new WebSocket.Server({ 
        server,
        path: '/websocket',
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
            /^https:\/\/.*\.netlify\.app$/,
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
          
          if (process.env.NODE_ENV === 'production') {
            if (!origin) {
              console.log('✅ Allowing connection without origin (likely mobile app)');
              return true;
            }
            
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
          
          console.log('✅ Development mode - allowing all connections');
          return true;
        }
      });

      this.wss.on('error', (error) => {
        console.error('❌ WebSocket Server Error:', error);
      });

      this.wss.on('connection', (ws, req) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        const clientInfo = {
          ip: req.connection.remoteAddress || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          origin: req.headers.origin,
          forwarded: req.headers['x-forwarded-for'],
          realIp: req.headers['x-real-ip'],
        };
        
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
          isAlive: true,
          subscribedModules: new Set(), // Track which modules client is subscribed to
          userId: null,
          authenticated: false
        });

        console.log(`📱 Client connected: ${clientId} (Total: ${this.clients.size})`);

        // Send welcome message
        const welcomeMessage = {
          type: 'connection_established',
          clientId: clientId,
          message: 'Connected to real-time notifications',
          supportedModules: ['bookings', 'quotes', 'orders'],
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
            console.log(`📥 Message from ${clientId}:`, message.type, message.module || 'no-module');
            this.handleMessage(clientId, message);
            
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

        // Handle pong responses
        ws.on('pong', () => {
          const client = this.clients.get(clientId);
          if (client) {
            client.isAlive = true;
            client.lastPing = new Date();
          }
        });

        // Heartbeat mechanism
        const pingInterval = setInterval(() => {
          const client = this.clients.get(clientId);
          if (!client) {
            clearInterval(pingInterval);
            return;
          }

          if (ws.readyState === WebSocket.OPEN) {
            try {
              const timeSinceLastPing = Date.now() - client.lastPing.getTime();
              if (timeSinceLastPing > 60000) {
                console.warn(`⚠️ Client ${clientId} appears unresponsive, closing connection`);
                ws.terminate();
                clearInterval(pingInterval);
                return;
              }

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
        }, 30000);
      });

      console.log('✅ Generic WebSocket server initialized successfully on path: /websocket');
      console.log(`📊 Server ready to accept connections for modules: bookings, quotes, orders`);
      
      // Cleanup dead connections periodically
      setInterval(() => {
        this.cleanupDeadConnections();
      }, 60000);
      
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

    client.lastPing = new Date();

    switch (message.type) {
      case 'authenticate':
        this.handleAuthentication(clientId, message);
        break;
        
      case 'subscribe':
        this.handleSubscription(clientId, message);
        break;
        
      case 'unsubscribe':
        this.handleUnsubscription(clientId, message);
        break;
        
      case 'identify':
        client.type = message.clientType;
        client.userId = message.userId;
        console.log(`👤 Client ${clientId} identified as: ${message.clientType}`);
        
        try {
          client.ws.send(JSON.stringify({
            type: 'identification_confirmed',
            clientType: client.type,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          console.error('❌ Failed to send identification confirmation:', error);
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

  handleAuthentication(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // For now, simple authentication - you can enhance with JWT verification
      if (message.token) {
        // TODO: Add JWT verification here
        client.authenticated = true;
        client.userId = message.userId;
        client.type = message.clientType || 'user';
        
        console.log(`✅ Client ${clientId} authenticated as ${client.type}`);
        
        client.ws.send(JSON.stringify({
          type: 'authentication_success',
          clientType: client.type,
          modules: ['bookings', 'quotes', 'orders'],
          timestamp: new Date().toISOString()
        }));
      } else {
        client.ws.send(JSON.stringify({
          type: 'authentication_failed',
          message: 'No token provided'
        }));
      }
    } catch (error) {
      console.error('❌ Authentication error:', error);
      client.ws.send(JSON.stringify({
        type: 'authentication_failed',
        message: 'Authentication failed'
      }));
    }
  }

  handleSubscription(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { module } = message;
    const validModules = ['bookings', 'quotes', 'orders'];
    
    if (!validModules.includes(module)) {
      client.ws.send(JSON.stringify({
        type: 'subscription_failed',
        message: `Invalid module: ${module}`,
        validModules
      }));
      return;
    }

    client.subscribedModules.add(module);
    
    console.log(`📻 Client ${clientId} subscribed to ${module} updates`);
    
    try {
      client.ws.send(JSON.stringify({
        type: 'subscription_confirmed',
        module: module,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to send subscription confirmation:', error);
    }
  }

  handleUnsubscription(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { module } = message;
    client.subscribedModules.delete(module);
    
    console.log(`📻 Client ${clientId} unsubscribed from ${module} updates`);
    
    try {
      client.ws.send(JSON.stringify({
        type: 'unsubscription_confirmed',
        module: module,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to send unsubscription confirmation:', error);
    }
  }

  // Generic broadcast method
  broadcast(message, filter = null) {
    let sentCount = 0;
    let totalTargets = 0;
    let failedClients = [];
    
    this.clients.forEach((client, clientId) => {
      // Apply filter if provided
      if (filter && !filter(client)) {
        return;
      }
      
      totalTargets++;
      
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify({
            ...message,
            timestamp: new Date().toISOString()
          }));
          sentCount++;
        } catch (error) {
          console.error(`❌ Send error to ${clientId}:`, error);
          failedClients.push(clientId);
        }
      } else {
        console.warn(`⚠️ Client ${clientId} connection not open (state: ${client.ws.readyState})`);
        failedClients.push(clientId);
      }
    });

    // Clean up failed clients
    failedClients.forEach(clientId => {
      this.clients.delete(clientId);
    });

    console.log(`📢 Broadcasted ${message.type} to ${sentCount}/${totalTargets} clients`);
    return { sent: sentCount, total: totalTargets, failed: failedClients.length };
  }

  // Legacy booking methods (for backward compatibility)
  broadcastToType(clientType, message) {
    return this.broadcast(message, (client) => client.type === clientType);
  }

  emitNewBooking(bookingData) {
    console.log('🔔 Emitting new booking notification:', bookingData.bookingId || bookingData._id);
    
    const message = {
      type: 'new_booking',
      module: 'bookings',
      data: {
        bookingId: bookingData.bookingId || bookingData._id,
        customerName: bookingData.customer?.personalInfo?.name,
        eventType: bookingData.customer?.eventDetails?.eventType,
        total: bookingData.pricing?.formatted?.total,
        timestamp: new Date().toISOString()
      }
    };

    return this.broadcast(message, (client) => {
      return client.type === 'admin' && client.subscribedModules.has('bookings');
    });
  }

  emitBookingStatusUpdate(bookingId, oldStatus, newStatus, bookingData = {}) {
    console.log(`🔄 Emitting booking status update: ${bookingId} (${oldStatus} → ${newStatus})`);
    
    const message = {
      type: 'booking_status_update',
      module: 'bookings',
      data: {
        bookingId,
        oldStatus,
        newStatus,
        customerName: bookingData.customer?.personalInfo?.name,
        timestamp: new Date().toISOString()
      }
    };

    return this.broadcast(message, (client) => {
      return client.type === 'admin' && client.subscribedModules.has('bookings');
    });
  }

  emitBookingDeletion(bookingId, bookingData = {}) {
    console.log(`🗑️ Emitting booking deletion notification: ${bookingId}`);
    
    const message = {
      type: 'booking_deleted',
      module: 'bookings',
      data: {
        bookingId,
        customerName: bookingData.customerName,
        timestamp: new Date().toISOString()
      }
    };

    return this.broadcast(message, (client) => {
      return client.type === 'admin' && client.subscribedModules.has('bookings');
    });
  }

  // NEW: Quote-specific methods
  emitNewQuote(quoteData) {
    console.log('🆕 Emitting new quote notification:', quoteData.quoteId || quoteData._id);
    
    const message = {
      type: 'new_quote',
      module: 'quotes',
      data: {
        _id: quoteData._id,
        quoteId: quoteData.quoteId,
        customer: {
          name: quoteData.customer?.name,
          email: quoteData.customer?.email,
          phone: quoteData.customer?.phone
        },
        categoryName: quoteData.categoryName,
        status: quoteData.status,
        totalItems: quoteData.totalItems || quoteData.items?.length || 0,
        createdAt: quoteData.createdAt,
        viewedByAdmin: quoteData.viewedByAdmin || false
      }
    };

    return this.broadcast(message, (client) => {
      return client.type === 'admin' && client.subscribedModules.has('quotes');
    });
  }

  emitQuoteStatusUpdate(quoteId, oldStatus, newStatus, quoteData = {}) {
    console.log(`🔄 Emitting quote status update: ${quoteId} (${oldStatus} → ${newStatus})`);
    
    const message = {
      type: 'quote_status_updated',
      module: 'quotes',
      data: {
        quoteId,
        _id: quoteData._id,
        oldStatus,
        newStatus,
        updatedAt: new Date().toISOString()
      }
    };

    return this.broadcast(message, (client) => {
      return client.type === 'admin' && client.subscribedModules.has('quotes');
    });
  }

  emitQuoteDeletion(quoteId, quoteData = {}) {
    console.log(`🗑️ Emitting quote deletion notification: ${quoteId}`);
    
    const message = {
      type: 'quote_deleted',
      module: 'quotes',
      data: {
        quoteId,
        _id: quoteData._id,
        customerName: quoteData.customerName || quoteData.customer?.name
      }
    };

    return this.broadcast(message, (client) => {
      return client.type === 'admin' && client.subscribedModules.has('quotes');
    });
  }

  emitQuoteResponseCreated(quoteId, quoteData) {
    console.log('📝 Emitting quote response created:', quoteId);
    
    const message = {
      type: 'quote_response_created',
      module: 'quotes',
      data: {
        quoteId,
        _id: quoteData._id,
        response: quoteData.response,
        status: quoteData.status,
        respondedAt: quoteData.respondedAt
      }
    };

    return this.broadcast(message, (client) => {
      return client.type === 'admin' && client.subscribedModules.has('quotes');
    });
  }

  cleanupDeadConnections() {
    let cleanedUp = 0;
    this.clients.forEach((client, clientId) => {
      if (client.ws.readyState !== WebSocket.OPEN) {
        this.clients.delete(clientId);
        cleanedUp++;
      }
    });
    
    if (cleanedUp > 0) {
      console.log(`🧹 Cleaned up ${cleanedUp} dead connections. Active: ${this.clients.size}`);
    }
  }

  getStats() {
    const stats = {
      totalConnections: this.clients.size,
      adminConnections: 0,
      userConnections: 0,
      unknownConnections: 0,
      authenticatedConnections: 0,
      moduleSubscriptions: {
        bookings: 0,
        quotes: 0,
        orders: 0
      },
      connections: []
    };

    this.clients.forEach((client) => {
      const clientInfo = {
        id: client.id,
        type: client.type,
        authenticated: client.authenticated,
        connectedAt: client.connectedAt,
        ip: client.ip,
        origin: client.origin,
        state: client.ws.readyState,
        isAlive: client.isAlive,
        lastPing: client.lastPing,
        subscribedModules: Array.from(client.subscribedModules)
      };
      
      stats.connections.push(clientInfo);
      
      if (client.authenticated) {
        stats.authenticatedConnections++;
      }
      
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

      // Count module subscriptions
      client.subscribedModules.forEach(module => {
        if (stats.moduleSubscriptions[module] !== undefined) {
          stats.moduleSubscriptions[module]++;
        }
      });
    });

    return stats;
  }

  close() {
    console.log('🔌 Closing Generic WebSocket server...');
    
    if (this.wss) {
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
        console.log('✅ Generic WebSocket server closed');
      });
    }
  }
}

const genericWebSocketServer = new GenericWebSocketServer();
module.exports = genericWebSocketServer;