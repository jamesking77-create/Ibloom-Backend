// Add this to your routes (e.g., routes/public.js)
const express = require('express');
const router = express.Router();

// Public business profile endpoint - NO AUTHENTICATION REQUIRED
router.get('/business-profile', async (req, res) => {
  try {
    // Get the business owner's profile (adjust query to match your DB structure)
    const businessProfile = await User.findOne({ 
      // Add your condition to identify the business owner
      // This could be role: 'admin', or a specific user ID, etc.
    }).select('name email phone location bio specialize avatar joinDate categories');

    if (!businessProfile) {
      return res.status(404).json({
        success: false,
        message: 'Business profile not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        data: {
          user: businessProfile
        }
      }
    });

  } catch (error) {
    console.error('Error fetching public business profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch business profile'
    });
  }
});

module.exports = router;

// In your main app.js, add:
// app.use('/api/public', require('./routes/public'));