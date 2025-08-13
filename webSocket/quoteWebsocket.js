// // webSocket/quoteWebSocket.js - Complete WebSocket for Quotes
// const WebSocket = require('ws');
// const jwt = require('jsonwebtoken');

// class QuoteWebSocketServer {
//   constructor() {
//     this.clients = new Map(); // Map to store client connections
//     this.wss = null;
//   }

//   initialize(server) {
//     // Create WebSocket server on /ws/quotes path
//     this.wss = new WebSocket.Server({ 
//       server,
//       path: '/ws/quotes',
//       verifyClient: (info) => {
//         console.log('🔌 Quote WebSocket connection attempt from:', info.origin);
//         return true; // Allow all connections for now
//       }
//     });

//     this.wss.on('connection', (ws, req) => {
//       console.log('📱 New Quote WebSocket connection');
      
//       // Initialize client data
//       const clientId = this.generateClientId();
//       this.clients.set(clientId, {
//         ws,
//         authenticated: false,
//         userType: null,
//         userId: null,
//         connectedAt: new Date()
//       });

//       // Handle messages from client
//       ws.on('message', (message) => {
//         try {
//           const data = JSON.parse(message);
//           this.handleMessage(clientId, data);
//         } catch (error) {
//           console.error('❌ Error parsing Quote WebSocket message:', error);
//           this.sendToClient(clientId, {
//             type: 'error',
//             message: 'Invalid message format'
//           });
//         }
//       });

//       // Handle client disconnect
//       ws.on('close', (code, reason) => {
//         console.log(`📵 Quote WebSocket client disconnected: ${clientId}`, code, reason?.toString());
//         this.clients.delete(clientId);
//       });

//       // Handle errors
//       ws.on('error', (error) => {
//         console.error('❌ Quote WebSocket error:', error);
//         this.clients.delete(clientId);
//       });

//       // Send initial connection confirmation
//       this.sendToClient(clientId, {
//         type: 'connection_established',
//         clientId,
//         timestamp: new Date().toISOString()
//       });
//     });

//     console.log('✅ Quote WebSocket server initialized on path: /ws/quotes');
//   }

//   generateClientId() {
//     return `quote_client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
//   }

//   handleMessage(clientId, data) {
//     const client = this.clients.get(clientId);
//     if (!client) return;

//     console.log('📥 Quote WebSocket message from', clientId, ':', data.type);

//     switch (data.type) {
//       case 'authenticate':
//         this.handleAuthentication(clientId, data);
//         break;
        
//       case 'ping':
//         this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
//         break;
        
//       default:
//         console.log('❓ Unknown Quote WebSocket message type:', data.type);
//         this.sendToClient(clientId, {
//           type: 'error',
//           message: `Unknown message type: ${data.type}`
//         });
//     }
//   }

//   async handleAuthentication(clientId, data) {
//     const client = this.clients.get(clientId);
//     if (!client) return;

//     try {
//       if (data.token) {
//         // Verify JWT token
//         const decoded = jwt.verify(data.token, process.env.JWT_SECRET || 'your-secret-key');
        
//         client.authenticated = true;
//         client.userType = data.clientType || 'user';
//         client.userId = decoded.id || decoded.userId;
        
//         console.log('✅ Quote WebSocket client authenticated:', clientId, client.userType);
        
//         this.sendToClient(clientId, {
//           type: 'authentication_success',
//           userType: client.userType,
//           userId: client.userId
//         });
//       } else {
//         // Allow unauthenticated connections for public features
//         client.authenticated = true;
//         client.userType = data.clientType || 'guest';
        
//         this.sendToClient(clientId, {
//           type: 'authentication_success',
//           userType: client.userType
//         });
//       }
//     } catch (error) {
//       console.error('❌ Quote WebSocket authentication failed:', error);
//       this.sendToClient(clientId, {
//         type: 'authentication_failed',
//         message: 'Invalid token'
//       });
//     }
//   }

//   sendToClient(clientId, data) {
//     const client = this.clients.get(clientId);
//     if (client && client.ws.readyState === WebSocket.OPEN) {
//       try {
//         client.ws.send(JSON.stringify(data));
//       } catch (error) {
//         console.error('❌ Error sending to Quote WebSocket client:', error);
//         this.clients.delete(clientId);
//       }
//     }
//   }

//   broadcast(data, filter = null) {
//     const message = JSON.stringify(data);
//     let sentCount = 0;

