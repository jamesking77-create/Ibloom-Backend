// models/Category.js - Enhanced Category model with multiple images support
const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  price: { type: String, default: '' },
  images: {
    image1: { type: String, default: '' }, // Primary image
    image2: { type: String, default: '' }, // Secondary image
    image3: { type: String, default: '' }  // Tertiary image
  },
  colors: [{ type: String, trim: true }], // Array of colors for this item
  sizes: [{ type: String, trim: true }],  // Array of sizes for this item
  outOfStock: { type: Boolean, default: false } // Out of stock indicator
}, {
  _id: false // Disable automatic _id for subdocuments
});

const SubCategorySchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  image: { type: String, default: '' },
  colors: [{ type: String, trim: true }], // Available colors for this subcategory
  sizes: [{ type: String, trim: true }],  // Available sizes for this subcategory
  items: [ItemSchema],
  itemCount: { type: Number, default: 0, min: [0, 'Item count cannot be negative'] }
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
    colors: [{ type: String, trim: true }], // Available colors for this category
    sizes: [{ type: String, trim: true }],  // Available sizes for this category
    itemCount: {
      type: Number,
      default: 0,
      min: [0, 'Item count cannot be negative']
    },
    hasQuotes: {
      type: Boolean,
      default: false
    },
    items: [ItemSchema],
    subCategories: [SubCategorySchema] // New subcategories field
  },
  {
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        // Ensure itemCount includes items from subcategories
        let totalItems = ret.items ? ret.items.length : 0;
        if (ret.subCategories) {
          totalItems += ret.subCategories.reduce((sum, sub) => sum + (sub.items ? sub.items.length : 0), 0);
        }
        ret.itemCount = totalItems;
        return ret;
      }
    },
    toObject: {
      transform: function(doc, ret) {
        // Ensure itemCount includes items from subcategories
        let totalItems = ret.items ? ret.items.length : 0;
        if (ret.subCategories) {
          totalItems += ret.subCategories.reduce((sum, sub) => sum + (sub.items ? sub.items.length : 0), 0);
        }
        ret.itemCount = totalItems;
        return ret;
      }
    }
  }
);

// Auto-generate unique ID before saving
CategorySchema.pre('save', async function(next) {
  if (this.isNew && !this.id) {
    try {
      // Find the highest existing ID and increment by 1
      const lastCategory = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
      this.id = lastCategory ? lastCategory.id + 1 : 1;
    } catch (error) {
      return next(error);
    }
  }
  
  // Update itemCount including subcategories
  let totalItems = this.items ? this.items.length : 0;
  if (this.subCategories) {
    totalItems += this.subCategories.reduce((sum, sub) => {
      sub.itemCount = sub.items ? sub.items.length : 0;
      return sum + sub.itemCount;
    }, 0);
  }
  this.itemCount = totalItems;
  
  next();
});

// Pre-update middleware to ensure itemCount is accurate
CategorySchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  
  // Calculate total items including subcategories
  if (update.items || update.subCategories) {
    let totalItems = 0;
    if (update.items) totalItems += update.items.length;
    if (update.subCategories) {
      totalItems += update.subCategories.reduce((sum, sub) => {
        if (sub.items) sub.itemCount = sub.items.length;
        return sum + (sub.items ? sub.items.length : 0);
      }, 0);
    }
    update.itemCount = totalItems;
  } else if (update.$set) {
    let totalItems = 0;
    if (update.$set.items) totalItems += update.$set.items.length;
    if (update.$set.subCategories) {
      totalItems += update.$set.subCategories.reduce((sum, sub) => {
        if (sub.items) sub.itemCount = sub.items.length;
        return sum + (sub.items ? sub.items.length : 0);
      }, 0);
    }
    if (totalItems > 0) update.$set.itemCount = totalItems;
  }
  
  next();
});

// Indexes
CategorySchema.index({ id: 1 });
CategorySchema.index({ name: 1 });
CategorySchema.index({ createdAt: -1 });

// Virtual for actual item count
CategorySchema.virtual('actualItemCount').get(function() {
  let total = this.items ? this.items.length : 0;
  if (this.subCategories) {
    total += this.subCategories.reduce((sum, sub) => sum + (sub.items ? sub.items.length : 0), 0);
  }
  return total;
});

