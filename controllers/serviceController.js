const Category = require("../models/Category");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

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
    let { name, image, description, itemCount, hasQuotes, items } = req.body;
    console.log("body", req.body);

    // Parse JSON strings if they exist
    try {
      if (typeof items === "string") {
        items = JSON.parse(items);
      }
    } catch (parseError) {
      console.log("JSON parse error:", parseError.message);
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (typeof image === "string" && image.trim() !== "") {
      updateData.image = image;
    }
    if (items !== undefined) {
      updateData.items = items;
      updateData.itemCount = Array.isArray(items) ? items.length : itemCount;
    }
    updateData.hasQuotes = hasQuotes;

    // Handle image upload if file is present - ENHANCED VERSION
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "categories",
      });
      
      // Check if this upload is for an item (when items are being updated with a file)
      if (items && Array.isArray(items)) {
        // Find the item that needs the uploaded image (marked with _needsUploadedImage)
        const updatedItems = items.map((item) => {
          if (item._needsUploadedImage) {
            const { _needsUploadedImage, ...itemWithoutMarker } = item;
            return { ...itemWithoutMarker, image: result.secure_url };
          }
          return item;
        });
        updateData.items = updatedItems;
        updateData.itemCount = updatedItems.length;
      } else {
        // This is a category image upload
        updateData.image = result.secure_url;
      }

      // Delete temp file from server
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
          itemCount: updatedCategory.itemCount,
          hasQuotes: updatedCategory.hasQuotes,
          items: updatedCategory.items,
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

const createCategory = async (req, res) => {
  try {
    // Parse request body data
    let { id, name, image, description, itemCount, hasQuotes, items } =
      req.body;

    // Parse JSON strings if they exist
    try {
      if (typeof items === "string") {
        items = JSON.parse(items);
      }
    } catch (parseError) {
      console.log("JSON parse error:", parseError.message);
    }

    const categoryData = {
      id: parseInt(id),
      name,
      image,
      description: description || "",
      items: items || [],
      hasQuotes,
      itemCount: Array.isArray(items) ? items.length : itemCount,
    };

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "categories",
      });
      categoryData.image = result.secure_url;

      fs.unlinkSync(req.file.path);
    } else if (image) {
      categoryData.image = image;
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
          hasQuotes: savedCategory.hasQuotes,
          itemCount: savedCategory.itemCount,
          items: savedCategory.items,
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
};