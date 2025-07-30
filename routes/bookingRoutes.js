// routes/bookings.js or routes/booking.js

const express = require('express');
const router = express.Router();
const { 
  getBookings, 
  createBooking, 
  getBookingById,
  updateBookingStatus,
  updateBookingPayment,
  updateBookingItems,
  generateInvoice,
  sendInvoiceByEmail,  // NEW: Import the new function
  deleteBooking        // NEW: Import the new function
} = require('../controllers/bookingController');

// Existing routes
router.get('/', getBookings);
router.post('/', createBooking);
router.get('/:id', getBookingById);
router.patch('/:id/status', updateBookingStatus);
router.patch('/:id/payment', updateBookingPayment);
router.patch('/:id/items', updateBookingItems);
router.post('/:id/invoice', generateInvoice);

// NEW ROUTES
router.post('/send-invoice', sendInvoiceByEmail);  // For sending invoice emails with PDF
router.delete('/:id', deleteBooking);             // For deleting bookings

module.exports = router;