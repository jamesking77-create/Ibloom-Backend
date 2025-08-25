// models/Order.js - FIXED ORDER MODEL
const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  // FIXED: Support both pricePerDay and pricePerUnit for flexibility
  pricePerDay: { type: Number, min: 0 },
  pricePerUnit: { type: Number, min: 0 },
  totalPrice: { type: Number, required: true, min: 0 },
  image: { type: String, trim: true },
  description: { type: String, trim: true }
});

const CustomerInfoSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { 
    type: String, 
    required: true, 
    trim: true, 
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
  },
  phone: { type: String, required: true, trim: true }
});

const DeliveryInfoSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ["delivery", "warehouse_pickup"], 
    required: true 
  },
  address: { type: String, required: true, trim: true },
  instructions: { type: String, trim: true }
});

const DateInfoSchema = new mongoose.Schema({
  orderDate: { type: Date, default: Date.now },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isMultiDay: { type: Boolean, default: false },
  duration: { type: String, required: true },
  orderPeriod: { type: Number } // Duration in days as number
});

const PricingSchema = new mongoose.Schema({
  subtotal: { type: Number, required: true, min: 0 },
  tax: { type: Number, required: true, min: 0 },
  deliveryFee: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 }
});

// Invoice tracking schema
const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, trim: true },
  generated: { type: Boolean, default: false },
  sentAt: { type: Date },
  lastUpdate: { type: Date },
  dailyRate: { type: Number, default: 0, min: 0 },
  totalWithDailyRate: { type: Number, min: 0 }
});

// Warehouse information schema
const WarehouseInfoSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  address: { type: String, trim: true },
  phone: { type: String, trim: true },
  hours: { type: String, trim: true }
});

const OrderSchema = new mongoose.Schema(
  {
    // Auto-increment ID field
    id: { 
      type: Number, 
      unique: true,
      index: true
    },
    
    // Order identification
    orderNumber: { 
      type: String, 
      required: true, 
      trim: true,
      unique: true,
      index: true
    },
    
    // Order ID (for compatibility with frontend)
    orderId: { 
      type: String, 
      trim: true,
      index: true
    },

    // Core order information
    customerInfo: { 
      type: CustomerInfoSchema, 
      required: true 
    },
    
    deliveryInfo: { 
      type: DeliveryInfoSchema, 
      required: true 
    },
    
    dateInfo: { 
      type: DateInfoSchema, 
      required: true 
    },
    
    items: { 
      type: [ItemSchema], 
      required: true,
      validate: {
        validator: function(items) {
          return items && items.length > 0;
        },
        message: 'At least one item is required'
      }
    },
    
    pricing: { 
      type: PricingSchema, 
      required: true 
    },

    // Order status and management - FIXED: Updated enum values
    status: {
      type: String,
      enum: ["pending", "pending_confirmation", "confirmed", "in_progress", "completed", "cancelled"],
      default: "pending",
      index: true
    },

    // Additional order details
    orderMode: {
      type: String,
      enum: ["daily", "quantity", "event"],
      default: "quantity"
    },

    // Event details (if applicable)
    eventType: { type: String, trim: true },
    location: { type: String, trim: true },
    guests: { type: String, trim: true },
    
    // Service options
    delivery: { type: Boolean, default: false },
    installation: { type: Boolean, default: false },
    specialRequests: { type: String, trim: true },

    // Terms and conditions
    termsAccepted: { type: Boolean, required: true, default: true },
    notes: { type: String, trim: true },

    // Invoice information
    invoice: { 
      type: InvoiceSchema, 
      default: () => ({}) 
    },

    // Legacy invoice fields (for backward compatibility)
    invoiceGenerated: { type: Boolean, default: false },
    invoiceNumber: { type: String, trim: true },
    invoiceSentAt: { type: Date },
    lastInvoiceUpdate: { type: Date },

    // Warehouse information
    warehouseInfo: WarehouseInfoSchema,

    // Payment tracking
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid"
    },
    
    amountPaid: { type: Number, default: 0, min: 0 },

    // Additional metadata
    source: { 
      type: String, 
      default: "web", 
      enum: ["web", "mobile", "admin"]
    },
    
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal"
    },

    // Tracking fields
    viewedByAdmin: { type: Boolean, default: false },
    lastViewedAt: { type: Date },
    
    // Real-time update tracking
    lastRealTimeUpdate: { type: Date, default: Date.now }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ "customerInfo.email": 1 });
