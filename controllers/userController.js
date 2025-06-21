// controllers/userController.js
const User = require('../models/User');

// Get current user profile
const getProfile = async (req, res) => {
  try {
    // User is already available from auth middleware (password excluded)
    const user = req.user;
    
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
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update current user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      name,
      phone,
      location,
      bio,
      avatar,
      specialize,
      categories
    } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;
    if (bio !== undefined) updateData.bio = bio;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (specialize !== undefined) updateData.specialize = specialize;
    if (categories !== undefined) updateData.categories = categories;

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
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
    });

  } catch (error) {
    console.error('Update profile error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getProfile,
  updateProfile
};