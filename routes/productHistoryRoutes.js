const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getHistory, exportHistory, deleteHistoryById, deleteAllHistory } = require('../controllers/productHistoryController');

router.use(protect);

router.get('/', getHistory);
router.get('/export', exportHistory);
router.delete('/:id', deleteHistoryById);
router.delete('/', deleteAllHistory);

module.exports = router;
