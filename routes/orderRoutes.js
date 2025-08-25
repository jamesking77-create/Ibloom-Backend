// routes/orderRoutes.js - FIXED ORDERS ROUTES WITH BETTER ERROR HANDLING
const express = require('express');
const router = express.Router();
const {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  searchOrders,
  updateOrderStatus,
  sendOrderInvoice,
  downloadOrderInvoice
} = require('../controllers/orderController');

// Middleware to log requests
const logRequest = (req, res, next) => {
  console.log(`${req.method} ${req.path}`, {
    body: req.method !== 'GET' ? req.body : 'N/A',
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString()
  });
  next();
};

// Middleware to handle async errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation middleware for order creation
const validateOrderData = (req, res, next) => {
  const { customerInfo, items, pricing } = req.body;

  // Check required fields
  if (!customerInfo) {
    return res.status(400).json({
      message: "Customer information is required",
      field: "customerInfo"
    });
  }

  if (!customerInfo.name) {
    return res.status(400).json({
      message: "Customer name is required",
      field: "customerInfo.name"
    });
  }

  if (!customerInfo.email) {
    return res.status(400).json({
      message: "Customer email is required",
      field: "customerInfo.email"
    });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "At least one item is required",
      field: "items"
    });
  }

  if (!pricing) {
    return res.status(400).json({
      message: "Pricing information is required",
      field: "pricing"
    });
  }

  next();
};

// Apply logging middleware to all routes
router.use(logRequest);

// GET routes
router.get('/', asyncHandler(getOrders));
router.get('/search', asyncHandler(searchOrders));
router.get('/:id', asyncHandler(getOrderById));

// POST routes
router.post('/', validateOrderData, asyncHandler(createOrder));
router.post('/send-invoice', asyncHandler(sendOrderInvoice));
// Add this route to your orders router
router.post('/download-invoice', downloadOrderInvoice);

// PUT/PATCH routes
router.put('/:id', asyncHandler(updateOrder));
router.patch('/:id/status', asyncHandler(updateOrderStatus));

// DELETE routes
router.delete('/:id', asyncHandler(deleteOrder));

// Global error handler for this router
router.use((error, req, res, next) => {
  console.error('Order route error:', error);
  
  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation failed',
      errors: Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }))
    });
  }

  // Handle cast errors (invalid ObjectId)
  if (error.name === 'CastError') {
    return res.status(400).json({
      message: 'Invalid ID format',
      error: error.message
    });
  }

  // Handle duplicate key errors
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      message: `Duplicate value for ${field}`,
      field: field,
      value: error.keyValue[field]
    });
  }

  // Handle other specific errors
  if (error.status) {
    return res.status(error.status).json({
      message: error.message || 'An error occurred',
      error: error.message
    });
  }

  // Default server error
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message
  });
});

module.exports = router;