OrderSchema.index({ "dateInfo.startDate": 1 });
OrderSchema.index({ "dateInfo.endDate": 1 });
OrderSchema.index({ status: 1, createdAt: -1 });

// Virtual for order duration in days
OrderSchema.virtual('durationInDays').get(function() {
  if (this.dateInfo && this.dateInfo.startDate && this.dateInfo.endDate) {
    const start = new Date(this.dateInfo.startDate);
    const end = new Date(this.dateInfo.endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }
  return 1;
});

// Virtual for formatted pricing
OrderSchema.virtual('formattedPricing').get(function() {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  return {
    subtotal: formatCurrency(this.pricing?.subtotal),
    tax: formatCurrency(this.pricing?.tax),
    deliveryFee: formatCurrency(this.pricing?.deliveryFee),
    total: formatCurrency(this.pricing?.total)
  };
});

// Virtual for order age (days since created)
OrderSchema.virtual('orderAge').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for urgency based on start date
OrderSchema.virtual('urgency').get(function() {
  if (!this.dateInfo?.startDate) return 'normal';
  
  const now = new Date();
  const startDate = new Date(this.dateInfo.startDate);
  const daysUntilStart = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));
  
  if (daysUntilStart < 0) return 'overdue';
  if (daysUntilStart === 0) return 'today';
  if (daysUntilStart === 1) return 'tomorrow';
  if (daysUntilStart <= 3) return 'urgent';
  if (daysUntilStart <= 7) return 'high';
  return 'normal';
});

// Pre-save middleware to auto-increment ID and handle data transformation
OrderSchema.pre('save', async function(next) {
  if (this.isNew && !this.id) {
    try {
      const lastOrder = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastOrder ? lastOrder.id + 1 : 41489;
      
      // Generate order number if not provided
      if (!this.orderNumber) {
        this.orderNumber = `Order #${this.id}`;
      }
      
      // Generate orderId if not provided
      if (!this.orderId) {
        this.orderId = `ORD${Date.now().toString().slice(-6)}`;
      }
      
      // FIXED: Handle pricePerUnit to pricePerDay conversion
      if (this.items && Array.isArray(this.items)) {
        this.items.forEach(item => {
          if (item.pricePerUnit && !item.pricePerDay) {
            item.pricePerDay = item.pricePerUnit;
          }
          if (!item.pricePerUnit && item.pricePerDay) {
            item.pricePerUnit = item.pricePerDay;
          }
        });
      }
      
      // Calculate multi-day flag
      if (this.dateInfo && this.dateInfo.startDate && this.dateInfo.endDate) {
        const start = new Date(this.dateInfo.startDate);
        const end = new Date(this.dateInfo.endDate);
        this.dateInfo.isMultiDay = start.toDateString() !== end.toDateString();
        
        // Calculate and store order period
        this.dateInfo.orderPeriod = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      }
      
    } catch (error) {
      return next(error);
    }
  }
  
  // Update real-time tracking
  this.lastRealTimeUpdate = new Date();
  
  next();
});

// Pre-update middleware
OrderSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
  this.set({ lastRealTimeUpdate: new Date() });
  next();
});

// Static methods for common queries
OrderSchema.statics.findByStatus = function(status) {
  return this.find({ status }).sort({ createdAt: -1 });
};

OrderSchema.statics.findByCustomerEmail = function(email) {
  return this.find({ "customerInfo.email": email }).sort({ createdAt: -1 });
};

OrderSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    "dateInfo.startDate": { $gte: startDate },
    "dateInfo.endDate": { $lte: endDate }
  }).sort({ "dateInfo.startDate": 1 });
};

OrderSchema.statics.findRecentOrders = function(days = 7) {
  const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.find({ createdAt: { $gte: dateThreshold } }).sort({ createdAt: -1 });
};

// Instance methods
OrderSchema.methods.calculateTotalWithDailyRate = function(dailyRate = 0) {
  const duration = this.durationInDays;
  const dailyCharges = parseFloat(dailyRate) * duration;
  const itemsSubtotal = this.pricing.subtotal;
  const subtotal = itemsSubtotal + dailyCharges;
  const tax = subtotal * 0.075; // 7.5% tax
  const total = subtotal + tax;
  
  return {
    itemsSubtotal,
    dailyCharges,
    dailyRate: parseFloat(dailyRate),
    duration,
    subtotal,
    tax,
    total
  };
};

OrderSchema.methods.markAsViewed = function() {
  this.viewedByAdmin = true;
  this.lastViewedAt = new Date();
  return this.save();
};

module.exports = mongoose.model("Order", OrderSchema);