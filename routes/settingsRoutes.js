const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect } = require('../middleware/authMiddleware');
const { requireFeatures } = require('../middleware/roleMiddleware');

// Get current user's settings
router.get('/', protect, requireFeatures('settings'), getSettings);

// Update current user's settings
router.put('/', protect, requireFeatures('settings'), updateSettings);

module.exports = router;
