const express = require('express');
const router = express.Router();
const { getAll, add } = require('../controllers/paymentStatusController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// GET /api/payment-statuses
router.get('/', getAll);

// POST /api/payment-statuses
router.post('/', add);

module.exports = router;