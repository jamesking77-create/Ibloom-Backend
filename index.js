// index.js - UPDATED VERSION with Enhanced Category Routes
const express = require("express");
const cors = require("cors");
const http = require("http");
require("dotenv").config();
const User = require("./models/User");

// Import database connection
require("./config/database");

// UPDATED: Import generic WebSocket instead of booking-specific one
const genericWebSocketServer = require("./webSocket/genericWebSocket");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        process.env.FRONTEND_URL,
        'https://ibloomrentals.com'
      ].filter(Boolean)
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// UPDATED: Make generic WebSocket server available globally
app.use((req, res, next) => {
  req.wss = genericWebSocketServer;
  next();
});

// UPDATED: Global WebSocket helpers for all modules
global.genericWebSocket = genericWebSocketServer;

// Legacy helpers for backward compatibility
global.emitQuoteNotification = (eventType, data) => {
  try {
    if (genericWebSocketServer) {
      genericWebSocketServer.broadcast({
        type: eventType,
        module: 'quotes',
        data: data,
        timestamp: new Date().toISOString()
      }, (client) => {
        return client.type === 'admin' && client.subscribedModules.has('quotes');
      });
      console.log(`📡 Quote WebSocket notification sent: ${eventType}`);
    }
  } catch (error) {
    console.error('❌ Failed to send quote WebSocket notification:', error);
  }
};

// Health check route - ENHANCED
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    websocket: {
      initialized: !!genericWebSocketServer.wss,
      stats: genericWebSocketServer.getStats()
    },
    modules: {
      bookings: { enabled: true, websocketIntegration: true },
      quotes: { enabled: true, websocketIntegration: true },
      orders: { enabled: false, websocketIntegration: false },
      categories: { enabled: true, autoGenerateIds: true, subcategoriesSupport: true }
    }
  });
});

// Routes
const authRoutes = require("./routes/authRoutes");
const serviceRoutes = require("./routes/serviceRoutes"); // Updated with subcategory routes
const userRoutes = require("./routes/userRoutes");
const orderRoutes = require("./routes/orderRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const mailRoutes = require("./routes/mailRoutes");
const quoteRoutes = require("./routes/quoteRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes); // Now includes subcategory endpoints
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/mailer", mailRoutes);
app.use("/api/quotes", quoteRoutes);

// WebSocket stats endpoint - ENHANCED for all modules
app.get("/api/websocket/stats", (req, res) => {
  try {
    const stats = genericWebSocketServer.getStats();
    res.status(200).json({
      success: true,
      stats: {
        ...stats,
        supportedModules: ['bookings', 'quotes', 'orders', 'categories'],
        activeModules: ['bookings', 'quotes', 'categories']
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

// UPDATED: Generic WebSocket test endpoints for each module
app.post("/api/websocket/test/:module", (req, res) => {
  try {
    const { module } = req.params;
    const validModules = ['bookings', 'quotes', 'orders', 'categories'];
    
    if (!validModules.includes(module)) {
      return res.status(400).json({
        success: false,
        error: `Invalid module. Supported modules: ${validModules.join(', ')}`
      });
    }

    genericWebSocketServer.broadcast({
      type: `test_${module}_notification`,
      module: module,
      data: {
        message: `WebSocket test for ${module}`,
        timestamp: new Date().toISOString()
      }
    }, (client) => {
      return client.subscribedModules.has(module);
    });
    
    res.status(200).json({
      success: true,
      message: `${module} WebSocket test notification sent`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Specific test endpoints for backward compatibility
app.post("/api/quotes/test-websocket", (req, res) => {
  try {
    genericWebSocketServer.emitNewQuote({
      _id: 'test_id',
      quoteId: 'TEST-001',
      customer: {
        name: 'Test Customer',
        email: 'test@example.com',
        phone: '+1234567890'
      },
      categoryName: 'Test Category',
      status: 'pending',
      totalItems: 2,
      createdAt: new Date(),
      viewedByAdmin: false
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

app.post("/api/bookings/test-websocket", (req, res) => {
  try {
    genericWebSocketServer.emitNewBooking({
      _id: 'test_booking_id',
      bookingId: 'BOOK-TEST-001',
      customer: {
        personalInfo: {
          name: 'Test Customer'
        },
        eventDetails: {
          eventType: 'Test Event'
        }
      },
      pricing: {
        formatted: {
          total: '₦100,000'
        }
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Booking WebSocket test notification sent'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// UPDATED: Public Company Info API with mobile and whatsapp fields
app.get('/api/company/info', async (req, res) => {
  try {
    // Get the admin user (assuming only one admin exists)
    const adminUser = await User.findOne({ role: 'user' });
    
    if (!adminUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company information not found' 
      });
    }

    // Return only public company information including new mobile and whatsapp fields
    const companyInfo = {
      name: adminUser.name,
      bio: adminUser.bio,
      location: adminUser.location,
      phone: adminUser.phone,
      mobile: adminUser.mobile,          // NEW: Mobile number field
      whatsapp: adminUser.whatsapp,      // NEW: WhatsApp number field
      email: adminUser.email,
      avatar: adminUser.avatar,
      specialize: adminUser.specialize,
      categories: adminUser.categories,
      joinDate: adminUser.joinDate
    };

    res.status(200).json({
      success: true,
      data: { company: companyInfo }
    });
  } catch (error) {
    console.error('Error fetching company info:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch company information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/api/keep-alive', (req, res) => {
  console.log('🏓 Keep-alive ping received at:', new Date().toISOString());
  res.status(200).json({
    message: "i am active",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
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
  console.log(`📝 Quote endpoints available at: http://${HOST}:${PORT}/api/quotes`);
  console.log(`📚 Booking endpoints available at: http://${HOST}:${PORT}/api/bookings`);
  console.log(`🏢 Company info available at: http://${HOST}:${PORT}/api/company/info`);
  console.log(`🔧 Category endpoints available at: http://${HOST}:${PORT}/api/services/categories`);
  console.log(`📁 SubCategory endpoints available at: http://${HOST}:${PORT}/api/services/categories/:categoryId/subcategories`);
  console.log(`🧪 WebSocket tests available at: POST http://${HOST}:${PORT}/api/websocket/test/{module}`);
  
  try {
    console.log("🔌 Initializing Generic WebSocket server...");
    genericWebSocketServer.initialize(server);
    console.log(`✅ Generic WebSocket server initialized at: ws://${HOST}:${PORT}/websocket`);
    console.log(`📡 WebSocket supports modules: bookings, quotes, orders, categories`);
    console.log(`📱 Clients can subscribe to specific modules for targeted notifications`);
  } catch (error) {
    console.error('❌ Failed to initialize WebSocket server:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
  }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  genericWebSocketServer.close();
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