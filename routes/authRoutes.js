const express = require("express");
const { registerUser, loginUser, getAllUsers, deleteUser, forgotPassword, resetPassword, devSeedUser, createSubAdmin, listSubAdmins, createUserBySubAdmin, listUsersForSubAdmin, deleteUserBySubAdmin } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly, requireSystemRole } = require("../middleware/roleMiddleware");

const router = express.Router();

// Only admin can register users
router.post("/register", protect, adminOnly, registerUser);

// Users can login
router.post("/login", loginUser);

// NEW: Admin can get all users
router.get("/users", protect, adminOnly, getAllUsers);

// NEW: Admin can delete users
router.delete("/users/:id", protect, adminOnly, deleteUser);

// NEW: Forgot & Reset Password (public)
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// NEW: Dev seed user endpoint (development only)
if (process.env.NODE_ENV === "development") {
  router.post("/dev/seed-user", devSeedUser);
}

// RBAC: Admin manages Sub-Admins
router.post("/subadmins", protect, adminOnly, createSubAdmin);
router.get("/subadmins", protect, adminOnly, listSubAdmins);

// RBAC: Sub-Admin manages Users in account (max 4)
router.post("/account/users", protect, requireSystemRole('sub_admin'), createUserBySubAdmin);
router.get("/account/users", protect, requireSystemRole('sub_admin'), listUsersForSubAdmin);
router.delete("/account/users/:id", protect, requireSystemRole('sub_admin'), deleteUserBySubAdmin);

module.exports = router;
