const mongoose = require('mongoose');

// Service/Item Schema for booking
const ServiceSchema = new mongoose.Schema({
  serviceId: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  category: { type: String, default: 'General' },
  unitPrice: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 1 },
  duration: { type: Number, default: 8 },
  subtotal: { type: Number, required: true },
  image: String,
  orderMode: { type: String, default: 'booking' },
  addedAt: { type: Date, default: Date.now },
  originalData: mongoose.Schema.Types.Mixed
});

// Customer Personal Info Schema
const PersonalInfoSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true }
});

// Event Details Schema
const EventDetailsSchema = new mongoose.Schema({
  eventType: String,
  numberOfGuests: Number,
  location: String,
  specialRequests: String,
  delivery: { type: String, enum: ['yes', 'no', ''], default: '' },
  installation: { type: String, enum: ['yes', 'no', ''], default: '' }
});

// Customer Schema
const CustomerSchema = new mongoose.Schema({
  personalInfo: PersonalInfoSchema,
  eventDetails: EventDetailsSchema
});

// Event Schedule Schema
const EventScheduleSchema = new mongoose.Schema({
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  isMultiDay: { type: Boolean, default: false },
  durationInDays: { type: Number, default: 1 },
  formatted: {
    startDate: String,
    endDate: String,
    startTime: String,
    endTime: String,
    fullSchedule: String
  }
});

// Pricing Schema
const PricingSchema = new mongoose.Schema({
  itemsSubtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  taxRate: { type: Number, default: 0.075 },
  totalAmount: { type: Number, default: 0 },
  currency: { type: String, default: 'NGN' },
  totalItems: { type: Number, default: 0 },
  totalServices: { type: Number, default: 0 },
  formatted: {
    subtotal: String,
    tax: String,
    total: String
  }
});

// System Info Schema
const SystemInfoSchema = new mongoose.Schema({
  platform: { type: String, default: 'web' },
  userAgent: String,
  timestamp: Number,
  locale: { type: String, default: 'en-NG' },
  timezone: String,
  createdAt: { type: Date, default: Date.now },
  source: { type: String, default: 'event_booking_page' }
});

// Business Data Schema
const BusinessDataSchema = new mongoose.Schema({
  requiresDeposit: { type: Boolean, default: true },
  depositPolicy: { type: String, default: 'Refundable deposit varies by items selected' },
  cancellationPolicy: { type: String, default: 'As per terms and conditions' },
  deliveryRequired: { type: Boolean, default: false },
  setupRequired: { type: Boolean, default: false },
  preferredContact: { type: String, enum: ['email', 'phone'], default: 'email' },
  followUpRequired: { type: Boolean, default: true }
});

// Validation Schema
const ValidationSchema = new mongoose.Schema({
  hasCustomerInfo: { type: Boolean, default: false },
  hasEventSchedule: { type: Boolean, default: false },
  hasServices: { type: Boolean, default: false },
  hasPricing: { type: Boolean, default: false }
});

// Main Booking Schema
const BookingSchema = new mongoose.Schema({
  // Booking Metadata
  bookingId: { type: String, required: true, unique: true },
  bookingDate: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ['pending_confirmation', 'confirmed', 'cancelled', 'pending'], 
    default: 'pending_confirmation' 
  },
  orderMode: { type: String, default: 'booking' },

  // Main Data Sections
  customer: { type: CustomerSchema, required: true },
  eventSchedule: { type: EventScheduleSchema, required: true },
  services: [ServiceSchema],
  pricing: PricingSchema,
  systemInfo: SystemInfoSchema,
  businessData: BusinessDataSchema,
  validation: ValidationSchema,

  // Payment Information
  paymentStatus: { 
    type: String, 
    enum: ['unpaid', 'partial', 'paid'], 
    default: 'unpaid' 
  },
  amountPaid: { type: Number, default: 0 },
  depositAmount: { type: Number, default: 0 },

  // Invoice Information
  invoiceGenerated: { type: Boolean, default: false },
  invoiceNumber: String,
  invoiceSentAt: Date,
  lastInvoiceUpdate: Date,

  // Additional tracking
  adminNotes: String,
  deliveryNotes: String,
  installationNotes: String,
  
  // Legacy fields for backward compatibility
  customerName: String,
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
  amount: String,
  items: [{
    id: mongoose.Schema.Types.Mixed,
    name: String,
    price: String,
    quantity: Number,
    image: String,
    description: String
  }]
}, {
  timestamps: true
});

// Pre-save middleware to ensure legacy fields are populated
BookingSchema.pre('save', function(next) {
  // Populate legacy fields from new structure for backward compatibility
  if (this.customer && this.customer.personalInfo) {
    this.customerName = this.customer.personalInfo.name;
    this.email = this.customer.personalInfo.email;
    this.phone = this.customer.personalInfo.phone;
  }
  
  if (this.customer && this.customer.eventDetails) {
    this.eventType = this.customer.eventDetails.eventType;
    this.location = this.customer.eventDetails.location;
    this.guests = this.customer.eventDetails.numberOfGuests;
    this.specialRequests = this.customer.eventDetails.specialRequests;
  }
  
  if (this.eventSchedule) {
    this.startDate = this.eventSchedule.startDate;
    this.endDate = this.eventSchedule.endDate;
    this.startTime = this.eventSchedule.startTime;
    this.endTime = this.eventSchedule.endTime;
    this.singleDay = !this.eventSchedule.isMultiDay;
    this.multiDay = this.eventSchedule.isMultiDay;
  }
  
  if (this.pricing) {
    this.amount = this.pricing.formatted?.total || `₦${this.pricing.totalAmount.toLocaleString('en-NG', {minimumFractionDigits: 2})}`;
  }
  
  // Convert services to legacy items format
  if (this.services && this.services.length > 0) {
    this.items = this.services.map(service => ({
      id: service.serviceId,
      name: service.name,
      price: `₦${service.unitPrice.toLocaleString('en-NG', {minimumFractionDigits: 2})}`,
      quantity: service.quantity,
      image: service.image,
      description: service.description
    }));
  }

  next();
});

// Index for better query performance
BookingSchema.index({ bookingId: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ 'customer.personalInfo.email': 1 });
BookingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Booking', BookingSchema);