// middleware/validation.js - Enhanced validation for new features with item support

const validateCategory = (req, res, next) => {
  try {
    const { name, description, colors, sizes } = req.body;
    const errors = [];

    // Validate required fields - ID is now auto-generated, so not required
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push('Category name is required and must be a non-empty string');
    } else if (name.trim().length > 100) {
      errors.push('Category name must be less than 100 characters');
    }

    // Validate optional fields
    if (description && typeof description !== 'string') {
      errors.push('Description must be a string');
    } else if (description && description.length > 500) {
      errors.push('Description must be less than 500 characters');
    }

    // Validate colors array
    if (colors !== undefined) {
      let parsedColors;
      try {
        parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
      } catch (parseError) {
        errors.push('Colors must be a valid JSON array');
      }

      if (parsedColors && !Array.isArray(parsedColors)) {
        errors.push('Colors must be an array');
      } else if (parsedColors && Array.isArray(parsedColors)) {
        const invalidColors = parsedColors.filter(color => 
          typeof color !== 'string' || color.trim().length === 0
        );
        if (invalidColors.length > 0) {
          errors.push('All colors must be non-empty strings');
        }
      }
    }

    // Validate sizes array
    if (sizes !== undefined) {
      let parsedSizes;
      try {
        parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
      } catch (parseError) {
        errors.push('Sizes must be a valid JSON array');
      }

      if (parsedSizes && !Array.isArray(parsedSizes)) {
        errors.push('Sizes must be an array');
      } else if (parsedSizes && Array.isArray(parsedSizes)) {
        const invalidSizes = parsedSizes.filter(size => 
          typeof size !== 'string' || size.trim().length === 0
        );
        if (invalidSizes.length > 0) {
          errors.push('All sizes must be non-empty strings');
        }
      }
    }

    // Check for file upload errors (if using multer)
    if (req.fileValidationError) {
      errors.push(req.fileValidationError);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Sanitize data - no need to parse ID since it's auto-generated
    req.body.name = name.trim();
    if (description) req.body.description = description.trim();

    next();

  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during validation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const validateCategoryUpdate = (req, res, next) => {
  try {
    const { name, description, items, subCategories, colors, sizes } = req.body;
    const errors = [];

    // For updates, fields are optional but must be valid if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        errors.push('Category name must be a non-empty string');
      } else if (name.trim().length > 100) {
        errors.push('Category name must be less than 100 characters');
      }
    }

    if (description !== undefined) {
      if (typeof description !== 'string') {
        errors.push('Description must be a string');
      } else if (description.length > 500) {
        errors.push('Description must be less than 500 characters');
      }
    }

    // Validate colors array
    if (colors !== undefined) {
      let parsedColors;
      try {
        parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
      } catch (parseError) {
        errors.push('Colors must be a valid JSON array');
      }

      if (parsedColors && !Array.isArray(parsedColors)) {
        errors.push('Colors must be an array');
      } else if (parsedColors && Array.isArray(parsedColors)) {
        const invalidColors = parsedColors.filter(color => 
          typeof color !== 'string' || color.trim().length === 0
        );
        if (invalidColors.length > 0) {
          errors.push('All colors must be non-empty strings');
        }
      }
    }

    // Validate sizes array
    if (sizes !== undefined) {
      let parsedSizes;
      try {
        parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
      } catch (parseError) {
        errors.push('Sizes must be a valid JSON array');
      }

      if (parsedSizes && !Array.isArray(parsedSizes)) {
        errors.push('Sizes must be an array');
      } else if (parsedSizes && Array.isArray(parsedSizes)) {
        const invalidSizes = parsedSizes.filter(size => 
          typeof size !== 'string' || size.trim().length === 0
        );
        if (invalidSizes.length > 0) {
          errors.push('All sizes must be non-empty strings');
        }
      }
    }

    // Validate items array
    if (items !== undefined) {
      let parsedItems;
      try {
        parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
      } catch (parseError) {
        errors.push('Items must be a valid JSON array');
      }

      if (parsedItems && !Array.isArray(parsedItems)) {
        errors.push('Items must be an array');
      } else if (parsedItems && Array.isArray(parsedItems)) {
        // Validate each item structure with multiple images
        parsedItems.forEach((item, index) => {
          if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
            errors.push(`Item ${index + 1}: Name is required and must be a non-empty string`);
          }
          
          if (item.colors && !Array.isArray(item.colors)) {
            errors.push(`Item ${index + 1}: Colors must be an array`);
          }
          
          if (item.sizes && !Array.isArray(item.sizes)) {
            errors.push(`Item ${index + 1}: Sizes must be an array`);
          }
          
          if (item.outOfStock !== undefined && typeof item.outOfStock !== 'boolean') {
            errors.push(`Item ${index + 1}: outOfStock must be a boolean`);
          }

          // Validate images object structure
          if (item.images && typeof item.images === 'object') {
            const validImageKeys = ['image1', 'image2', 'image3'];
            const imageKeys = Object.keys(item.images);
            
            imageKeys.forEach(key => {
              if (!validImageKeys.includes(key)) {
                errors.push(`Item ${index + 1}: Invalid image key '${key}'. Valid keys are: ${validImageKeys.join(', ')}`);
              }
              
              if (item.images[key] && typeof item.images[key] !== 'string') {
                errors.push(`Item ${index + 1}: Image '${key}' must be a string (URL)`);
              }
            });
          }
        });
      }
    }

    // Validate subcategories array
    if (subCategories !== undefined) {
      let parsedSubCategories;
      try {
        parsedSubCategories = typeof subCategories === 'string' ? JSON.parse(subCategories) : subCategories;
      } catch (parseError) {
        errors.push('SubCategories must be a valid JSON array');
      }

      if (parsedSubCategories && !Array.isArray(parsedSubCategories)) {
        errors.push('SubCategories must be an array');
      } else if (parsedSubCategories && Array.isArray(parsedSubCategories)) {
        // Validate each subcategory structure
        parsedSubCategories.forEach((subCat, index) => {
          if (!subCat.name || typeof subCat.name !== 'string' || subCat.name.trim().length === 0) {
            errors.push(`SubCategory ${index + 1}: Name is required and must be a non-empty string`);
          }
          if (subCat.colors && !Array.isArray(subCat.colors)) {
            errors.push(`SubCategory ${index + 1}: Colors must be an array`);
          }
          if (subCat.sizes && !Array.isArray(subCat.sizes)) {
            errors.push(`SubCategory ${index + 1}: Sizes must be an array`);
          }
          
          // Validate items within subcategory with multiple images
          if (subCat.items && Array.isArray(subCat.items)) {
            subCat.items.forEach((item, itemIndex) => {
              if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
                errors.push(`SubCategory ${index + 1}, Item ${itemIndex + 1}: Name is required`);
              }
              if (item.outOfStock !== undefined && typeof item.outOfStock !== 'boolean') {
                errors.push(`SubCategory ${index + 1}, Item ${itemIndex + 1}: outOfStock must be a boolean`);
              }
              
              // Validate images object structure for subcategory items
              if (item.images && typeof item.images === 'object') {
                const validImageKeys = ['image1', 'image2', 'image3'];
                const imageKeys = Object.keys(item.images);
                
                imageKeys.forEach(key => {
                  if (!validImageKeys.includes(key)) {
                    errors.push(`SubCategory ${index + 1}, Item ${itemIndex + 1}: Invalid image key '${key}'`);
                  }
                  
                  if (item.images[key] && typeof item.images[key] !== 'string') {
                    errors.push(`SubCategory ${index + 1}, Item ${itemIndex + 1}: Image '${key}' must be a string (URL)`);
                  }
                });
              }
            });
          }
        });
      }
    }

    // Check for file upload errors
    if (req.fileValidationError) {
      errors.push(req.fileValidationError);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Sanitize data
    if (name !== undefined) req.body.name = name.trim();
    if (description !== undefined) req.body.description = description.trim();

    next();

  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during validation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// New validation for subcategories
const validateSubCategory = (req, res, next) => {
  try {
    const { name, description, colors, sizes } = req.body;
    const errors = [];

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push('Subcategory name is required and must be a non-empty string');
    } else if (name.trim().length > 100) {
      errors.push('Subcategory name must be less than 100 characters');
    }

    // Validate optional fields
    if (description && typeof description !== 'string') {
      errors.push('Description must be a string');
    } else if (description && description.length > 500) {
      errors.push('Description must be less than 500 characters');
    }

    // Validate colors array
    if (colors !== undefined) {
      let parsedColors;
      try {
        parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
      } catch (parseError) {
        errors.push('Colors must be a valid JSON array');
      }

      if (parsedColors && !Array.isArray(parsedColors)) {
        errors.push('Colors must be an array');
      } else if (parsedColors && Array.isArray(parsedColors)) {
        const invalidColors = parsedColors.filter(color => 
          typeof color !== 'string' || color.trim().length === 0
        );
        if (invalidColors.length > 0) {
          errors.push('All colors must be non-empty strings');
        }
      }
    }

    // Validate sizes array
    if (sizes !== undefined) {
      let parsedSizes;
      try {
        parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
      } catch (parseError) {
        errors.push('Sizes must be a valid JSON array');
      }

      if (parsedSizes && !Array.isArray(parsedSizes)) {
        errors.push('Sizes must be an array');
      } else if (parsedSizes && Array.isArray(parsedSizes)) {
        const invalidSizes = parsedSizes.filter(size => 
          typeof size !== 'string' || size.trim().length === 0
        );
        if (invalidSizes.length > 0) {
          errors.push('All sizes must be non-empty strings');
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Sanitize data
    req.body.name = name.trim();
    if (description) req.body.description = description.trim();

    next();

  } catch (error) {
    console.error('Subcategory validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during validation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const validateSubCategoryUpdate = (req, res, next) => {
  try {
    const { name, description, colors, sizes } = req.body;
    const errors = [];

    // For updates, fields are optional but must be valid if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        errors.push('Subcategory name must be a non-empty string');
      } else if (name.trim().length > 100) {
        errors.push('Subcategory name must be less than 100 characters');
      }
    }

    if (description !== undefined) {
      if (typeof description !== 'string') {
        errors.push('Description must be a string');
      } else if (description.length > 500) {
        errors.push('Description must be less than 500 characters');
      }
    }

    // Validate colors and sizes arrays (same logic as above)
    if (colors !== undefined) {
      let parsedColors;
      try {
        parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
      } catch (parseError) {
        errors.push('Colors must be a valid JSON array');
      }

      if (parsedColors && !Array.isArray(parsedColors)) {
        errors.push('Colors must be an array');
      } else if (parsedColors && Array.isArray(parsedColors)) {
        const invalidColors = parsedColors.filter(color => 
          typeof color !== 'string' || color.trim().length === 0
        );
        if (invalidColors.length > 0) {
          errors.push('All colors must be non-empty strings');
        }
      }
    }

    if (sizes !== undefined) {
      let parsedSizes;
      try {
        parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
      } catch (parseError) {
        errors.push('Sizes must be a valid JSON array');
      }

      if (parsedSizes && !Array.isArray(parsedSizes)) {
        errors.push('Sizes must be an array');
      } else if (parsedSizes && Array.isArray(parsedSizes)) {
        const invalidSizes = parsedSizes.filter(size => 
          typeof size !== 'string' || size.trim().length === 0
        );
        if (invalidSizes.length > 0) {
          errors.push('All sizes must be non-empty strings');
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Sanitize data
    if (name !== undefined) req.body.name = name.trim();
    if (description !== undefined) req.body.description = description.trim();

    next();

  } catch (error) {
    console.error('Subcategory update validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during validation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// New validation for items
const validateItem = (req, res, next) => {
  try {
    const { name, description, price, colors, sizes, outOfStock } = req.body;
    const errors = [];

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push('Item name is required and must be a non-empty string');
    } else if (name.trim().length > 100) {
      errors.push('Item name must be less than 100 characters');
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      errors.push('Item description is required and must be a non-empty string');
    } else if (description.length > 1000) {
      errors.push('Item description must be less than 1000 characters');
    }

    // Validate optional fields
    if (price && typeof price !== 'string') {
      errors.push('Price must be a string');
    }

    if (outOfStock !== undefined && typeof outOfStock !== 'boolean' && outOfStock !== 'true' && outOfStock !== 'false') {
      errors.push('outOfStock must be a boolean or boolean string');
    }

    // Validate colors array
    if (colors !== undefined) {
      let parsedColors;
      try {
        parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
      } catch (parseError) {
        errors.push('Colors must be a valid JSON array');
      }

      if (parsedColors && !Array.isArray(parsedColors)) {
        errors.push('Colors must be an array');
      } else if (parsedColors && Array.isArray(parsedColors)) {
        const invalidColors = parsedColors.filter(color => 
          typeof color !== 'string' || color.trim().length === 0
        );
        if (invalidColors.length > 0) {
          errors.push('All colors must be non-empty strings');
        }
      }
    }

    // Validate sizes array
    if (sizes !== undefined) {
      let parsedSizes;
      try {
        parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
      } catch (parseError) {
        errors.push('Sizes must be a valid JSON array');
      }

      if (parsedSizes && !Array.isArray(parsedSizes)) {
        errors.push('Sizes must be an array');
      } else if (parsedSizes && Array.isArray(parsedSizes)) {
        const invalidSizes = parsedSizes.filter(size => 
          typeof size !== 'string' || size.trim().length === 0
        );
        if (invalidSizes.length > 0) {
          errors.push('All sizes must be non-empty strings');
        }
      }
    }

    // Validate file uploads (multiple images)
    if (req.files) {
      const allowedFields = ['image1', 'image2', 'image3'];
      Object.keys(req.files).forEach(fieldName => {
        if (!allowedFields.includes(fieldName)) {
          errors.push(`Invalid file field '${fieldName}'. Allowed fields: ${allowedFields.join(', ')}`);
        }
      });
    }

    if (req.fileValidationError) {
      errors.push(req.fileValidationError);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Sanitize data
    req.body.name = name.trim();
    req.body.description = description.trim();
    if (price) req.body.price = price.trim();

    next();

  } catch (error) {
    console.error('Item validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during validation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const validateItemUpdate = (req, res, next) => {
  try {
    const { name, description, price, colors, sizes, outOfStock } = req.body;
    const errors = [];

    // For updates, fields are optional but must be valid if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        errors.push('Item name must be a non-empty string');
      } else if (name.trim().length > 100) {
        errors.push('Item name must be less than 100 characters');
      }
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length === 0) {
        errors.push('Item description must be a non-empty string');
      } else if (description.length > 1000) {
        errors.push('Item description must be less than 1000 characters');
      }
    }

    if (price !== undefined && typeof price !== 'string') {
      errors.push('Price must be a string');
    }

    if (outOfStock !== undefined && typeof outOfStock !== 'boolean' && outOfStock !== 'true' && outOfStock !== 'false') {
      errors.push('outOfStock must be a boolean or boolean string');
    }

    // Validate colors array
    if (colors !== undefined) {
      let parsedColors;
      try {
        parsedColors = typeof colors === 'string' ? JSON.parse(colors) : colors;
      } catch (parseError) {
        errors.push('Colors must be a valid JSON array');
      }

      if (parsedColors && !Array.isArray(parsedColors)) {
        errors.push('Colors must be an array');
      } else if (parsedColors && Array.isArray(parsedColors)) {
        const invalidColors = parsedColors.filter(color => 
          typeof color !== 'string' || color.trim().length === 0
        );
        if (invalidColors.length > 0) {
          errors.push('All colors must be non-empty strings');
        }
      }
    }

    // Validate sizes array
    if (sizes !== undefined) {
      let parsedSizes;
      try {
        parsedSizes = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
      } catch (parseError) {
        errors.push('Sizes must be a valid JSON array');
      }

      if (parsedSizes && !Array.isArray(parsedSizes)) {
        errors.push('Sizes must be an array');
      } else if (parsedSizes && Array.isArray(parsedSizes)) {
        const invalidSizes = parsedSizes.filter(size => 
          typeof size !== 'string' || size.trim().length === 0
        );
        if (invalidSizes.length > 0) {
          errors.push('All sizes must be non-empty strings');
        }
      }
    }

    // Validate file uploads (multiple images)
    if (req.files) {
      const allowedFields = ['image1', 'image2', 'image3'];
      Object.keys(req.files).forEach(fieldName => {
        if (!allowedFields.includes(fieldName)) {
          errors.push(`Invalid file field '${fieldName}'. Allowed fields: ${allowedFields.join(', ')}`);
        }
      });
    }

    if (req.fileValidationError) {
      errors.push(req.fileValidationError);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Sanitize data
    if (name !== undefined) req.body.name = name.trim();
    if (description !== undefined) req.body.description = description.trim();
    if (price !== undefined) req.body.price = price.trim();

    next();

  } catch (error) {
    console.error('Item update validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during validation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const validateSearchQuery = (req, res, next) => {
  try {
    const { page, limit, minItems, maxItems, sortBy, sortOrder } = req.query;
    const errors = [];

    // Validate pagination
    if (page && (!Number.isInteger(parseInt(page)) || parseInt(page) < 1)) {
      errors.push('Page must be a positive integer');
    }

    if (limit && (!Number.isInteger(parseInt(limit)) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
      errors.push('Limit must be a positive integer between 1 and 100');
    }

    // Validate item count filters
    if (minItems && (!Number.isInteger(parseInt(minItems)) || parseInt(minItems) < 0)) {
      errors.push('minItems must be a non-negative integer');
    }

    if (maxItems && (!Number.isInteger(parseInt(maxItems)) || parseInt(maxItems) < 0)) {
      errors.push('maxItems must be a non-negative integer');
    }

    if (minItems && maxItems && parseInt(minItems) > parseInt(maxItems)) {
      errors.push('minItems cannot be greater than maxItems');
    }

    // Validate sort parameters
    const validSortFields = ['id', 'name', 'createdAt', 'updatedAt', 'itemCount'];
    if (sortBy && !validSortFields.includes(sortBy)) {
      errors.push(`sortBy must be one of: ${validSortFields.join(', ')}`);
    }

    if (sortOrder && !['asc', 'desc'].includes(sortOrder.toLowerCase())) {
      errors.push('sortOrder must be either "asc" or "desc"');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid search parameters',
        errors
      });
    }

    next();

  } catch (error) {
    console.error('Search validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during search validation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  validateCategory,
  validateCategoryUpdate,
  validateSubCategory,
  validateSubCategoryUpdate,
  validateItem,
  validateItemUpdate,
  validateSearchQuery
};