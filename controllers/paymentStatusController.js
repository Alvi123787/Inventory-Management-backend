const PaymentStatusModel = require('../models/paymentStatusModel');

const paymentStatusController = {
  getAll: async (req, res) => {
    try {
      const rows = await PaymentStatusModel.getAll();
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error fetching payment statuses', error: err.message });
    }
  },
  add: async (req, res) => {
    try {
      const name = req.body?.name;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }
      const created = await PaymentStatusModel.add(name);
      res.status(201).json({ success: true, message: 'Payment status created', data: created });
    } catch (err) {
      const code = (err.message || '').includes('Duplicate') ? 409 : 500;
      res.status(code).json({ success: false, message: 'Error creating payment status', error: err.message });
    }
  }
};

module.exports = paymentStatusController;