// Static methods
CategorySchema.statics.findByCustomId = function(customId) {
  return this.findOne({ id: customId });
};

CategorySchema.statics.getNextId = async function() {
  const lastCategory = await this.findOne({}, {}, { sort: { id: -1 } });
  return lastCategory ? lastCategory.id + 1 : 1;
};


CategorySchema.methods.addItem = function(item, subCategoryId = null) {
  console.log('\n🔧 MODEL addItem called:');
  console.log('- subCategoryId:', subCategoryId, typeof subCategoryId);
  console.log('- item name:', item.name);
  console.log('- available subcategories:', this.subCategories.map(s => ({ id: s.id, name: s.name })));
  
  let targetContainer;
  let isSubcategoryItem = false;
  
  // Handle subcategory assignment
  if (subCategoryId !== null && subCategoryId !== undefined) {
    const numericSubCategoryId = parseInt(subCategoryId, 10);
    
    if (isNaN(numericSubCategoryId)) {
      console.error('❌ Invalid numeric conversion:', subCategoryId);
      throw new Error(`Invalid subcategory ID: ${subCategoryId}`);
    }
    
    console.log('🔍 Looking for subcategory with ID:', numericSubCategoryId);
    
    // Find subcategory
    targetContainer = this.subCategories.find(sub => {
      const subId = parseInt(sub.id, 10);
      const match = subId === numericSubCategoryId;
      console.log(`  Checking sub ${sub.name} (ID: ${subId}) === ${numericSubCategoryId}: ${match}`);
      return match;
    });
    
    if (!targetContainer) {
      console.error('❌ Subcategory not found with ID:', numericSubCategoryId);
      throw new Error(`Subcategory with ID ${numericSubCategoryId} not found`);
    }
    
    isSubcategoryItem = true;
    console.log('✅ TARGET: Will add to subcategory:', targetContainer.name);
  } else {
    targetContainer = this;
    console.log('✅ TARGET: Will add to main category');
  }
  
  // Initialize items array if needed
  if (!targetContainer.items) {
    targetContainer.items = [];
  }
  
  // Generate new ID
  const existingIds = targetContainer.items
    .map(i => parseInt(i.id, 10))
    .filter(id => !isNaN(id));
  const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  
  // Create new item
  const newItem = {
    id: newId,
    name: item.name,
    description: item.description || '',
    price: item.price || '',
    images: {
      image1: item.images?.image1 || '',
      image2: item.images?.image2 || '',
      image3: item.images?.image3 || ''
    },
    colors: Array.isArray(item.colors) ? item.colors : [],
    sizes: Array.isArray(item.sizes) ? item.sizes : [],
    outOfStock: Boolean(item.outOfStock)
  };
  
  // Add item to target container
  targetContainer.items.push(newItem);
  
  console.log('✅ ITEM ADDED:');
  console.log('- Added to:', isSubcategoryItem ? `subcategory "${targetContainer.name}"` : 'main category');
  console.log('- New item ID:', newId);
  console.log('- Container now has items:', targetContainer.items.length);
  
  // Update item counts
  if (isSubcategoryItem) {
    targetContainer.itemCount = targetContainer.items.length;
  }
  
  // Recalculate total category item count
  let totalItems = this.items ? this.items.length : 0;
  if (this.subCategories && this.subCategories.length > 0) {
    totalItems += this.subCategories.reduce((sum, sub) => {
      sub.itemCount = sub.items ? sub.items.length : 0;
      return sum + sub.itemCount;
    }, 0);
  }
  this.itemCount = totalItems;
  
  console.log('📊 Updated counts:');
  console.log('- Total category items:', this.itemCount);
  if (isSubcategoryItem) {
    console.log('- Subcategory items:', targetContainer.itemCount);
  }
  
  return newItem;
};

// In models/Category.js - Replace the updateItem and removeItem methods

