const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getHistory, exportHistory } = require('../controllers/productHistoryController');

router.use(protect);

router.get('/', getHistory);
router.get('/export', exportHistory);

module.exports = router;

