const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, account_id: user.account_id || null, feature_roles: user.feature_roles || [] },
    process.env.JWT_SECRET || "secretkey",
    { expiresIn: "7d" }
  );
};

module.exports = generateToken;
