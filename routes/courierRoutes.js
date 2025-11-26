const express = require('express');
const router = express.Router();
const { getAll, add } = require('../controllers/courierController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// GET /api/couriers
router.get('/', getAll);

// POST /api/couriers
router.post('/', add);

module.exports = router;