CategorySchema.methods.updateItem = function(itemId, updateData, subCategoryId = null) {
  console.log('\n🔧 MODEL updateItem called:');
  console.log('- itemId:', itemId, typeof itemId);
  console.log('- subCategoryId:', subCategoryId, typeof subCategoryId);
  console.log('- updateData name:', updateData.name);
  
  let targetContainer;
  let isSubcategoryItem = false;
  
  // Handle subcategory assignment
  if (subCategoryId !== null && subCategoryId !== undefined) {
    const numericSubCategoryId = parseInt(subCategoryId, 10);
    
    if (isNaN(numericSubCategoryId)) {
      console.error('❌ Invalid numeric conversion for subCategoryId:', subCategoryId);
      throw new Error(`Invalid subcategory ID: ${subCategoryId}`);
    }
    
    console.log('🔍 Looking for subcategory with ID:', numericSubCategoryId);
    
    // Find subcategory
    targetContainer = this.subCategories.find(sub => {
      const subId = parseInt(sub.id, 10);
      const match = subId === numericSubCategoryId;
      console.log(`  Checking sub ${sub.name} (ID: ${subId}) === ${numericSubCategoryId}: ${match}`);
      return match;
    });
    
    if (!targetContainer) {
      console.error('❌ Subcategory not found with ID:', numericSubCategoryId);
      throw new Error(`Subcategory with ID ${numericSubCategoryId} not found`);
    }
    
    isSubcategoryItem = true;
    console.log('✅ TARGET: Will update item in subcategory:', targetContainer.name);
  } else {
    targetContainer = this;
    console.log('✅ TARGET: Will update item in main category');
  }
  
  // Find the item to update
  const numericItemId = parseInt(itemId, 10);
  if (isNaN(numericItemId)) {
    console.error('❌ Invalid itemId:', itemId);
    throw new Error(`Invalid item ID: ${itemId}`);
  }
  
  console.log('🔍 Looking for item with ID:', numericItemId);
  console.log('📋 Available items:', targetContainer.items.map(i => ({ id: i.id, name: i.name })));
  
  const itemIndex = targetContainer.items.findIndex(item => {
    const match = parseInt(item.id, 10) === numericItemId;
    console.log(`  Checking item ${item.name} (ID: ${item.id}) === ${numericItemId}: ${match}`);
    return match;
  });
  
  if (itemIndex === -1) {
    console.error('❌ Item not found with ID:', numericItemId);
    console.error('Available items:', targetContainer.items.map(i => ({ id: i.id, name: i.name })));
    throw new Error('Item not found');
  }
  
  // Handle images update properly
  if (updateData.images) {
    const currentImages = targetContainer.items[itemIndex].images || {};
    updateData.images = {
      image1: updateData.images.image1 !== undefined ? updateData.images.image1 : currentImages.image1 || '',
      image2: updateData.images.image2 !== undefined ? updateData.images.image2 : currentImages.image2 || '',
      image3: updateData.images.image3 !== undefined ? updateData.images.image3 : currentImages.image3 || ''
    };
  }
  
  // Update the item
  Object.assign(targetContainer.items[itemIndex], updateData);
  
  console.log('✅ ITEM UPDATED:');
  console.log('- Updated in:', isSubcategoryItem ? `subcategory "${targetContainer.name}"` : 'main category');
  console.log('- Item name:', targetContainer.items[itemIndex].name);
  
  return targetContainer.items[itemIndex];
};

