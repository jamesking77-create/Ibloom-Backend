const mongoose = require('mongoose');

// Attachment schema for storing file information
const attachmentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  url: String, // Optional: if you store files and need URLs
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false }); // Don't create separate _id for subdocuments

// Recipient schema for broadcast emails
const recipientSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['sent', 'failed', 'pending'],
    default: 'pending'
  },
  errorMessage: String,
  sentAt: Date
}, { _id: false });

// Main mail history schema
const mailHistorySchema = new mongoose.Schema({
  // Email type and basic info
  type: {
    type: String,
    enum: ['individual', 'broadcast'],
    required: true,
    index: true
  },
  subject: {
    type: String,
    required: true,
    maxlength: 255
  },
  message: {
    type: String,
    required: true
  },
  senderEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  
  // Individual email fields (only for type: 'individual')
  recipientEmail: {
    type: String,
    lowercase: true,
    trim: true,
    index: true,
    required: function() {
      return this.type === 'individual';
    }
  },
  recipientName: {
    type: String,
    trim: true,
    required: function() {
      return this.type === 'individual';
    }
  },
  
  // Broadcast email fields (only for type: 'broadcast')
  recipientCount: {
    type: Number,
    default: 0,
    required: function() {
      return this.type === 'broadcast';
    }
  },
  recipients: {
    type: [recipientSchema],
    required: function() {
      return this.type === 'broadcast';
    }
  },
  
  // Attachment information
  attachmentCount: {
    type: Number,
    default: 0
  },
  attachments: [attachmentSchema],
  
  // Status and metadata
  status: {
    type: String,
    enum: ['sent', 'failed', 'pending', 'partial'],
    default: 'pending',
    index: true
  },
  errorMessage: String,
  
  // Timestamps
  sentAt: {
    type: Date,
    index: true
  }
}, {
  // Add automatic timestamps
  timestamps: true,
  // Add toJSON transform to clean up response
  toJSON: {
    transform: function(doc, ret) {
      // Remove sensitive data or clean up response
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better query performance
mailHistorySchema.index({ type: 1, status: 1 });
mailHistorySchema.index({ senderEmail: 1, sentAt: -1 });
mailHistorySchema.index({ createdAt: -1 });
mailHistorySchema.index({ 'recipients.email': 1 }); // For searching broadcast recipients

// Virtual for getting successful recipient count in broadcasts
mailHistorySchema.virtual('successfulRecipients').get(function() {
  if (this.type === 'broadcast' && this.recipients) {
    return this.recipients.filter(r => r.status === 'sent').length;
  }
  return this.type === 'individual' && this.status === 'sent' ? 1 : 0;
});

// Virtual for getting failed recipient count in broadcasts
mailHistorySchema.virtual('failedRecipients').get(function() {
  if (this.type === 'broadcast' && this.recipients) {
    return this.recipients.filter(r => r.status === 'failed').length;
  }
  return this.type === 'individual' && this.status === 'failed' ? 1 : 0;
});

// Instance method to get recipient summary
mailHistorySchema.methods.getRecipientSummary = function() {
  if (this.type === 'individual') {
    return {
      total: 1,
      sent: this.status === 'sent' ? 1 : 0,
      failed: this.status === 'failed' ? 1 : 0,
      pending: this.status === 'pending' ? 1 : 0
    };
  }
  
  if (this.type === 'broadcast' && this.recipients) {
    return this.recipients.reduce((acc, recipient) => {
      acc.total++;
      acc[recipient.status]++;
      return acc;
    }, { total: 0, sent: 0, failed: 0, pending: 0 });
  }
  
  return { total: 0, sent: 0, failed: 0, pending: 0 };
};

// Static method to get email statistics
mailHistorySchema.statics.getStats = async function(senderEmail = null) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const baseFilter = senderEmail ? { senderEmail } : {};
  
  try {
    const [todayStats, monthStats, lastEmail] = await Promise.all([
      // Today's stats
      this.aggregate([
        { 
          $match: { 
            ...baseFilter, 
            sentAt: { $gte: startOfDay },
            status: { $in: ['sent', 'partial'] }
          } 
        },
        {
          $group: {
            _id: null,
            individualCount: {
              $sum: { $cond: [{ $eq: ['$type', 'individual'] }, 1, 0] }
            },
            broadcastCount: {
              $sum: { $cond: [{ $eq: ['$type', 'broadcast'] }, '$recipientCount', 0] }
            }
          }
        }
      ]),
      
      // Month stats
      this.aggregate([
        { 
          $match: { 
            ...baseFilter, 
            sentAt: { $gte: startOfMonth },
            status: { $in: ['sent', 'partial'] }
          } 
        },
        {
          $group: {
            _id: null,
            individualCount: {
              $sum: { $cond: [{ $eq: ['$type', 'individual'] }, 1, 0] }
            },
            broadcastCount: {
              $sum: { $cond: [{ $eq: ['$type', 'broadcast'] }, '$recipientCount', 0] }
            }
          }
        }
      ]),
      
      // Last email
      this.findOne(
        { ...baseFilter, status: { $in: ['sent', 'partial'] } },
        { sentAt: 1, type: 1, subject: 1 }
      ).sort({ sentAt: -1 })
    ]);
    
    const emailsSentToday = (todayStats[0]?.individualCount || 0) + (todayStats[0]?.broadcastCount || 0);
    const emailsSentThisMonth = (monthStats[0]?.individualCount || 0) + (monthStats[0]?.broadcastCount || 0);
    
    return {
      emailsSentToday,
      emailsSentThisMonth,
      lastEmailSent: lastEmail?.sentAt || null,
      lastEmailSubject: lastEmail?.subject || null,
      lastEmailType: lastEmail?.type || null
    };
    
  } catch (error) {
    console.error('Error getting mail stats:', error);
    throw error;
  }
};

// Pre-save middleware to validate data
mailHistorySchema.pre('save', function(next) {
  // Ensure recipientCount matches recipients array length for broadcasts
  if (this.type === 'broadcast' && this.recipients) {
    this.recipientCount = this.recipients.length;
  }
  
  // Ensure attachmentCount matches attachments array length
  if (this.attachments) {
    this.attachmentCount = this.attachments.length;
  }
  
  next();
});

// Create the model
const MailHistory = mongoose.model('MailHistory', mailHistorySchema);

module.exports = MailHistory;