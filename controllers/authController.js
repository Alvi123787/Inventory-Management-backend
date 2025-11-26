const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findByEmail(email);
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    if (role === 'sub_admin') {
      const accountId = crypto.randomUUID();
      const result = await User.addUser(name, email, hashed, 'sub_admin', accountId, req.user?.id || null);
      return res.json({ success: true, message: "Sub-Admin created", userId: result.insertId, account_id: accountId });
    }
    const result = await User.addUser(name, email, hashed, role || "user", null, req.user?.id || null);
    res.json({ success: true, message: "User registered successfully", userId: result.insertId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findByEmail(email);

    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Invalid credentials" });

    const features = await User.getFeatureRoles(user.id);
    const token = generateToken({ ...user, feature_roles: features });
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        account_id: user.account_id || null,
        feature_roles: features
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// NEW: Get all users (Admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const [rows] = await require("../config/db").promisePool.query(
      "SELECT u.id, u.name, u.email, u.role, u.account_id, u.created_by, c.name AS created_by_name, c.role AS created_by_role, GROUP_CONCAT(ur.feature) AS feature_roles FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN users c ON c.id = u.created_by GROUP BY u.id ORDER BY u.id DESC"
    );
    const users = rows.map(r => ({
      ...r,
      feature_roles: r.feature_roles ? r.feature_roles.split(',') : []
    }));
    res.json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message
    });
  }
};

// NEW: Delete user (Admin only)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account"
      });
    }

    const deleted = await User.deleteUser(id);
    if (deleted) {
      res.json({ success: true, message: "User deleted successfully" });
    } else {
      res.status(404).json({ success: false, message: "User not found" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: error.message
    });
  }
};

// NEW: Forgot Password - generate token and send email
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const user = await User.findByEmail(email);
    // Respond with generic message to avoid email enumeration
    if (!user) {
      return res.json({ success: true, message: "If that email exists, a reset link has been sent" });
    }

    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await User.setResetToken(user.id, resetToken, expiry);

    const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";

    const resetLink = `${FRONTEND_URL}/reset-password/${resetToken}`;


    // Configure nodemailer transporter
    let transporter;
    let usingTestAccount = false;
    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      // Use Gmail service if credentials provided
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Development fallback: Ethereal test account
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      usingTestAccount = true;
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@example.com",
      to: user.email,
      subject: "Reset your password",
      html: `
        <p>Hello ${user.name || "user"},</p>
        <p>You requested a password reset. Click the link below to set a new password. This link will expire in 1 hour.</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    const previewUrl = usingTestAccount ? nodemailer.getTestMessageUrl(info) : undefined;

    res.json({ success: true, message: "Password reset link sent to your email", ...(previewUrl ? { previewUrl } : {}), ...(usingTestAccount ? { devToken: resetToken } : {}) });
  } catch (error) {
    console.error("Error in forgotPassword:", error);
    res.status(500).json({ success: false, message: "Failed to process password reset request" });
  }
};

// NEW: Reset Password - verify token, hash password, update, and invalidate token
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!token) return res.status(400).json({ success: false, message: "Token is required" });
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const user = await User.findByResetToken(token);
    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired token" });

    // Verify expiry
    const now = new Date();
    const expiry = user.reset_token_expiry ? new Date(user.reset_token_expiry) : null;
    if (!expiry || now > expiry) {
      return res.status(400).json({ success: false, message: "Invalid or expired token" });
    }

    // Hash new password and update
    const hashed = await bcrypt.hash(newPassword, 10);
    await User.updatePasswordById(user.id, hashed);

    // Invalidate the token
    await User.clearResetToken(user.id);

    res.json({ success: true, message: "Password has been reset successfully" });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    res.status(500).json({ success: false, message: "Failed to reset password" });
  }
};

// NEW: Dev-only seed user endpoint for e2e testing
exports.devSeedUser = async (req, res) => {
  try {
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({ success: false, message: "Not allowed in production" });
    }
    const shared = req.headers["x-shared-secret"];
    if (!shared || shared !== process.env.SHARED_SECRET) {
      return res.status(403).json({ success: false, message: "Invalid shared secret" });
    }

    const { name = "Test User", email = "test@example.com", password = "password123", role = "user" } = req.body || {};

    const existing = await User.findByEmail(email);
    if (existing) {
      return res.json({ success: true, message: "User already exists", userId: existing.id, email });
    }

    const hashed = await bcrypt.hash(password, 10);
    await User.addUser(name, email, hashed, role);

    return res.json({ success: true, message: "Seeded user", email });
  } catch (error) {
    console.error("Error in devSeedUser:", error);
    res.status(500).json({ success: false, message: "Failed to seed user" });
  }
};

// NEW: Admin creates Sub-Admin with unique account_id
exports.createSubAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findByEmail(email);
    if (existing) return res.status(400).json({ message: "User already exists" });
    const accountId = crypto.randomUUID();
    const hashed = await bcrypt.hash(password, 10);
    const result = await User.addUser(name, email, hashed, "sub_admin", accountId, req.user.id);
    res.json({ success: true, message: "Sub-Admin created", sub_admin_id: result.insertId, account_id: accountId });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// NEW: Admin lists Sub-Admins
exports.listSubAdmins = async (req, res) => {
  try {
    const [rows] = await require("../config/db").promisePool.query(
      "SELECT id, name, email, account_id FROM users WHERE role='sub_admin' ORDER BY id DESC"
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// NEW: Sub-Admin creates Users (max 4 per account), assign up to 2 feature roles
exports.createUserBySubAdmin = async (req, res) => {
  try {
  const { name, email, password, feature_roles = [] } = req.body;
  const existing = await User.findByEmail(email);
  if (existing) return res.status(400).json({ message: "User already exists" });
    let accountId = req.user.account_id;
    if (!accountId) {
      accountId = crypto.randomUUID();
      await require("../config/db").promisePool.query(
        "UPDATE users SET account_id = ? WHERE id = ?",
        [accountId, req.user.id]
      );
    }
    const [countRows] = await require("../config/db").promisePool.query(
      "SELECT COUNT(*) as cnt FROM users WHERE account_id = ? AND role = 'user'",
      [accountId]
    );
    const cnt = Number(countRows[0]?.cnt || 0);
    if (cnt >= 4) return res.status(400).json({ message: "User limit reached for this account" });
    if (!Array.isArray(feature_roles) || feature_roles.length < 1) {
      return res.status(400).json({ message: "At least 1 feature role required" });
    }
    const assign = Array.from(new Set(feature_roles)).slice(0, 2);
    const hashed = await bcrypt.hash(password, 10);
    const result = await User.addUser(name, email, hashed, "user", accountId, req.user.id);
    await User.setFeatureRoles(result.insertId, assign);
    res.json({ success: true, message: "User created", user_id: result.insertId, feature_roles: assign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// NEW: Sub-Admin list users in account
exports.listUsersForSubAdmin = async (req, res) => {
  try {
    const accountId = req.user.account_id;
    const [rows] = await require("../config/db").promisePool.query(
      "SELECT u.id, u.name, u.email, u.created_by, c.name AS created_by_name, GROUP_CONCAT(ur.feature) AS feature_roles FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN users c ON c.id = u.created_by WHERE u.account_id = ? AND u.role='user' GROUP BY u.id ORDER BY u.id DESC",
      [accountId]
    );
    const users = rows.map(r => ({
      ...r,
      feature_roles: r.feature_roles ? r.feature_roles.split(',') : []
    }));
    res.json({ success: true, data: users, count: users.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
