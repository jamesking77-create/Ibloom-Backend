// index.js - UPDATED VERSION with Quote Routes and WebSocket Integration
const express = require("express");
const cors = require("cors");
const http = require("http");
require("dotenv").config();

// Import database connection
require("./config/database");

const bookingWebSocketServer = require("./webSocket/bookingWebSocket");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        process.env.FRONTEND_URL,
        'https://ibloomrentals.com'
      ].filter(Boolean) // Remove any undefined values
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔧 NEW: Make WebSocket server available globally for quotes
// This allows your quote controller to send WebSocket notifications
app.use((req, res, next) => {
  req.wss = bookingWebSocketServer; // Attach WebSocket server to request
  next();
});

// 🔧 NEW: Global WebSocket helper for quote notifications
global.emitQuoteNotification = (eventType, data) => {
  try {
    if (bookingWebSocketServer && bookingWebSocketServer.broadcast) {
      bookingWebSocketServer.broadcast({
        type: eventType,
        module: 'quotes', // 🔧 Distinguish from booking events
        data: data,
        timestamp: new Date().toISOString()
      });
      console.log(`📡 Quote WebSocket notification sent: ${eventType}`);
    }
  } catch (error) {
    console.error('❌ Failed to send quote WebSocket notification:', error);
  }
};

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    websocket: {
      initialized: !!bookingWebSocketServer.wss,
      stats: bookingWebSocketServer.getStats()
    },
    quotes: {
      enabled: true,
      websocketIntegration: true
    }
  });
});

// Routes
const authRoutes = require("./routes/authRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const userRoutes = require("./routes/userRoutes");
const orderRoutes = require("./routes/orderRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const mailRoutes = require("./routes/mailRoutes");
const quoteRoutes = require("./routes/quoteRoutes"); // 🔧 Quote routes

app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/mailer", mailRoutes);
app.use("/api/quotes", quoteRoutes); // 🔧 Quote endpoints

// WebSocket stats endpoint (Enhanced for quotes)
app.get("/api/websocket/stats", (req, res) => {
  try {
    const stats = bookingWebSocketServer.getStats();
    res.status(200).json({
      success: true,
      stats: {
        ...stats,
        supportedModules: ['bookings', 'quotes'], // 🔧 Show supported modules
        quoteNotifications: true
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 🔧 NEW: Quote WebSocket test endpoint (for debugging)
app.post("/api/quotes/test-websocket", (req, res) => {
  try {
    global.emitQuoteNotification('test_quote_notification', {
      message: 'WebSocket test for quotes',
      timestamp: new Date().toISOString()
    });
    
    res.status(200).json({
      success: true,
      message: 'Quote WebSocket test notification sent'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Server setup
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
  console.log(`📍 Health check available at: http://${HOST}:${PORT}/health`);
  console.log(`📊 WebSocket stats available at: http://${HOST}:${PORT}/api/websocket/stats`);
  console.log(`📝 Quote endpoints available at: http://${HOST}:${PORT}/api/quotes`); // 🔧 Quote endpoints
  console.log(`🧪 Quote WebSocket test: POST http://${HOST}:${PORT}/api/quotes/test-websocket`); // 🔧 Test endpoint
  
  try {
    console.log("🔌 Initializing WebSocket server...");
    bookingWebSocketServer.initialize(server);
    console.log(`✅ WebSocket server initialized at: ws://${HOST}:${PORT}/websocket`);
    console.log(`📡 WebSocket supports: bookings, quotes`); // 🔧 Show supported modules
  } catch (error) {
    console.error('❌ Failed to initialize WebSocket server:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
  }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  bookingWebSocketServer.close();
  server.close((err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

module.exports = app;