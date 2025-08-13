// routes/authRoutes.js - Authentication routes
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.getMe);
router.post('/refresh-token', authenticateToken, authController.refreshToken);
router.post('/forgotPassword', authController.forgotPassword); 
router.post('/resetPassword/:token', authController.resetPassword);

module.exports = router;