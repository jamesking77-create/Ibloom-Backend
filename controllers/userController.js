// controllers/userController.js (updated with better error handling and logging)
const User = require('../models/User');
const { deleteFromCloudinary } = require('../utils/cloudinary');

const updateProfile = async (req, res) => {
  try {
    console.log('=== UPDATE PROFILE REQUEST ===');
    console.log('User ID:', req.user._id);
    console.log('Request body:', req.body);
    console.log('Request file:', req.file ? {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    } : 'No file uploaded');

    const userId = req.user._id;
    
    // Get current user data to handle old avatar deletion
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ Current user found:', currentUser.email);

    // Parse request body data
    let {
      name,
      phone,
      location,
      bio,
      specialize,
      categories
    } = req.body;

    // Parse JSON strings if they exist
    try {
      if (typeof specialize === 'string') {
        specialize = JSON.parse(specialize);
      }
      if (typeof categories === 'string') {
        categories = JSON.parse(categories);
      }
    } catch (parseError) {
      console.log('⚠️ JSON parse error:', parseError.message);
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;
    if (bio !== undefined) updateData.bio = bio;
    if (specialize !== undefined) updateData.specialize = specialize;
    if (categories !== undefined) updateData.categories = categories;

    console.log('📝 Update data prepared:', updateData);

    // Handle avatar upload if file is present
    if (req.file) {
      console.log('🖼️ Processing avatar upload...');
      
      // If user already has an avatar, delete the old one from Cloudinary
      if (currentUser.avatar && currentUser.avatar.publicId) {
        console.log('🗑️ Deleting old avatar:', currentUser.avatar.publicId);
        try {
          const deleteResult = await deleteFromCloudinary(currentUser.avatar.publicId);
          console.log('✅ Old avatar deleted:', deleteResult);
        } catch (deleteError) {
          console.error('❌ Error deleting old avatar:', deleteError);
        }
      }

      // Add new avatar data to update object
      updateData.avatar = {
        url: req.file.path,
        publicId: req.file.filename,
        resourceType: req.file.resource_type,
        format: req.file.format,
        width: req.file.width,
        height: req.file.height,
        bytes: req.file.bytes
      };

      console.log('✅ New avatar data:', updateData.avatar);
    } else {
      console.log('ℹ️ No avatar file to process');
    }

    // Update user profile
    console.log('💾 Updating user in database...');
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!updatedUser) {
      console.log('❌ User not found during update');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User updated successfully');

    const responseData = {
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: updatedUser._id,
          username: updatedUser.username,
          email: updatedUser.email,
          name: updatedUser.name,
          phone: updatedUser.phone,
          location: updatedUser.location,
          bio: updatedUser.bio,
          avatar: updatedUser.avatar,
          specialize: updatedUser.specialize,
          categories: updatedUser.categories,
          role: updatedUser.role,
          isEmailVerified: updatedUser.isEmailVerified,
          joinDate: updatedUser.joinDate,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt
        }
      }
    };

    console.log('📤 Sending response:', {
      success: responseData.success,
      message: responseData.message,
      userEmail: responseData.data.user.email,
      hasAvatar: !!responseData.data.user.avatar
    });

    res.status(200).json(responseData);

  } catch (error) {
    console.error('❌ Update profile error:', error);
    console.error('Error stack:', error.stack);
        
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      console.log('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validationErrors
      });
    }

    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      console.log('❌ File too large');
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getProfile = async (req, res) => {
  try {
    console.log('=== GET PROFILE REQUEST ===');
    console.log('User ID:', req.user._id);
    
    const user = req.user;
    console.log('✅ Profile retrieved for:', user.email);
        
    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          name: user.name,
          phone: user.phone,
          location: user.location,
          bio: user.bio,
          avatar: user.avatar,
          specialize: user.specialize,
          categories: user.categories,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          joinDate: user.joinDate,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getProfile,
  updateProfile
};