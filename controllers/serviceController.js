const Category = require("../models/Category");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

// Helper function to upload multiple files to cloudinary
const uploadMultipleImages = async (files, folder) => {
  const uploadPromises = files.map(file => {
    return cloudinary.uploader.upload(file.path, { folder });
  });
  
  const results = await Promise.all(uploadPromises);
  
  // Clean up temp files
  files.forEach(file => {
    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }
  });
  
  return results;
};

// Helper function to process item images from request
const processItemImages = async (req, folder = "categories/items") => {
  const images = { image1: '', image2: '', image3: '' };
  
  // Handle file uploads
  if (req.files) {
    const uploadPromises = [];
    
    if (req.files.image1 && req.files.image1[0]) {
      uploadPromises.push(
        cloudinary.uploader.upload(req.files.image1[0].path, { folder })
          .then(result => {
            images.image1 = result.secure_url;
            fs.unlinkSync(req.files.image1[0].path);
          })
      );
    }
    
    if (req.files.image2 && req.files.image2[0]) {
      uploadPromises.push(
        cloudinary.uploader.upload(req.files.image2[0].path, { folder })
          .then(result => {
            images.image2 = result.secure_url;
            fs.unlinkSync(req.files.image2[0].path);
          })
      );
    }
    
    if (req.files.image3 && req.files.image3[0]) {
      uploadPromises.push(
        cloudinary.uploader.upload(req.files.image3[0].path, { folder })
          .then(result => {
            images.image3 = result.secure_url;
            fs.unlinkSync(req.files.image3[0].path);
          })
      );
    }
    
    await Promise.all(uploadPromises);
  }
  
  // Handle URL strings from request body (fallback for non-file uploads)
  if (req.body.image1 && typeof req.body.image1 === 'string' && !images.image1) {
    images.image1 = req.body.image1;
  }
  if (req.body.image2 && typeof req.body.image2 === 'string' && !images.image2) {
    images.image2 = req.body.image2;
  }
  if (req.body.image3 && typeof req.body.image3 === 'string' && !images.image3) {
    images.image3 = req.body.image3;
  }
  
  return images;
};

