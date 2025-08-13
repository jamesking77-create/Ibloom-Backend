// models/Quote.js
const mongoose = require('mongoose');

const quoteItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  image: { type: String },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 }
});

const customerInfoSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String },
  company: { type: String },
  
  // Event details
  eventType: { type: String },
  eventDate: { type: Date },
  eventLocation: { type: String },
  guestCount: { type: Number },
  eventDuration: { type: String },
  venue: { type: String },
  
  // Additional info
  specialRequests: { type: String },
  budget: { type: String },
  hearAboutUs: { type: String },
  
  // Contact preferences
  preferredContact: { 
    type: String, 
    enum: ['phone', 'email', 'whatsapp'], 
    default: 'phone' 
  },
  contactTime: { 
    type: String, 
    enum: ['morning', 'afternoon', 'evening', 'anytime'], 
    default: 'anytime' 
  }
});

const quoteResponseSchema = new mongoose.Schema({
  message: { type: String },
  totalAmount: { type: Number, required: true },
  validUntil: { type: Date },
  terms: { type: String },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 0 },
  setupFee: { type: Number, default: 0 },
  
  // Breakdown
  subtotal: { type: Number },
  finalTotal: { type: Number },
  
  // PDF details
  pdfUrl: { type: String },
  pdfGenerated: { type: Boolean, default: false },
  
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  createdAt: { type: Date, default: Date.now }
});

const quoteSchema = new mongoose.Schema({
  quoteId: { 
    type: String, 
    unique: true, 
    required: true 
  },
  
  // Customer information
  customer: { 
    type: customerInfoSchema, 
    required: true 
  },
  
  // Category info
  categoryId: { type: String },
  categoryName: { type: String, required: true },
  
  // Items
  items: [quoteItemSchema],
  totalItems: { type: Number, default: 0 },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'responded', 'accepted', 'cancelled', 'expired'],
    default: 'pending'
  },
  
  // Quote response (when admin responds)
  response: quoteResponseSchema,
  
  // Admin notes
  adminNotes: { type: String },
  
  // Tracking
  viewedByAdmin: { type: Boolean, default: false },
  viewedAt: { type: Date },
  respondedAt: { type: Date },
  
  // Communication log
  communications: [{
    type: { 
      type: String, 
      enum: ['email', 'phone', 'whatsapp', 'note'] 
    },
    message: String,
    timestamp: { type: Date, default: Date.now },
    sentBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }
  }]
}, {
  timestamps: true
});

// Generate quote ID
quoteSchema.pre('save', function(next) {
  if (!this.quoteId) {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.quoteId = `QR-${year}-${randomNum}`;
  }
  
  // Calculate total items
  this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
  
  next();
});

// Indexes for better performance
quoteSchema.index({ quoteId: 1 });
quoteSchema.index({ 'customer.email': 1 });
quoteSchema.index({ status: 1 });
quoteSchema.index({ createdAt: -1 });
quoteSchema.index({ categoryName: 1 });

module.exports = mongoose.model('Quote', quoteSchema);