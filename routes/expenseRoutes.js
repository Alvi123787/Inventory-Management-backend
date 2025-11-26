// routes/expenseRoutes.js
const express = require("express");
const router = express.Router();
const { getExpenses, addExpense, deleteExpense, updateExpense } = require("../controllers/expenseController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getExpenses);
router.post("/", protect, addExpense);
router.delete("/:id", protect, deleteExpense);
router.put("/:id", protect, updateExpense);

module.exports = router;
