const Booking = require("../models/Bookings");

// Get all bookings
const getBookings = async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });

    const pagination = {
      currentPage: 1,
      totalPages: 1,
      totalItems: bookings.length,
      itemsPerPage: 10,
    };

    const stats = {
      thisWeek: bookings.length,
      thisMonth: bookings.length,
      totalRevenue: bookings.reduce(
        (acc, b) => acc + parseInt(b.amount.replace(/[₦,]/g, "")),
        0
      ),
    };

    res.status(200).json({ bookings, pagination, stats });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
};

// Create a new booking
const createBooking = async (req, res) => {
  try {
    const booking = new Booking(req.body);
    await booking.save();
    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ message: "Failed to create booking" });
  }
};

// Get single booking by ID
const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.status(200).json(booking);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch booking" });
  }
};

// Update booking status
const updateBookingStatus = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = req.body.status;
    await booking.save();

    res.status(200).json({ status: booking.status });
  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
};

// Update booking payment
const updateBookingPayment = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.paymentStatus = req.body.paymentStatus;
    booking.amountPaid = req.body.amountPaid;
    await booking.save();

    res
      .status(200)
      .json({
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid,
      });
  } catch (error) {
    res.status(500).json({ message: "Failed to update payment" });
  }
};

// Update booking items
const updateBookingItems = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.items = req.body.items;
    booking.amount = req.body.amount;
    await booking.save();

    res.status(200).json({ items: booking.items, amount: booking.amount });
  } catch (error) {
    res.status(500).json({ message: "Failed to update items" });
  }
};

module.exports = {
  getBookings,
  createBooking,
  getBookingById,
  updateBookingStatus,
  updateBookingPayment,
  updateBookingItems,
};
