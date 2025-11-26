const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect } = require('../middleware/authMiddleware');

// Get current user's settings
router.get('/', protect, getSettings);

// Update current user's settings
router.put('/', protect, updateSettings);

module.exports = router;