const express = require('express');
const router = express.Router();
const {
  getCategories,
  getCategoryById,
  updateCategory,
  createCategory,
  deleteCategory,
  searchCategories
} = require('../controllers/serviceController');
const auth = require('../middleware/auth');
const { validateCategory, validateCategoryUpdate } = require('../middleware/validation');

router.get('/categories', getCategories);
router.get('/categories/search', searchCategories); 
router.get('/categories/:id', getCategoryById);

router.post('/categories', auth, validateCategory, createCategory);

router.put('/categories/:id', auth, validateCategoryUpdate, updateCategory);

router.delete('/categories/:id', auth, deleteCategory);

module.exports = router;