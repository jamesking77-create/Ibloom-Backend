const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema({
  id: Number,
  name: String,
  category: String,
  quantity: Number,
  pricePerDay: Number,
  totalPrice: Number,
  image: String,
});

const CustomerInfoSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
});

const DeliveryInfoSchema = new mongoose.Schema({
  type: { type: String, enum: ["delivery", "warehouse_pickup"] },
  address: String,
  instructions: String,
});

const DateInfoSchema = new mongoose.Schema({
  orderDate: Date,
  startDate: Date,
  endDate: Date,
  isMultiDay: Boolean,
  duration: String,
});

const PricingSchema = new mongoose.Schema({
  subtotal: Number,
  tax: Number,
  deliveryFee: Number,
  total: Number,
});

const OrderSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    orderNumber: { type: String, required: true, trim: true },

    customerInfo: CustomerInfoSchema,
    deliveryInfo: DeliveryInfoSchema,
    dateInfo: DateInfoSchema,
    items: [ItemSchema],
    pricing: PricingSchema,

    status: {
      type: String,
      enum: ["pending", "confirmed", "in_progress", "completed", "cancelled"],
      default: "pending",
    },

    termsAccepted: Boolean,
    notes: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", OrderSchema);
