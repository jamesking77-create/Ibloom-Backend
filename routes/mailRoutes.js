const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { sendIndividualMail, sendBroadcastMail } = require('../controllers/mailController');

router.post('/send-individual', upload.array('attachments'), sendIndividualMail);
router.post('/broadcast', upload.array('attachments'), sendBroadcastMail);

module.exports = router;
