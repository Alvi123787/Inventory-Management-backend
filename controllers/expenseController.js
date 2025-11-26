// controllers/expenseController.js
const Expense = require("../models/expenseModel");

exports.getExpenses = async (req, res) => {
  try {
    const accountId = req.user.role === 'admin'
      ? null
      : (req.user.account_id || req.user.id);
    const expenses = await Expense.getAll(accountId);
    res.json(expenses);
  } catch (err) {
    console.error("Error fetching expenses:", err);
    res.status(500).json({ message: "Error fetching expenses" });
  }
};

exports.addExpense = async (req, res) => {
  try {
    const userId = req.user.id;
    const accountId = req.user.account_id || null;
    const { title, category, amount, notes } = req.body;

    if (!title || !amount)
      return res.status(400).json({ message: "Title and amount are required" });

    await Expense.add({ user_id: userId, account_id: accountId, title, category, amount, notes });
    try { const { broadcast } = require("../utils/sse"); broadcast("expenses.changed", { action: "add" }); } catch (e) {}
    res.json({ message: "Expense added successfully" });
  } catch (err) {
    console.error("Error adding expense:", err);
    res.status(500).json({ message: "Error adding expense" });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const accountId = req.user.role === 'admin'
      ? null
      : (req.user.account_id || req.user.id);
    const { id } = req.params;
    await Expense.delete(id, accountId);
    try { const { broadcast } = require("../utils/sse"); broadcast("expenses.changed", { action: "delete", id }); } catch (e) {}
    res.json({ message: "Expense deleted successfully" });
  } catch (err) {
    console.error("Error deleting expense:", err);
    res.status(500).json({ message: "Error deleting expense" });
  }
};

// NEW: Update expense
exports.updateExpense = async (req, res) => {
  try {
    const accountId = req.user.role === 'admin'
      ? null
      : (req.user.account_id || req.user.id);
    const { id } = req.params;
    const { title, category, amount, notes } = req.body;

    if (!title || amount === undefined || amount === null || `${amount}`.trim() === "") {
      return res.status(400).json({ message: "Title and amount are required" });
    }

    const updated = await Expense.update(id, { title, category, amount, notes }, accountId);
    if (!updated) {
      return res.status(404).json({ message: "Expense not found or access denied" });
    }
    try { const { broadcast } = require("../utils/sse"); broadcast("expenses.changed", { action: "update", id }); } catch (e) {}
    return res.json({ message: "Expense updated successfully", data: updated });
  } catch (err) {
    console.error("Error updating expense:", err);
    res.status(500).json({ message: "Error updating expense" });
  }
};
