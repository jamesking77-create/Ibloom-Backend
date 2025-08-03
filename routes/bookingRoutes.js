// routes/bookingRoutes.js - REPLACE YOUR ENTIRE FILE WITH THIS
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
  sendInvoiceByEmail,
  deleteBooking
} = require('../controllers/bookingController');

router.get('/', getBookings);
router.post('/', createBooking);
router.get('/:id', getBookingById);
router.patch('/:id/status', updateBookingStatus);
router.patch('/:id/payment', updateBookingPayment);
router.patch('/:id/items', updateBookingItems);
router.post('/:id/invoice', generateInvoice);
router.post('/send-invoice', sendInvoiceByEmail);
router.delete('/:id', deleteBooking);

module.exports = router;