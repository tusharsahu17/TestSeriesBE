const express = require('express');
const multer = require('multer');
const { uploadData } = require('../controllers/uploadController');
const router = express.Router();

// Store file in memory so we can parse it immediately
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Expecting a form-data field named 'file'
router.post('/', upload.single('file'), uploadData);

module.exports = router;
