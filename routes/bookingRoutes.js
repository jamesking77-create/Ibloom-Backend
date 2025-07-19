const express = require('express');
const router = express.Router();
const {
  getBookings,
  createBooking,
  getBookingById,
  updateBookingStatus,
  updateBookingPayment,
  updateBookingItems
} = require('../controllers/bookingController');

router.get('/', getBookings);
router.post('/', createBooking);
router.get('/:id', getBookingById);
router.patch('/:id/status', updateBookingStatus);
router.patch('/:id/payment', updateBookingPayment);
router.patch('/:id/items', updateBookingItems);

module.exports = router;
