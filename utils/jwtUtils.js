// utils/jwtUtils.js - Utilities for JWT handling
const jwt = require('jsonwebtoken');

/**
 * Generate JWT token for a user
 * @param {Object} user - User object or user ID
 * @returns {String} JWT token
 */
const generateToken = (user) => {
  const payload = {
    user: {
      id: typeof user === 'object' ? user.id || user._id : user
    }
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

/**
 * Verify a JWT token
 * @param {String} token - JWT token to verify
 * @returns {Object|Boolean} Decoded token payload or false if invalid
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return false;
  }
};

module.exports = {
  generateToken,
  verifyToken
};