// index.js - SAFE VERSION with fixed wildcard route
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
    ? [process.env.FRONTEND_URL]
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    websocket: {
      initialized: !!bookingWebSocketServer.wss,
      stats: bookingWebSocketServer.getStats()
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

app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/mailer", mailRoutes);

// WebSocket stats endpoint
app.get("/api/websocket/stats", (req, res) => {
  try {
    const stats = bookingWebSocketServer.getStats();
    res.status(200).json({
      success: true,
      stats,
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

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 🔧 FIXED: Safer 404 handler - removed problematic wildcard
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
  
  try {
    console.log("🔌 Initializing WebSocket server...");
    bookingWebSocketServer.initialize(server);
    console.log(`✅ WebSocket server initialized at: ws://${HOST}:${PORT}/ws/bookings`);
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