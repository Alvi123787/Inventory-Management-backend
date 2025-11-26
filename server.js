const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");

// ====== Database ======
const { testConnection } = require("./config/db");
const Product = require("./models/productModel");
const User = require("./models/User");
const Order = require("./models/orderModel");
const Settings = require("./models/settingsModel");
const Expense = require("./models/expenseModel");
// Add dropdown models
const Statuses = require("./models/statusModel");
const PaymentStatuses = require("./models/paymentStatusModel");
const Couriers = require("./models/courierModel");
const Channels = require("./models/channelModel");



// ====== Routes ======
const authRoutes = require("./routes/authRoutes");
const orderRoutes = require("./routes/orderRoutes");
const productRoutes = require("./routes/productRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const { initSSE } = require("./utils/sse"); // ADD
const expenseRoutes = require("./routes/expenseRoutes")
// Add dropdown routes
const statusRoutes = require("./routes/statusRoutes");
const paymentStatusRoutes = require("./routes/paymentStatusRoutes");
const courierRoutes = require("./routes/courierRoutes");
const channelRoutes = require("./routes/channelRoutes");

// ====== Express App Setup ======
const app = express();
const PORT = process.env.PORT || 3001;

// ====== CORS ======
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] }));

// ====== Body Parsers ======
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ====== API Routes ======
app.use("/api/orders", orderRoutes);
app.use("/api/products", productRoutes);
app.use("/api/auth", authRoutes);
// Removed integrations and webhooks routes
app.use("/api/settings", settingsRoutes);
app.use("/api/expenses", expenseRoutes);
// Mount dropdown routes
app.use("/api/statuses", statusRoutes);
app.use("/api/payment-statuses", paymentStatusRoutes);
app.use("/api/couriers", courierRoutes);
app.use("/api/channels", channelRoutes);

// Initialize SSE endpoint
initSSE(app); // ADD

// ====== Reset Password Redirect ======
app.get("/reset-password/:token", (req, res) => {
  const { token } = req.params;
  const client = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(`${client}/reset-password/${token}`);
});

app.get("/api/auth/reset-password/:token", (req, res) => {
  const { token } = req.params;
  const client = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(`${client}/reset-password/${token}`);
});

// ====== Health Check ======
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// ====== Root Endpoint ======
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Order Management API running successfully",
    endpoints: {
      orders: "/api/orders",
      products: "/api/products",
      auth: "/api/auth",
      health: "/health",
    },
  });
});

// ====== Error Handling ======
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// ====== 404 Handler ======
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ====== Initialize & Start Server ======
const initializeApp = async () => {
  try {
    await testConnection();
    await User.createTable();
    await User.createResetColumns();
    await Product.createTable();
    await Order.createTable();
    await Settings.createTable();
    await Expense.createTable();
    // Initialize dropdown tables
    await Statuses.createTable();
    await PaymentStatuses.createTable();
    await Couriers.createTable();
    await Channels.createTable();

    try {
      const existingAdmin = await User.findByEmail("rebalalvi123@gmail.com");
      if (!existingAdmin) {
        const hashed = await bcrypt.hash("Alvi@123", 10);
        await User.addUser("Rebal Alvi", "rebalalvi123@gmail.com", hashed, "admin", null, null);
        console.log("Hardcoded admin ensured");
      }
    } catch (e) {}

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`➡️  http://localhost:${PORT}`);
      console.log(`🛒 Products:     http://localhost:${PORT}/api/products`);
      console.log(`📦 Orders:       http://localhost:${PORT}/api/orders`);
      console.log(`🔑 Auth:         http://localhost:${PORT}/api/auth`);
      console.log(`⚙️  Settings:     http://localhost:${PORT}/api/settings`);
      console.log(`🏷️ Statuses:     http://localhost:${PORT}/api/statuses`);
      console.log(`💳 PaymentStat:  http://localhost:${PORT}/api/payment-statuses`);
      console.log(`🚚 Couriers:     http://localhost:${PORT}/api/couriers`);
      console.log(`📣 Channels:     http://localhost:${PORT}/api/channels`);
    });
  } catch (error) {
    console.error("❌ Failed to initialize application:", error.message);
    process.exit(1);
  }
};

initializeApp();
