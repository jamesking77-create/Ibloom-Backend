const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth'); 
const userController = require('../controllers/userController');


router.get('/profile', protect, userController.getProfile);

module.exports = router;
