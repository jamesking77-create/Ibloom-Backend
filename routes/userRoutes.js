// routes/userRoutes.js (fixed route path and added error handling)
const express = require('express');
const router = express.Router();
const { getProfile, updateProfile } = require('../controllers/userController');
const { avatarUpload } = require('../utils/cloudinary');
const auth = require('../middleware/auth');

router.get('/profile', auth, getProfile);

// Fixed route path to match frontend API call
router.put('/updateProfile', auth, (req, res, next) => {
  console.log('=== AVATAR UPLOAD MIDDLEWARE ===');
  console.log('Request content-type:', req.get('content-type'));
  
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error:', err);
      
      // Handle specific multer errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB.'
        });
      }
      
      if (err.message.includes('Only image files are allowed')) {
        return res.status(400).json({
          success: false,
          message: 'Only image files (JPEG, PNG, GIF, WebP) are allowed for avatars.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error'
      });
    }
    
    console.log('✅ Multer processing completed');
    next();
  });
}, updateProfile);

module.exports = router;