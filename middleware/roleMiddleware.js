const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied, admin only" });
  }
  next();
};

const requireSystemRole = (...roles) => (req, res, next) => {
  const allowed = roles.flat();
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

const requireFeatures = (...features) => (req, res, next) => {
  const required = features.flat();
  // Admin bypass
  if (req.user?.role === 'admin') return next();
  const assigned = Array.isArray(req.user?.feature_roles) ? req.user.feature_roles : [];
  const hasAll = required.every(f => assigned.includes(f));
  if (!hasAll) {
    return res.status(403).json({ message: "Access denied: missing feature access" });
  }
  next();
};

module.exports = { adminOnly, requireSystemRole, requireFeatures };
