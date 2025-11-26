const express = require('express');
const router = express.Router();
const { getAll, add } = require('../controllers/channelController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// GET /api/channels
router.get('/', getAll);

// POST /api/channels
router.post('/', add);

module.exports = router;