//     this.clients.forEach((client, clientId) => {
//       if (client.ws.readyState === WebSocket.OPEN) {
//         // Apply filter if provided
//         if (filter && !filter(client)) {
//           return;
//         }

//         try {
//           client.ws.send(message);
//           sentCount++;
//         } catch (error) {
//           console.error('❌ Error broadcasting to Quote WebSocket client:', error);
//           this.clients.delete(clientId);
//         }
//       }
//     });

//     console.log(`📡 Quote WebSocket broadcast sent to ${sentCount} clients:`, data.type);
//   }

//   // Emit when new quote is created
//   emitNewQuote(quoteData) {
//     console.log('🆕 Emitting new quote notification:', quoteData.quoteId);
    
//     this.broadcast({
//       type: 'new_quote',
//       data: {
//         _id: quoteData._id,
//         quoteId: quoteData.quoteId,
//         customer: {
//           name: quoteData.customer?.name,
//           email: quoteData.customer?.email,
//           phone: quoteData.customer?.phone
//         },
//         categoryName: quoteData.categoryName,
//         status: quoteData.status,
//         totalItems: quoteData.items?.length || 0,
//         createdAt: quoteData.createdAt,
//         viewedByAdmin: false
//       },
//       timestamp: new Date().toISOString()
//     }, (client) => {
//       // Only send to admin clients
//       return client.userType === 'admin' && client.authenticated;
//     });
//   }

//   // Emit when quote status is updated
//   emitQuoteStatusUpdate(quoteId, oldStatus, newStatus, quoteData) {
//     console.log('🔄 Emitting quote status update:', quoteId, oldStatus, '->', newStatus);
    
//     this.broadcast({
//       type: 'quote_status_updated',
//       data: {
//         quoteId,
//         oldStatus,
//         newStatus,
//         updatedAt: new Date().toISOString(),
//         quote: quoteData
//       },
//       timestamp: new Date().toISOString()
//     }, (client) => {
//       // Send to admin clients
//       return client.userType === 'admin' && client.authenticated;
//     });
//   }

//   // Emit when quote is deleted
//   emitQuoteDeletion(quoteId, metadata = {}) {
//     console.log('🗑️ Emitting quote deletion:', quoteId);
    
//     this.broadcast({
//       type: 'quote_deleted',
//       data: {
//         quoteId,
//         ...metadata,
//         deletedAt: new Date().toISOString()
//       },
//       timestamp: new Date().toISOString()
//     }, (client) => {
//       // Send to admin clients
//       return client.userType === 'admin' && client.authenticated;
//     });
//   }

//   // Emit when quote response is created
//   emitQuoteResponseCreated(quoteId, quoteData) {
//     console.log('📝 Emitting quote response created:', quoteId);
    
//     this.broadcast({
//       type: 'quote_response_created',
//       data: {
//         quoteId,
//         response: quoteData.response,
//         status: quoteData.status,
//         respondedAt: quoteData.respondedAt
//       },
//       timestamp: new Date().toISOString()
//     }, (client) => {
//       // Send to admin clients
//       return client.userType === 'admin' && client.authenticated;
//     });
//   }

//   // Get connection stats
//   getStats() {
//     const stats = {
//       totalConnections: this.clients.size,
//       authenticatedConnections: 0,
//       adminConnections: 0,
//       guestConnections: 0
//     };

//     this.clients.forEach((client) => {
//       if (client.authenticated) {
//         stats.authenticatedConnections++;
//       }
//       if (client.userType === 'admin') {
//         stats.adminConnections++;
//       }
//       if (client.userType === 'guest') {
//         stats.guestConnections++;
//       }
//     });

//     return stats;
//   }

//   // Cleanup disconnected clients
//   cleanup() {
//     const disconnectedClients = [];
    
//     this.clients.forEach((client, clientId) => {
//       if (client.ws.readyState !== WebSocket.OPEN) {
//         disconnectedClients.push(clientId);
//       }
//     });

//     disconnectedClients.forEach(clientId => {
//       this.clients.delete(clientId);
//     });

//     if (disconnectedClients.length > 0) {
//       console.log(`🧹 Cleaned up ${disconnectedClients.length} disconnected Quote WebSocket clients`);
//     }
//   }
// }

// // Create singleton instance
// const quoteWebSocketServer = new QuoteWebSocketServer();

// // Run cleanup every 30 seconds
// setInterval(() => {
//   quoteWebSocketServer.cleanup();
// }, 30000);

// module.exports = quoteWebSocketServer;