const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ id: 1 });

    res.status(200).json({
      success: true,
      message: "Categories retrieved successfully",
      data: {
        categories,
      },
    });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving categories",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await Category.findOne({ id: categoryId });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Category retrieved successfully",
      data: {
        category,
      },
    });
  } catch (error) {
    console.error("Get category error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving category",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const createCategory = async (req, res) => {
  try {
    // Parse request body data - ID is now auto-generated
    let { name, image, description, colors, sizes, hasQuotes, items, subCategories } = req.body;

    // Parse JSON strings if they exist
    try {
      if (typeof colors === "string") colors = JSON.parse(colors);
      if (typeof sizes === "string") sizes = JSON.parse(sizes);
      if (typeof items === "string") items = JSON.parse(items);
      if (typeof subCategories === "string") subCategories = JSON.parse(subCategories);
    } catch (parseError) {
      console.log("JSON parse error:", parseError.message);
    }

    // Generate unique ID automatically
    const nextId = await Category.getNextId();

    const categoryData = {
      id: nextId, // Auto-generated
      name,
      image,
      description: description || "",
      colors: Array.isArray(colors) ? colors.filter(c => c.trim()) : [],
      sizes: Array.isArray(sizes) ? sizes.filter(s => s.trim()) : [],
      items: items || [],
      subCategories: subCategories || [],
      hasQuotes,
      itemCount: 0, // Will be calculated by model
    };

    // Handle image upload
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "categories",
      });
      categoryData.image = result.secure_url;
      fs.unlinkSync(req.file.path);
    } else if (image) {
      categoryData.image = image;
    }

    // Process items with multiple images if provided
    if (items && Array.isArray(items)) {
      categoryData.items = items.map(item => ({
        ...item,
        images: {
          image1: item.images?.image1 || '',
          image2: item.images?.image2 || '',
          image3: item.images?.image3 || ''
        }
      }));
    }

    // Process subcategories with items that have multiple images
    if (subCategories && Array.isArray(subCategories)) {
      categoryData.subCategories = subCategories.map(subCat => {
        const processedSubCat = { ...subCat };
        
        if (processedSubCat.items && Array.isArray(processedSubCat.items)) {
          processedSubCat.items = processedSubCat.items.map(item => ({
            ...item,
            images: {
              image1: item.images?.image1 || '',
              image2: item.images?.image2 || '',
              image3: item.images?.image3 || ''
            }
          }));
        }
        
        return processedSubCat;
      });
    }

    // Create new category
    const newCategory = new Category(categoryData);
    const savedCategory = await newCategory.save();

    const responseData = {
      success: true,
      message: "Category created successfully",
      data: {
        category: {
          id: savedCategory.id,
          name: savedCategory.name,
          image: savedCategory.image,
          description: savedCategory.description,
          colors: savedCategory.colors,
          sizes: savedCategory.sizes,
          hasQuotes: savedCategory.hasQuotes,
          itemCount: savedCategory.itemCount,
          items: savedCategory.items,
          subCategories: savedCategory.subCategories,
          createdAt: savedCategory.createdAt,
          updatedAt: savedCategory.updatedAt,
        },
      },
    };

    res.status(201).json(responseData);
  } catch (error) {
    console.error("Create category error:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: validationErrors,
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category with this ID already exists",
      });
    }

    // Handle multer errors
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size too large. Maximum size is 5MB.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while creating category",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const updateCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    // Get current category data
    const currentCategory = await Category.findOne({ id: categoryId });
    if (!currentCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Parse request body data
    let { name, image, description, colors, sizes, itemCount, hasQuotes, items, subCategories } = req.body;
    console.log("body", req.body);

    // Parse JSON strings if they exist
    try {
      if (typeof items === "string") items = JSON.parse(items);
      if (typeof subCategories === "string") subCategories = JSON.parse(subCategories);
      if (typeof colors === "string") colors = JSON.parse(colors);
      if (typeof sizes === "string") sizes = JSON.parse(sizes);
    } catch (parseError) {
      console.log("JSON parse error:", parseError.message);
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (Array.isArray(colors)) updateData.colors = colors.filter(c => c.trim());
    if (Array.isArray(sizes)) updateData.sizes = sizes.filter(s => s.trim());
    if (typeof image === "string" && image.trim() !== "") {
      updateData.image = image;
    }
    if (items !== undefined) {
      updateData.items = items;
    }
    if (subCategories !== undefined) {
      updateData.subCategories = subCategories;
    }
    updateData.hasQuotes = hasQuotes;

    // Handle multiple image uploads for items
    if (req.files) {
      // Process item image uploads
      if (items && Array.isArray(items)) {
        const updatedItems = await Promise.all(items.map(async (item) => {
          const processedItem = { ...item };
          
          // Initialize images if not present
          if (!processedItem.images) {
            processedItem.images = { image1: '', image2: '', image3: '' };
          }
          
          // Handle file uploads for this specific item
          if (item._needsUploadedImages) {
            // Check which images need to be uploaded
            if (item._uploadImage1 && req.files.itemImage1) {
              const result = await cloudinary.uploader.upload(req.files.itemImage1[0].path, {
                folder: "categories/items",
              });
              processedItem.images.image1 = result.secure_url;
              fs.unlinkSync(req.files.itemImage1[0].path);
            }
            if (item._uploadImage2 && req.files.itemImage2) {
              const result = await cloudinary.uploader.upload(req.files.itemImage2[0].path, {
                folder: "categories/items",
              });
              processedItem.images.image2 = result.secure_url;
              fs.unlinkSync(req.files.itemImage2[0].path);
            }
            if (item._uploadImage3 && req.files.itemImage3) {
              const result = await cloudinary.uploader.upload(req.files.itemImage3[0].path, {
                folder: "categories/items",
              });
              processedItem.images.image3 = result.secure_url;
              fs.unlinkSync(req.files.itemImage3[0].path);
            }
            
            // Remove upload markers
            delete processedItem._needsUploadedImages;
            delete processedItem._uploadImage1;
            delete processedItem._uploadImage2;
            delete processedItem._uploadImage3;
          }
          
          return processedItem;
        }));
        
        updateData.items = updatedItems;
      }
      
      // Similar processing for subcategory items
      if (subCategories && Array.isArray(subCategories)) {
        const updatedSubCategories = await Promise.all(subCategories.map(async (subCat) => {
          const processedSubCat = { ...subCat };
          
          if (processedSubCat.items && Array.isArray(processedSubCat.items)) {
            processedSubCat.items = await Promise.all(processedSubCat.items.map(async (item) => {
              const processedItem = { ...item };
              
              if (!processedItem.images) {
                processedItem.images = { image1: '', image2: '', image3: '' };
              }
              
              // Handle file uploads for subcategory items
              if (item._needsUploadedImages) {
                // Similar upload logic would be implemented here
                delete processedItem._needsUploadedImages;
              }
              
              return processedItem;
            }));
          }
          
          // Handle subcategory image upload
          if (subCat._needsUploadedImage && req.file) {
            const result = await cloudinary.uploader.upload(req.file.path, {
              folder: "categories/subcategories",
            });
            processedSubCat.image = result.secure_url;
            delete processedSubCat._needsUploadedImage;
          }
          
          return processedSubCat;
        }));
        
        updateData.subCategories = updatedSubCategories;
      }
    }

    // Handle category image upload if file is present
    if (req.file && !req.files) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "categories",
      });
      updateData.image = result.secure_url;
      fs.unlinkSync(req.file.path);
    }

    // Update category
    const updatedCategory = await Category.findOneAndUpdate(
      { id: categoryId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const responseData = {
      success: true,
      message: "Category updated successfully",
      data: {
        category: {
          id: updatedCategory.id,
          name: updatedCategory.name,
          image: updatedCategory.image,
          description: updatedCategory.description,
          colors: updatedCategory.colors,
          sizes: updatedCategory.sizes,
          itemCount: updatedCategory.itemCount,
          hasQuotes: updatedCategory.hasQuotes,
          items: updatedCategory.items,
          subCategories: updatedCategory.subCategories,
          createdAt: updatedCategory.createdAt,
          updatedAt: updatedCategory.updatedAt,
        },
      },
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Update category error:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: validationErrors,
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category with this ID already exists",
      });
    }

    // Handle multer errors
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size too large. Maximum size is 5MB.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating category",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    const category = await Category.findOne({ id: categoryId });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    await Category.findOneAndDelete({ id: categoryId });

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
      data: {
        deletedCategory: {
          id: category.id,
          name: category.name,
        },
      },
    });
  } catch (error) {
    console.error("Delete category error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting category",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// New subcategory management endpoints
const createSubCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const { name, description, colors, sizes } = req.body;

    // Parse JSON strings if they exist
    let parsedColors = colors, parsedSizes = sizes;
    try {
      if (typeof colors === "string") parsedColors = JSON.parse(colors);
      if (typeof sizes === "string") parsedSizes = JSON.parse(sizes);
    } catch (parseError) {
      console.log("JSON parse error:", parseError.message);
    }

    const category = await Category.findOne({ id: categoryId });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const subCategoryData = {
      name,
      description: description || "",
      colors: Array.isArray(parsedColors) ? parsedColors.filter(c => c.trim()) : [],
      sizes: Array.isArray(parsedSizes) ? parsedSizes.filter(s => s.trim()) : [],
    };

    // Handle image upload
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "categories/subcategories",
      });
      subCategoryData.image = result.secure_url;
      fs.unlinkSync(req.file.path);
    }

    const newSubCategory = category.addSubCategory(subCategoryData);
    await category.save();

    res.status(201).json({
      success: true,
      message: "Subcategory created successfully",
      data: {
        subcategory: newSubCategory,
        category: category
      },
    });
  } catch (error) {
    console.error("Create subcategory error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating subcategory",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const updateSubCategory = async (req, res) => {
  try {
    const { categoryId, subCategoryId } = req.params;
    const { name, description, colors, sizes } = req.body;

    // Parse JSON strings if they exist
    let parsedColors = colors, parsedSizes = sizes;
    try {
      if (typeof colors === "string") parsedColors = JSON.parse(colors);
      if (typeof sizes === "string") parsedSizes = JSON.parse(sizes);
    } catch (parseError) {
      console.log("JSON parse error:", parseError.message);
    }

    const category = await Category.findOne({ id: categoryId });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (Array.isArray(parsedColors)) updateData.colors = parsedColors.filter(c => c.trim());
    if (Array.isArray(parsedSizes)) updateData.sizes = parsedSizes.filter(s => s.trim());

    // Handle image upload
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "categories/subcategories",
      });
      updateData.image = result.secure_url;
      fs.unlinkSync(req.file.path);
    }

    const updatedSubCategory = category.updateSubCategory(parseInt(subCategoryId), updateData);
    await category.save();

    res.status(200).json({
      success: true,
      message: "Subcategory updated successfully",
      data: {
        subcategory: updatedSubCategory,
        category: category
      },
    });
  } catch (error) {
    console.error("Update subcategory error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while updating subcategory",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const deleteSubCategory = async (req, res) => {
  try {
    const { categoryId, subCategoryId } = req.params;

    const category = await Category.findOne({ id: categoryId });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    category.removeSubCategory(parseInt(subCategoryId));
    await category.save();

    res.status(200).json({
      success: true,
      message: "Subcategory deleted successfully",
      data: {
        category: category
      },
    });
  } catch (error) {
    console.error("Delete subcategory error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while deleting subcategory",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};



const createItem = async (req, res) => {
  try {
    console.log('\n=== CREATE ITEM CONTROLLER START ===');
    console.log('📦 Full request params:', req.params);
    console.log('📦 Full request query:', req.query);
    console.log('📦 Request body keys:', Object.keys(req.body));
    
    const { categoryId } = req.params;
    const subCategoryId = req.query.subCategoryId || req.params.subCategoryId;
    const { name, description, price, colors, sizes, outOfStock } = req.body;

    console.log('📦 Extracted values:');
    console.log('- categoryId:', categoryId, typeof categoryId);
    console.log('- subCategoryId:', subCategoryId, typeof subCategoryId);
    console.log('- name:', name);

    // Parse JSON strings if they exist
    let parsedColors = colors, parsedSizes = sizes;
    try {
      if (typeof colors === "string") parsedColors = JSON.parse(colors);
      if (typeof sizes === "string") parsedSizes = JSON.parse(sizes);
    } catch (parseError) {
      console.log("JSON parse error:", parseError.message);
    }

    // Find category
    const category = await Category.findOne({ id: categoryId });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    console.log('✅ Category found:', category.name);
    console.log('📁 Subcategories available:', category.subCategories.map(s => ({
      id: s.id,
      name: s.name,
      itemsCount: s.items ? s.items.length : 0
    })));

    // Process multiple image uploads
    const images = await processItemImages(req, "categories/items");
    console.log('📸 Processed images:', Object.keys(images).filter(k => images[k] && !k.includes('Preview')));

    const itemData = {
      name,
      description: description || "",
      price: price || "",
      images: images,
      colors: Array.isArray(parsedColors) ? parsedColors.filter(c => c.trim()) : [],
      sizes: Array.isArray(parsedSizes) ? parsedSizes.filter(s => s.trim()) : [],
      outOfStock: outOfStock === 'true' || outOfStock === true,
    };

    // CRITICAL DECISION POINT
    let finalSubCategoryId = null;
    
    if (subCategoryId && subCategoryId !== 'null' && subCategoryId !== 'undefined' && subCategoryId.toString().trim() !== '') {
      finalSubCategoryId = parseInt(subCategoryId, 10);
      
      if (isNaN(finalSubCategoryId)) {
        console.error('❌ Invalid subcategory ID:', subCategoryId);
        return res.status(400).json({
          success: false,
          message: `Invalid subcategory ID: ${subCategoryId}`,
        });
      }
      
      console.log('🎯 TARGET: Adding item to SUBCATEGORY ID:', finalSubCategoryId);
    } else {
      console.log('🎯 TARGET: Adding item to MAIN CATEGORY (no subcategory specified)');
    }

    // Call addItem method
    console.log('🔧 Calling category.addItem with:', {
      itemName: itemData.name,
      subCategoryId: finalSubCategoryId
    });
    
    const newItem = category.addItem(itemData, finalSubCategoryId);
    
    console.log('✅ Item created:', {
      id: newItem.id,
      name: newItem.name,
      addedToSubCategory: finalSubCategoryId
    });
    
    // Save category
    await category.save();
    console.log('✅ Category saved');
    
    // VERIFICATION: Check where the item actually ended up
    const updatedCategory = await Category.findOne({ id: categoryId });
    console.log('\n📊 POST-SAVE VERIFICATION:');
    console.log('- Main category items:', updatedCategory.items.length);
    updatedCategory.subCategories.forEach(sub => {
      console.log(`- Subcategory "${sub.name}" (ID: ${sub.id}) items:`, sub.items ? sub.items.length : 0);
      if (sub.items && sub.items.length > 0) {
        console.log('  Items:', sub.items.map(item => ({ id: item.id, name: item.name })));
      }
    });
    
    console.log('=== CREATE ITEM CONTROLLER END ===\n');

    res.status(201).json({
      success: true,
      message: "Item created successfully",
      data: {
        item: newItem,
        category: updatedCategory,
        debug: {
          targetSubCategoryId: finalSubCategoryId,
          wasAddedToSubCategory: finalSubCategoryId !== null
        }
      },
    });
  } catch (error) {
    console.error("❌ Create item error:", error);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while creating item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


const updateItem = async (req, res) => {
  try {
    console.log('\n=== UPDATE ITEM CONTROLLER START ===');
    console.log('📦 Full request params:', req.params);
    console.log('📦 Full request query:', req.query);
    
    const { categoryId, itemId } = req.params;
    const subCategoryId = req.query.subCategoryId || req.params.subCategoryId;
    const { name, description, price, colors, sizes, outOfStock } = req.body;

    console.log('📦 Extracted values:');
    console.log('- categoryId:', categoryId);
    console.log('- itemId:', itemId);
    console.log('- subCategoryId:', subCategoryId);

    // Parse JSON strings if they exist
    let parsedColors = colors, parsedSizes = sizes;
    try {
      if (typeof colors === "string") parsedColors = JSON.parse(colors);
      if (typeof sizes === "string") parsedSizes = JSON.parse(sizes);
    } catch (parseError) {
      console.log("JSON parse error:", parseError.message);
    }

    const category = await Category.findOne({ id: categoryId });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Determine target subcategory ID
    let finalSubCategoryId = null;
    if (subCategoryId && subCategoryId !== 'null' && subCategoryId !== 'undefined' && subCategoryId.toString().trim() !== '') {
      finalSubCategoryId = parseInt(subCategoryId, 10);
      
      if (isNaN(finalSubCategoryId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid subcategory ID: ${subCategoryId}`,
        });
      }
      
      console.log('🎯 TARGET: Updating item in SUBCATEGORY ID:', finalSubCategoryId);
    } else {
      console.log('🎯 TARGET: Updating item in MAIN CATEGORY');
    }

    // Find the current item to get current images
    const targetContainer = finalSubCategoryId 
      ? category.subCategories.find(sub => parseInt(sub.id, 10) === finalSubCategoryId)
      : category;
      
    if (finalSubCategoryId && !targetContainer) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    const currentItem = targetContainer.items.find(item => parseInt(item.id, 10) === parseInt(itemId, 10));
    if (!currentItem) {
      console.error('❌ Item not found. Available items:', targetContainer.items.map(i => ({ id: i.id, name: i.name })));
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    // Process multiple image uploads, preserving existing images
    const newImages = await processItemImages(req, "categories/items");
    
    // Merge with existing images (only update provided images)
    const images = {
      image1: newImages.image1 || currentItem.images?.image1 || '',
      image2: newImages.image2 || currentItem.images?.image2 || '',
      image3: newImages.image3 || currentItem.images?.image3 || ''
    };

    const updateData = {
      name,
      description: description || "",
      price: price || "",
      colors: Array.isArray(parsedColors) ? parsedColors.filter(c => c.trim()) : [],
      sizes: Array.isArray(parsedSizes) ? parsedSizes.filter(s => s.trim()) : [],
      outOfStock: outOfStock === 'true' || outOfStock === true,
      images: images
    };

    console.log('🔧 Calling category.updateItem with:', {
      itemId: parseInt(itemId, 10),
      subCategoryId: finalSubCategoryId,
      updateData: { name: updateData.name }
    });

    const updatedItem = category.updateItem(parseInt(itemId, 10), updateData, finalSubCategoryId);
    await category.save();

    console.log('✅ Item updated successfully');
    console.log('=== UPDATE ITEM CONTROLLER END ===\n');

    res.status(200).json({
      success: true,
      message: "Item updated successfully",
      data: {
        item: updatedItem,
        category: category
      },
    });
  } catch (error) {
    console.error("❌ Update item error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while updating item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const deleteItem = async (req, res) => {
  try {
    console.log('\n=== DELETE ITEM CONTROLLER START ===');
    console.log('📦 Full request params:', req.params);
    console.log('📦 Full request query:', req.query);
    
    const { categoryId, itemId } = req.params;
    const subCategoryId = req.query.subCategoryId || req.params.subCategoryId;

    console.log('📦 Extracted values:');
    console.log('- categoryId:', categoryId);
    console.log('- itemId:', itemId);
    console.log('- subCategoryId:', subCategoryId);

    const category = await Category.findOne({ id: categoryId });
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Determine target subcategory ID
    let finalSubCategoryId = null;
    if (subCategoryId && subCategoryId !== 'null' && subCategoryId !== 'undefined' && subCategoryId.toString().trim() !== '') {
      finalSubCategoryId = parseInt(subCategoryId, 10);
      
      if (isNaN(finalSubCategoryId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid subcategory ID: ${subCategoryId}`,
        });
      }
      
      console.log('🎯 TARGET: Deleting item from SUBCATEGORY ID:', finalSubCategoryId);
    } else {
      console.log('🎯 TARGET: Deleting item from MAIN CATEGORY');
    }

    console.log('🔧 Calling category.removeItem with:', {
      itemId: parseInt(itemId, 10),
      subCategoryId: finalSubCategoryId
    });

    // Find target container first for debugging
    const targetContainer = finalSubCategoryId 
      ? category.subCategories.find(sub => parseInt(sub.id, 10) === finalSubCategoryId)
      : category;

    if (finalSubCategoryId && !targetContainer) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    console.log('📊 Items in target container before deletion:', 
      targetContainer.items.map(i => ({ id: i.id, name: i.name })));

    category.removeItem(parseInt(itemId, 10), finalSubCategoryId);
    await category.save();

    console.log('✅ Item deleted successfully');
    console.log('=== DELETE ITEM CONTROLLER END ===\n');

    res.status(200).json({
      success: true,
      message: "Item deleted successfully",
      data: {
        category: category
      },
    });
  } catch (error) {
    console.error("❌ Delete item error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while deleting item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};



const searchCategories = async (req, res) => {
  try {
    const {
      q,
      name,
      minItems,
      maxItems,
      sortBy = "id",
      sortOrder = "asc",
      page = 1,
      limit = 10,
    } = req.query;

    let searchCriteria = {};

    if (q) {
      searchCriteria.$or = [
        { name: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    if (name) {
      searchCriteria.name = { $regex: name, $options: "i" };
    }

    if (minItems || maxItems) {
      searchCriteria.itemCount = {};
      if (minItems) searchCriteria.itemCount.$gte = parseInt(minItems);
      if (maxItems) searchCriteria.itemCount.$lte = parseInt(maxItems);
    }

    const sortCriteria = {};
    sortCriteria[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [categories, totalCount] = await Promise.all([
      Category.find(searchCriteria)
        .sort(sortCriteria)
        .skip(skip)
        .limit(parseInt(limit)),
      Category.countDocuments(searchCriteria),
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    res.status(200).json({
      success: true,
      message: "Categories search completed successfully",
      data: {
        categories,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit),
        },
        searchCriteria: {
          query: q,
          name,
          minItems,
          maxItems,
          sortBy,
          sortOrder,
        },
      },
    });
  } catch (error) {
    console.error("Search categories error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while searching categories",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
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
};