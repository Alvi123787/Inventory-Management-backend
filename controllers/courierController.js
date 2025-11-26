const CourierModel = require('../models/courierModel');

const courierController = {
  getAll: async (req, res) => {
    try {
      const rows = await CourierModel.getAll();
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error fetching couriers', error: err.message });
    }
  },
  add: async (req, res) => {
    try {
      const name = req.body?.name;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }
      const created = await CourierModel.add(name);
      res.status(201).json({ success: true, message: 'Courier created', data: created });
    } catch (err) {
      const code = (err.message || '').includes('Duplicate') ? 409 : 500;
      res.status(code).json({ success: false, message: 'Error creating courier', error: err.message });
    }
  }
};

module.exports = courierController;