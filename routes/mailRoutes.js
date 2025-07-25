const express = require('express');
const router = express.Router();
const { sendIndividualMail } = require('../controllers/mailController');

router.post('/send-individual', sendIndividualMail);

module.exports = router;
