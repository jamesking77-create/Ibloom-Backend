const mongoose = require('mongoose');

const BookingItemSchema = new mongoose.Schema({
  id: Number,
  name: String,
  price: String,
  quantity: Number
});

const BookingSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true },
    email: String,
    phone: String,
    eventType: String,
    location: String,
    guests: Number,
    specialRequests: String,

    startDate: String,
    endDate: String,
    startTime: String,
    endTime: String,

    singleDay: Boolean,
    multiDay: Boolean,

    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
    paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
    amount: String,
    amountPaid: String,

    items: [BookingItemSchema]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Booking', BookingSchema);
