const express = require("express");
const router = express.Router();
const multer = require("multer");

// Configure multer for multiple file uploads
const upload = multer({ 
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 10 // Maximum 10 files per request
  }
});

// Configure multer for multiple item images
const itemImageUpload = upload.fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 }
]);

// Configure multer for category operations that might include item images
const categoryMultiUpload = upload.fields([
  { name: 'image', maxCount: 1 }, // Category image
  { name: 'itemImage1', maxCount: 1 }, // Item image 1
  { name: 'itemImage2', maxCount: 1 }, // Item image 2
  { name: 'itemImage3', maxCount: 1 }, // Item image 3
  { name: 'subCategoryImage', maxCount: 1 } // Subcategory image
]);

const {
  getCategories,
  getCategoryById,
  updateCategory,
  createCategory,
  deleteCategory,
  searchCategories,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
  createItem,
  updateItem,
  deleteItem,
} = require("../controllers/serviceController");

const auth = require("../middleware/auth");
const {
  validateCategory,
  validateCategoryUpdate,
  validateSubCategory,
  validateSubCategoryUpdate,
  validateItem,
  validateItemUpdate,
} = require("../middleware/validation");

// ==================== CATEGORY ROUTES ====================
router.get("/categories", getCategories);
router.get("/categories/search", searchCategories);
router.get("/categories/:id", getCategoryById);

// Create category with optional single image
router.post('/categories', 
  auth, 
  upload.single('image'), 
  validateCategory, 
  createCategory
);

// Update category with support for multiple image types
router.put('/categories/:id', 
  auth, 
  categoryMultiUpload, 
  validateCategoryUpdate, 
  updateCategory
);

router.delete("/categories/:id", auth, deleteCategory);

// ==================== SUBCATEGORY ROUTES ====================
router.post('/categories/:categoryId/subcategories', 
  auth, 
  upload.single('image'), 
  validateSubCategory, 
  createSubCategory
);

router.put('/categories/:categoryId/subcategories/:subCategoryId', 
  auth, 
  upload.single('image'), 
  validateSubCategoryUpdate, 
  updateSubCategory
);

router.delete('/categories/:categoryId/subcategories/:subCategoryId', 
  auth, 
  deleteSubCategory
);

// ==================== ITEM ROUTES ====================
// Create item with multiple images (optional subcategory)
router.post('/categories/:categoryId/items', 
  auth, 
  itemImageUpload, 
  validateItem, 
  createItem
);

router.post('/categories/:categoryId/subcategories/:subCategoryId/items', 
  auth, 
  itemImageUpload, 
  validateItem, 
  (req, res, next) => {
    console.log('🚀 ROUTE MIDDLEWARE DEBUG:');
    console.log('- categoryId from params:', req.params.categoryId);
    console.log('- subCategoryId from params:', req.params.subCategoryId);
    console.log('- Original query:', req.query);
    
    // Set the subCategoryId in query for the controller
    req.query.subCategoryId = req.params.subCategoryId;
    
    console.log('- Updated query:', req.query);
    console.log('🚀 CALLING NEXT() TO CONTINUE TO CONTROLLER');
    
    // CRITICAL: Must call next() to continue to the controller
    next();
  },
  createItem // This should be the last parameter
);

// Update item with multiple images (optional subcategory)
router.put('/categories/:categoryId/items/:itemId', 
  auth, 
  itemImageUpload, 
  validateItemUpdate, 
  updateItem
);





router.put('/categories/:categoryId/subcategories/:subCategoryId/items/:itemId', 
  auth, 
  itemImageUpload, 
  validateItemUpdate, 
  (req, res, next) => {
    console.log('🔄 UPDATE ROUTE MIDDLEWARE DEBUG:');
    console.log('- categoryId:', req.params.categoryId);
    console.log('- subCategoryId:', req.params.subCategoryId);
    console.log('- itemId:', req.params.itemId);
    
    // Set subcategoryId in query for the controller
    req.query.subCategoryId = req.params.subCategoryId;
    
    console.log('🔄 CALLING NEXT() FOR UPDATE CONTROLLER');
    next();
  },
  updateItem
);







// Delete item (optional subcategory)
router.delete('/categories/:categoryId/items/:itemId', 
  auth, 
  deleteItem
);

// Delete item from specific subcategory
router.delete('/categories/:categoryId/subcategories/:subCategoryId/items/:itemId', 
  auth, 
  (req, res, next) => {
    console.log('🗑️ DELETE ROUTE MIDDLEWARE DEBUG:');
    console.log('- categoryId:', req.params.categoryId);
    console.log('- subCategoryId:', req.params.subCategoryId); 
    console.log('- itemId:', req.params.itemId);
    
    // Set subcategoryId in query for the controller
    req.query.subCategoryId = req.params.subCategoryId;
    
    console.log('🗑️ CALLING NEXT() FOR DELETE CONTROLLER');
    next();
  },
  deleteItem
);

// ==================== CONVENIENCE ROUTES ====================
// Get all items in a category (including subcategory items)
router.get('/categories/:categoryId/items', async (req, res) => {
  try {
    const Category = require("../models/Category");
    const category = await Category.findOne({ id: req.params.categoryId });
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Collect all items from category and subcategories
    let allItems = [...(category.items || [])];
    
    if (category.subCategories) {
      category.subCategories.forEach(subCat => {
        if (subCat.items) {
          // Add subcategory info to items
          const itemsWithSubCat = subCat.items.map(item => ({
            ...item.toObject(),
            subCategoryId: subCat.id,
            subCategoryName: subCat.name
          }));
          allItems.push(...itemsWithSubCat);
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "Items retrieved successfully",
      data: {
        items: allItems,
        categoryId: category.id,
        categoryName: category.name,
        totalItems: allItems.length
      },
    });
  } catch (error) {
    console.error("Get category items error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving items",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Get items in a specific subcategory
router.get('/categories/:categoryId/subcategories/:subCategoryId/items', async (req, res) => {
  try {
    const Category = require("../models/Category");
    const category = await Category.findOne({ id: req.params.categoryId });
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const subCategory = category.subCategories.find(sub => sub.id === parseInt(req.params.subCategoryId));
    if (!subCategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Subcategory items retrieved successfully",
      data: {
        items: subCategory.items || [],
        subCategoryId: subCategory.id,
        subCategoryName: subCategory.name,
        categoryId: category.id,
        categoryName: category.name,
        totalItems: subCategory.items ? subCategory.items.length : 0
      },
    });
  } catch (error) {
    console.error("Get subcategory items error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving subcategory items",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Get specific item
router.get('/categories/:categoryId/items/:itemId', async (req, res) => {
  try {
    const Category = require("../models/Category");
    const category = await Category.findOne({ id: req.params.categoryId });
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const itemId = parseInt(req.params.itemId);
    let foundItem = null;
    let location = null;

    // Search in category items
    foundItem = category.items.find(item => item.id === itemId);
    if (foundItem) {
      location = { type: 'category', categoryId: category.id };
    }

    // Search in subcategory items if not found
    if (!foundItem && category.subCategories) {
      for (const subCat of category.subCategories) {
        const item = subCat.items.find(item => item.id === itemId);
        if (item) {
          foundItem = item;
          location = { 
            type: 'subcategory', 
            categoryId: category.id, 
            subCategoryId: subCat.id,
            subCategoryName: subCat.name
          };
          break;
        }
      }
    }

    if (!foundItem) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Item retrieved successfully",
      data: {
        item: foundItem,
        location: location,
        categoryName: category.name
      },
    });
  } catch (error) {
    console.error("Get item error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;