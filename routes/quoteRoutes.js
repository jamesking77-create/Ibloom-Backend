// routes/quoteRoutes.js - UPDATED VERSION without Admin Restrictions
const express = require("express");
const router = express.Router();
const quoteController = require("../controllers/quoteController");
const { authenticateToken } = require("../middleware/auth");

// Public routes (no authentication required)
router.post("/", quoteController.createQuote);
router.get("/verify/:quoteId", quoteController.verifyQuote);

// Protected routes (authentication required but no admin restriction)
router.use(authenticateToken);

// Get all quotes - now accessible to authenticated users
router.get("/", quoteController.getAllQuotes);

// Get specific quote by ID
router.get("/:quoteId", quoteController.getQuoteById);

// Update quote status
router.put("/:quoteId/status", quoteController.updateQuoteStatus);

// Mark quote as viewed
router.put("/:quoteId/view", quoteController.markAsViewed);

// Create quote response
router.post("/:quoteId/response", quoteController.createQuoteResponse);

// Update quote response
router.put("/:quoteId/response", quoteController.updateQuoteResponse);

// Send quote response
router.post("/:quoteId/send", quoteController.sendQuoteResponse);

// Add communication log
router.post("/:quoteId/communication", quoteController.addCommunication);

// Delete quote
router.delete("/:quoteId", quoteController.deleteQuote);

// Get quote statistics
router.get("/stats/dashboard", quoteController.getQuoteStats);

// Export quotes
router.get("/export/data", quoteController.exportQuotes);

module.exports = router;