const ChannelModel = require('../models/channelModel');

const channelController = {
  getAll: async (req, res) => {
    try {
      const rows = await ChannelModel.getAll();
      res.json({ success: true, data: rows, count: rows.length });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error fetching channels', error: err.message });
    }
  },
  add: async (req, res) => {
    try {
      const name = req.body?.name;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }
      const created = await ChannelModel.add(name);
      res.status(201).json({ success: true, message: 'Channel created', data: created });
    } catch (err) {
      const code = (err.message || '').includes('Duplicate') ? 409 : 500;
      res.status(code).json({ success: false, message: 'Error creating channel', error: err.message });
    }
  }
};

module.exports = channelController;