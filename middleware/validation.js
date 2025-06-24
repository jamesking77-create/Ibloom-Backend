// Create this as middleware/validation.js

const validateCategory = (req, res, next) => {
  try {
    const { id, name, description, items } = req.body;
    const errors = [];

    // Validate required fields
    if (!id) {
      errors.push('Category ID is required');
    } else if (!Number.isInteger(parseInt(id)) || parseInt(id) <= 0) {
      errors.push('Category ID must be a positive integer');
    }

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

    // Validate items array
    if (items) {
      let parsedItems;
      try {
        parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
      } catch (parseError) {
        errors.push('Items must be a valid JSON array');
      }

      if (parsedItems && !Array.isArray(parsedItems)) {
        errors.push('Items must be an array');
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

    // Sanitize data
    req.body.id = parseInt(id);
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
    const { name, description, items } = req.body;
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
  validateSearchQuery
};