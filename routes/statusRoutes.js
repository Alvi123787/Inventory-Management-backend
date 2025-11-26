const express = require('express');
const router = express.Router();
const { getAll, add } = require('../controllers/statusController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// GET /api/statuses
router.get('/', getAll);

// POST /api/statuses
router.post('/', add);

module.exports = router;