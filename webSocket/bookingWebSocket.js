// bokingwebsocket.js - CLEAN VERSION
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
        path: '/ws/bookings'
      });

      this.wss.on('connection', (ws, req) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        this.clients.set(clientId, {
          id: clientId,
          ws: ws,
          type: 'unknown',
          connectedAt: new Date()
        });

        console.log(`📱 Client connected: ${clientId}`);

        // Send welcome message
        ws.send(JSON.stringify({
          type: 'connection_established',
          clientId: clientId,
          message: 'Connected to booking notifications'
        }));

        // Handle messages
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(clientId, message);
          } catch (error) {
            console.error('❌ Message parse error:', error);
          }
        });

        // Handle disconnect
        ws.on('close', () => {
          console.log(`📵 Client disconnected: ${clientId}`);
          this.clients.delete(clientId);
        });

        // Handle errors
        ws.on('error', (error) => {
          console.error(`❌ WebSocket error: ${clientId}:`, error);
          this.clients.delete(clientId);
        });
      });

      console.log('✅ WebSocket server initialized successfully');
    } catch (error) {
      console.error('❌ WebSocket initialization error:', error);
      throw error;
    }
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'identify':
        client.type = message.clientType;
        console.log(`👤 Client ${clientId} identified as: ${message.clientType}`);
        client.ws.send(JSON.stringify({
          type: 'identification_confirmed',
          clientType: client.type
        }));
        break;
      
      case 'subscribe_booking_updates':
        client.subscribedToBookings = true;
        console.log(`📻 Client ${clientId} subscribed to booking updates`);
        client.ws.send(JSON.stringify({
          type: 'subscription_confirmed',
          subscription: 'booking_updates'
        }));
        break;
        
      default:
        console.log(`❓ Unknown message: ${message.type}`);
    }
  }

  broadcastToType(clientType, message) {
    let sentCount = 0;
    
    this.clients.forEach((client) => {
      if (client.type === clientType && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error('❌ Send error:', error);
        }
      }
    });

    console.log(`📢 Broadcasted to ${sentCount} ${clientType} clients`);
    return sentCount;
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

    this.broadcastToType('admin', message);
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

    this.broadcastToType('admin', message);
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

    this.broadcastToType('admin', message);
  }

  getStats() {
    const stats = {
      totalConnections: this.clients.size,
      adminConnections: 0,
      userConnections: 0,
      unknownConnections: 0
    };

    this.clients.forEach((client) => {
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

  close() {
    console.log('🔌 Closing WebSocket server...');
    
    if (this.wss) {
      this.clients.forEach((client) => {
        try {
          client.ws.close(1000, 'Server shutdown');
        } catch (error) {
          console.error('Error closing client:', error);
        }
      });

      this.wss.close(() => {
        console.log('✅ WebSocket server closed');
      });
    }
  }
}

const bookingWebSocketServer = new BookingWebSocketServer();
module.exports = bookingWebSocketServer;