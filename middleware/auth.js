  // middleware/auth.js - Enhanced JWT Authentication middleware
  const jwt = require('jsonwebtoken');
  const User = require('../models/User');

  module.exports = async function(req, res, next) {
    // Get token from header
    const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');
    
    // Check if no token
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No authentication token, access denied'
      });
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if token is expired
      if (decoded.exp < Date.now() / 1000) {
        return res.status(401).json({
          success: false,
          message: 'Token expired, please login again'
        });
      }
      
      // Check if user exists
      const user = await User.findById(decoded.user.id).select('-password');
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User associated with this token no longer exists'
        });
      }
      
      // Add user info to request
      req.user = user;
      next();
    } catch (err) {
      console.error('JWT verification error:', err.message);
      
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired, please login again'
        });
      }
      
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Server authentication error'
      });
    }
  };