CategorySchema.methods.removeItem = function(itemId, subCategoryId = null) {
  console.log('\n🔧 MODEL removeItem called:');
  console.log('- itemId:', itemId, typeof itemId);
  console.log('- subCategoryId:', subCategoryId, typeof subCategoryId);
  
  let targetContainer;
  let isSubcategoryItem = false;
  
  // Handle subcategory assignment
  if (subCategoryId !== null && subCategoryId !== undefined) {
    const numericSubCategoryId = parseInt(subCategoryId, 10);
    
    if (isNaN(numericSubCategoryId)) {
      console.error('❌ Invalid numeric conversion for subCategoryId:', subCategoryId);
      throw new Error(`Invalid subcategory ID: ${subCategoryId}`);
    }
    
    console.log('🔍 Looking for subcategory with ID:', numericSubCategoryId);
    
    // Find subcategory
    targetContainer = this.subCategories.find(sub => {
      const subId = parseInt(sub.id, 10);
      const match = subId === numericSubCategoryId;
      console.log(`  Checking sub ${sub.name} (ID: ${subId}) === ${numericSubCategoryId}: ${match}`);
      return match;
    });
    
    if (!targetContainer) {
      console.error('❌ Subcategory not found with ID:', numericSubCategoryId);
      throw new Error(`Subcategory with ID ${numericSubCategoryId} not found`);
    }
    
    isSubcategoryItem = true;
    console.log('✅ TARGET: Will remove item from subcategory:', targetContainer.name);
  } else {
    targetContainer = this;
    console.log('✅ TARGET: Will remove item from main category');
  }
  
  // Find and remove the item
  const numericItemId = parseInt(itemId, 10);
  if (isNaN(numericItemId)) {
    console.error('❌ Invalid itemId:', itemId);
    throw new Error(`Invalid item ID: ${itemId}`);
  }
  
  console.log('🔍 Looking for item with ID:', numericItemId);
  console.log('📋 Available items before removal:', targetContainer.items.map(i => ({ id: i.id, name: i.name })));
  
  const initialLength = targetContainer.items.length;
  targetContainer.items = targetContainer.items.filter(item => {
    const keep = parseInt(item.id, 10) !== numericItemId;
    if (!keep) {
      console.log(`🗑️ Removing item: ${item.name} (ID: ${item.id})`);
    }
    return keep;
  });
  
  if (targetContainer.items.length === initialLength) {
    console.error('❌ Item not found with ID:', numericItemId);
    console.error('Available items:', targetContainer.items.map(i => ({ id: i.id, name: i.name })));
    throw new Error('Item not found');
  }
  
  // Update counts
  if (isSubcategoryItem) {
    targetContainer.itemCount = targetContainer.items.length;
    console.log('📊 Updated subcategory itemCount to:', targetContainer.itemCount);
  }
  

  let totalItems = this.items ? this.items.length : 0;
  if (this.subCategories && this.subCategories.length > 0) {
    totalItems += this.subCategories.reduce((sum, sub) => {
      sub.itemCount = sub.items ? sub.items.length : 0;
      return sum + sub.itemCount;
    }, 0);
  }
  this.itemCount = totalItems;
  
  console.log('✅ ITEM REMOVED:');
  console.log('- Removed from:', isSubcategoryItem ? `subcategory "${targetContainer.name}"` : 'main category');
  console.log('- Items remaining:', targetContainer.items.length);
  console.log('- Total category items:', this.itemCount);
  
  return true;
};

// Methods for managing subcategories
CategorySchema.methods.addSubCategory = function(subCategoryData) {
  const newId = this.subCategories.length > 0 
    ? Math.max(...this.subCategories.map(s => s.id)) + 1 
    : 1;
    
  const newSubCategory = {
    id: newId,
    name: subCategoryData.name,
    description: subCategoryData.description || '',
    image: subCategoryData.image || '',
    colors: subCategoryData.colors || [],
    sizes: subCategoryData.sizes || [],
    items: [],
    itemCount: 0
  };
  
  this.subCategories.push(newSubCategory);
  return newSubCategory;
};

CategorySchema.methods.updateSubCategory = function(subCategoryId, updateData) {
  const subCategoryIndex = this.subCategories.findIndex(sub => sub.id === subCategoryId);
  if (subCategoryIndex === -1) {
    throw new Error('Subcategory not found');
  }
  
  Object.assign(this.subCategories[subCategoryIndex], updateData);
  return this.subCategories[subCategoryIndex];
};

CategorySchema.methods.removeSubCategory = function(subCategoryId) {
  const initialLength = this.subCategories.length;
  this.subCategories = this.subCategories.filter(sub => sub.id !== subCategoryId);
  
  if (this.subCategories.length === initialLength) {
    throw new Error('Subcategory not found');
  }
  
  // Update total item count
  this.itemCount = this.actualItemCount;
  return true;
};

module.exports = mongoose.model('Category', CategorySchema);