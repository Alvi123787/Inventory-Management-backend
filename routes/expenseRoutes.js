// routes/expenseRoutes.js
const express = require("express");
const router = express.Router();
const { getExpenses, addExpense, deleteExpense, updateExpense } = require("../controllers/expenseController");
const { protect } = require("../middleware/authMiddleware");
const { requireFeatures } = require("../middleware/roleMiddleware");

router.get("/", protect, requireFeatures('expenses'), getExpenses);
router.post("/", protect, requireFeatures('expenses'), addExpense);
router.delete("/:id", protect, requireFeatures('expenses'), deleteExpense);
router.put("/:id", protect, requireFeatures('expenses'), updateExpense);

module.exports = router;
