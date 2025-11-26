const Settings = require('../models/settingsModel');

// Require auth middleware pattern similar to other controllers (routes will protect)

const getSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await Settings.getByUser(userId);
    res.json({ success: true, data: settings || { tax_inclusive: 0, default_tax_rate: 0, default_discount_rate: 0 } });
  } catch (error) {
    console.error('Failed to get settings:', error);
    res.status(500).json({ success: false, message: 'Failed to get settings' });
  }
};

const updateSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { tax_inclusive, default_tax_rate, default_discount_rate } = req.body || {};
    const updated = await Settings.upsert(userId, { tax_inclusive, default_tax_rate, default_discount_rate });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

module.exports = { getSettings, updateSettings };