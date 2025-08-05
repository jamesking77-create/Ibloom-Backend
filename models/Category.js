// models/Category.js - Enhanced Category model
const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  price: { type: String, default: '' },
  image: { type: String, default: '' }
}, {
  _id: false // Disable automatic _id for subdocuments
});

const CategorySchema = new mongoose.Schema(
  {
    id: { 
      type: Number, 
      required: true, 
      unique: true,
      min: [1, 'Category ID must be a positive number']
    },
    name: { 
      type: String, 
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: [100, 'Category name cannot exceed 100 characters']
    },
    image: { 
      type: String, 
      default: '',
      validate: {
        validator: function(v) {
          // Allow empty string or valid URL
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Image must be a valid URL'
      }
    },
    description: { 
      type: String, 
      trim: true, 
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    itemCount: { 
      type: Number, 
      default: 0,
      min: [0, 'Item count cannot be negative']
    },
    hasQuotes: { 
      type: Boolean, 
      default: false 
    },
    items: [ItemSchema]
  },
  {
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        // Ensure itemCount matches actual items length
        ret.itemCount = ret.items ? ret.items.length : 0;
        return ret;
      }
    },
    toObject: {
      transform: function(doc, ret) {
        // Ensure itemCount matches actual items length
        ret.itemCount = ret.items ? ret.items.length : 0;
        return ret;
      }
    }
  }
);

// Pre-save middleware to ensure itemCount is accurate
CategorySchema.pre('save', function(next) {
  if (this.items) {
    this.itemCount = this.items.length;
  }
  next();
});

// Pre-update middleware to ensure itemCount is accurate
CategorySchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  if (update.items) {
    update.itemCount = update.items.length;
  } else if (update.$set && update.$set.items) {
    update.$set.itemCount = update.$set.items.length;
  }
  next();
});

// Index for faster queries
CategorySchema.index({ id: 1 });
CategorySchema.index({ name: 1 });
CategorySchema.index({ createdAt: -1 });

// Virtual for full item count (if needed for complex queries)
CategorySchema.virtual('actualItemCount').get(function() {
  return this.items ? this.items.length : 0;
});

// Static method to find category by custom id
CategorySchema.statics.findByCustomId = function(customId) {
  return this.findOne({ id: customId });
};

// Instance method to add item
CategorySchema.methods.addItem = function(item) {
  const newId = this.items.length > 0 
    ? Math.max(...this.items.map(i => i.id)) + 1 
    : 1;
  
  const newItem = {
    id: newId,
    name: item.name,
    description: item.description || '',
    price: item.price || '',
    image: item.image || ''
  };
  
  this.items.push(newItem);
  this.itemCount = this.items.length;
  return newItem;
};

// Instance method to update item
CategorySchema.methods.updateItem = function(itemId, updateData) {
  const itemIndex = this.items.findIndex(item => item.id === itemId);
  if (itemIndex === -1) {
    throw new Error('Item not found');
  }
  
  Object.assign(this.items[itemIndex], updateData);
  return this.items[itemIndex];
};

// Instance method to remove item
CategorySchema.methods.removeItem = function(itemId) {
  const initialLength = this.items.length;
  this.items = this.items.filter(item => item.id !== itemId);
  this.itemCount = this.items.length;
  
  if (this.items.length === initialLength) {
    throw new Error('Item not found');
  }
  
  return true;
};

module.exports = mongoose.model('Category', CategorySchema);