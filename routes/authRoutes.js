// routes/authRoutes.js - Authentication routes
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', auth, authController.getMe);
router.post('/refresh-token', auth, authController.refreshToken);
router.post('/forgotPassword', authController.forgotPassword); 
router.post('/resetPassword/:token', authController.resetPassword);

module.exports = router;