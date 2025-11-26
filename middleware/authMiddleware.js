const jwt = require("jsonwebtoken");
const { promisePool } = require("../config/db");

const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ message: "Unauthorized, token missing" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    const [rows] = await promisePool.query("SELECT * FROM users WHERE id = ?", [decoded.id]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: "Invalid token" });
    const [uroles] = await promisePool.query("SELECT feature FROM user_roles WHERE user_id = ?", [user.id]);
    const features = Array.isArray(uroles) ? uroles.map(r => r.feature) : [];
    req.user = { ...user, feature_roles: features };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = { protect };
