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

// ====== CORS (robust, flexible origins + preflight handling) ======
// Allowed origins are taken from `ALLOWED_ORIGINS` env (comma-separated)
// We also include `FRONTEND_URL`/`CLIENT_URL` and default to localhost for dev.
const allowedOrigins = [
  'https://inventorymanagement07.netlify.app'
];

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (server-to-server, curl, native apps)
    if (!origin) return callback(null, true);

    // Exact allowlist match
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Allow localhost variants on any port during development
    try {
      const parsed = new URL(origin);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return callback(null, true);
      }
    } catch (e) {
      // ignore parse errors
    }

    // Not allowed
    console.warn(`CORS: blocked origin ${origin}. Allowed: ${allowedOrigins.join(',')}`);
    return callback(null, false);
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: false,
  optionsSuccessStatus: 204,
  preflightContinue: false,
};

// Use the cors middleware with our options
app.use(cors(corsOptions));

// Explicit header fallback & fast OPTIONS response (helps with some proxies)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    // If origin is allowed by our logic, echo it; otherwise skip CORS headers
    const isAllowed = allowedOrigins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      // No credentials needed (token-based auth)
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Ensure explicit OPTIONS handling for all routes (serverless safety)
app.options('*', cors(corsOptions));
app.options('/events', cors(corsOptions));

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

// ====== Initialize (no listening for serverless)
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

    // No app.listen here for Vercel/serverless
  } catch (error) {
    console.error("❌ Failed to initialize application:", error.message);
    // Do not exit in serverless
  }
};

initializeApp();

module.exports = app;
