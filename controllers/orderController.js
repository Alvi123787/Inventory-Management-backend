const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const Settings = require('../models/settingsModel');
const { broadcast } = require('../utils/sse'); // ADD

// Generate order ID
const generateOrderId = () => {
    return 'ORD-' + Math.floor(Math.random() * 10000);
};

// Determine if a status should allocate stock ("confirmed-like")
const isConfirmedStatus = (status) => {
    const s = (status || '').toLowerCase();
    return [
      'confirmed',
      'dispatch',
      'delivered',
      'in transit',
      'out for delivery'
    ].includes(s);
};

// Determine if a status should restore stock
const isCancelledStatus = (status) => (status || '').toLowerCase() === 'cancelled';
const isReturnedStatus = (status) => (status || '').toLowerCase() === 'returned';

// Helper to format orders for frontend compatibility
const formatOrderForFrontend = (order) => {
    let product_title = '';
    try {
        const items = typeof order.products === 'string' ? JSON.parse(order.products || '[]') : (order.products || []);
        if (Array.isArray(items) && items.length > 0) {
            product_title = items.map(it => `${it.name || it.external_name || 'Item'} x${Number(it.quantity || 1)}`).join('; ');
        }
    } catch (e) {
        product_title = '';
    }

    // Compute price fallback from items
    let price = order.total_price;
    if (price == null) {
      try {
        const items = typeof order.products === 'string' ? JSON.parse(order.products || '[]') : (order.products || []);
        if (Array.isArray(items) && items.length > 0) {
          price = items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 1), 0);
        }
      } catch {}
    }

    return {
        ...order,
        product_title,
        price,
        date: null
    };
};

// Get all orders for the authenticated user
const getAllOrders = async (req, res) => {
    try {
        const accountId = req.user.role === 'admin' ? null : req.user.account_id;
        const orders = await Order.findAll(accountId);
        const formatted = Array.isArray(orders) ? orders.map(formatOrderForFrontend) : [];
        res.json({
            success: true,
            data: formatted,
            count: formatted.length
        });
    } catch (error) {
        console.error('Error in getAllOrders:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
};

// Get single order by ID for the authenticated user
const getOrderById = async (req, res) => {
    try {
        const accountId = req.user.role === 'admin' ? null : req.user.account_id;
        const order = await Order.findById(req.params.id, accountId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.json({
            success: true,
            data: formatOrderForFrontend(order)
        });
    } catch (error) {
        console.error('Error in getOrderById:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order',
            error: error.message
        });
    }
};

// Create new order for the authenticated user
const createOrder = async (req, res) => {
    try {
        // Map frontend payload to model schema
        const incomingItems = Array.isArray(req.body.orderItems)
            ? req.body.orderItems.map((it) => ({
                name: it.name || it.productName || 'Item',
                quantity: Number(it.quantity || 1),
                price: Number(it.price || 0),
                product_id: it.product_id ?? it.productId ?? null
              }))
            : null;

        const subtotalProvided = req.body.subtotal ?? req.body.subtotal_price;
        const discountProvided = req.body.discountAmount ?? req.body.discount_amount;
        const taxProvided = req.body.taxAmount ?? req.body.tax_amount;
        const taxIncludedProvided = req.body.tax_included;
        const taxRateOverridePct = req.body.tax_rate ?? req.body.taxRate; // optional per-order tax rate (%)

        // Derive defaults from user settings if not provided
        let computedSubtotal = null;
        let computedDiscount = null;
        let computedTax = null;
        let computedTotal = null;
        let computedTaxIncluded = null;

        try {
          const settings = await Settings.getByUser(req.user.id);
          const taxRatePctDefault = Number(settings?.default_tax_rate || 0);
          const discountRatePctDefault = Number(settings?.default_discount_rate || 0);
          const taxInclusiveDefault = settings?.tax_inclusive ? 1 : 0;

          const itemsArr = Array.isArray(incomingItems) ? incomingItems : [];

          // Resolve tax rate (% -> fraction). Per-order override takes precedence over settings.
          const taxRatePct = taxRateOverridePct != null ? Number(taxRateOverridePct) : taxRatePctDefault;
          const taxRate = taxRatePct > 0 ? (taxRatePct / 100) : 0;
          const discountRateDefault = discountRatePctDefault > 0 ? (discountRatePctDefault / 100) : 0;

          // Fetch product-specific discount rates when product_id is present
          const productIds = [...new Set(itemsArr.map(it => Number(it.product_id)).filter(pid => Number.isFinite(pid) && pid > 0))];
          const productsById = new Map();
          for (const pid of productIds) {
            try {
              const accountIdLookup = req.user.role === 'admin' ? null : req.user.account_id;
              const p = await Product.getById(pid, accountIdLookup);
              if (p) productsById.set(Number(p.id), p);
            } catch {}
          }

          // Base sum from item unit prices
          const baseSum = itemsArr.reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);

          // Determine whether prices are tax-inclusive: per-request override or user default
          const taxInclusive = taxIncludedProvided != null ? (taxIncludedProvided ? 1 : 0) : taxInclusiveDefault;

          // Net sum excl. tax when tax-inclusive
          const netSum = taxRate > 0 && taxInclusive ? (baseSum / (1 + taxRate)) : baseSum;
          const subtotalCalc = netSum;

          // Compute discounts: product-specific overrides take precedence over default rate
          const productDiscountSum = itemsArr.reduce((sum, it) => {
            const qty = Number(it.quantity || 1);
            const unitPrice = Number(it.price || 0);
            const netUnit = taxRate > 0 && taxInclusive ? (unitPrice / (1 + taxRate)) : unitPrice;
            const pid = Number(it.product_id);
            const prod = Number.isFinite(pid) ? productsById.get(pid) : null;
            const prodRate = prod ? Number(prod.discount_rate || 0) : 0;
            const rate = prodRate > 0 ? (prodRate / 100) : 0;
            return sum + (netUnit * qty * rate);
          }, 0);

          // Apply default discount rate only to items with no product-specific rate
          const defaultEligibleSum = itemsArr.reduce((sum, it) => {
            const qty = Number(it.quantity || 1);
            const unitPrice = Number(it.price || 0);
            const netUnit = taxRate > 0 && taxInclusive ? (unitPrice / (1 + taxRate)) : unitPrice;
            const pid = Number(it.product_id);
            const prod = Number.isFinite(pid) ? productsById.get(pid) : null;
            const prodRate = prod ? Number(prod.discount_rate || 0) : 0;
            return prodRate > 0 ? sum : (sum + netUnit * qty);
          }, 0);
          const defaultDiscountSum = defaultEligibleSum * discountRateDefault;

          const discountCalcAuto = Number((productDiscountSum + defaultDiscountSum).toFixed(2));
          const discountCalc = discountProvided != null ? Number(discountProvided) : discountCalcAuto;

          const taxableBase = subtotalCalc - discountCalc;
          const taxCalcAuto = Number((taxableBase * taxRate).toFixed(2));
          const taxCalc = taxProvided != null ? Number(taxProvided) : taxCalcAuto;
          const totalCalc = Number((taxableBase + taxCalc).toFixed(2));

          computedSubtotal = subtotalProvided != null ? Number(subtotalProvided) : Number(subtotalCalc.toFixed(2));
          computedDiscount = discountCalc;
          computedTax = taxCalc;
          computedTotal = totalCalc;
          computedTaxIncluded = taxInclusive;
        } catch (e) {
          // If settings fetch fails, fall back to existing item-based total only
        }

        const mapped = {
            order_id: (req.body.orderId || req.body.order_id || generateOrderId()),
            customer_name: req.body.customerName || req.body.customer_name || '',
            phone: req.body.phone || '',
            address: req.body.address || '',
            products: incomingItems || [{ name: req.body.productTitle || 'Custom Order', quantity: 1, price: Number(req.body.price || 0) }],
            subtotal: computedSubtotal,
            discount_amount: computedDiscount ?? 0,
            tax_amount: computedTax ?? 0,
            tax_included: computedTaxIncluded ?? 0,
            total_price: (() => {
              const providedTotal = req.body.total_price ?? req.body.price;
              if (providedTotal != null && providedTotal !== '') return Number(providedTotal);
              if (computedSubtotal != null) {
                const s = Number(computedSubtotal);
                const d = Number(computedDiscount || 0);
                const t = Number(computedTax || 0);
                return Number((s - d + t).toFixed(2));
              }
              const computedFromItems = (incomingItems || []).reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
              return Number(computedFromItems);
            })(),
            status: req.body.status || 'Pending',
            payment_status: req.body.paymentStatus || req.body.payment_status || 'Unpaid',
            payment_method: req.body.paymentMethod || req.body.payment_method || 'Cash',
            courier: req.body.courier || null,
            tracking_id: req.body.trackingId || req.body.tracking_id || null,
            channel: req.body.channel || 'Manual',
            partial_paid_amount: ((ps) => {
              const s = String(ps || '').toLowerCase();
              return s === 'partial paid' ? Number(req.body.partialPaidAmount ?? req.body.partial_paid_amount ?? 0) : null;
            })(req.body.paymentStatus || req.body.payment_status)
        };

        // If the order is being created as confirmed-like, ensure stock is available first
        const confirmingOnCreate = isConfirmedStatus(mapped.status || '');
        const accountId = req.user.role === 'admin' ? null : req.user.account_id;
        if (confirmingOnCreate) {
          try {
            const items = Array.isArray(incomingItems) ? incomingItems : [];
            const needMap = new Map();
            for (const it of items) {
              const pid = Number(it.product_id);
              const qty = Number(it.quantity || 0);
              if (!Number.isNaN(pid) && pid > 0 && qty > 0) {
                needMap.set(pid, (needMap.get(pid) || 0) + qty);
              }
            }

            // Validate availability before creating order
            for (const [pid, needQty] of needMap.entries()) {
              const prod = await Product.getById(pid, accountId);
              const available = Number(prod?.stock || 0);
              if (!prod || available < needQty) {
                const name = prod?.name || `ID ${pid}`;
                return res.status(400).json({
                  success: false,
                  message: `Insufficient stock for product ${name}`
                });
              }
            }
          } catch (chkErr) {
            return res.status(500).json({ success: false, message: 'Stock validation failed', error: chkErr.message });
          }
        }

        const newOrder = await Order.create(mapped, req.user.id, accountId);

        // On creation, if confirmed, decrease stock for each product
        try {
          if (confirmingOnCreate) {
            const items = Array.isArray(incomingItems) ? incomingItems : [];
            for (const it of items) {
              const pid = Number(it.product_id);
              const qty = Number(it.quantity || 1);
              if (!Number.isNaN(pid) && pid > 0 && !Number.isNaN(qty) && qty > 0) {
                await Product.adjustStock(pid, -qty, accountId);
              }
            }
          }
        } catch (invErr) {
          console.error('Inventory adjust error (create):', invErr.message);
        }

        const formatted = formatOrderForFrontend(newOrder);
        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: formatted
        });
        // Notify clients to refresh orders/products
        broadcast('orders.changed', { id: newOrder.id });
        broadcast('products.changed', {});
    } catch (error) {
        console.error('Error in createOrder:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: error.message
        });
    }
};

// Update order for the authenticated user
const updateOrder = async (req, res) => {
    try {
        // Map frontend payload to model schema
        const incomingItems = Array.isArray(req.body.orderItems)
            ? req.body.orderItems.map((it) => ({
                name: it.name || it.productName || 'Item',
                quantity: Number(it.quantity || 1),
                price: Number(it.price || 0),
                product_id: it.product_id ?? it.productId ?? null
              }))
            : null;

        // Fetch existing order to preserve products when not provided and for inventory diff
        const accountIdUpd = req.user.role === 'admin' ? null : req.user.account_id;
        const existingOrder = await Order.findById(req.params.id, accountIdUpd);
        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                message: 'Order not found or access denied'
            });
        }
        const prevItemsRaw = typeof existingOrder.products === 'string' ? JSON.parse(existingOrder.products || '[]') : (existingOrder.products || []);

        const subtotal = req.body.subtotal ?? req.body.subtotal_price;
        const discountAmount = req.body.discountAmount ?? req.body.discount_amount;
        const taxAmount = req.body.taxAmount ?? req.body.tax_amount;
        const taxIncluded = req.body.tax_included;

        const mapped = {
            order_id: req.body.orderId || req.body.order_id || existingOrder.order_id,
            customer_name: req.body.customerName || req.body.customer_name || existingOrder.customer_name || '',
            phone: req.body.phone || existingOrder.phone || '',
            address: req.body.address || existingOrder.address || '',
            products: incomingItems ?? prevItemsRaw,
            subtotal: subtotal != null ? Number(subtotal) : (existingOrder.subtotal ?? null),
            discount_amount: discountAmount != null ? Number(discountAmount) : (existingOrder.discount_amount ?? 0),
            tax_amount: taxAmount != null ? Number(taxAmount) : (existingOrder.tax_amount ?? 0),
            tax_included: taxIncluded != null ? (taxIncluded ? 1 : 0) : (existingOrder.tax_included ? 1 : 0),
            total_price: (() => {
              const providedTotal = req.body.total_price ?? req.body.price;
              if (providedTotal != null && providedTotal !== '') return Number(providedTotal);
              const s = subtotal != null ? Number(subtotal) : (existingOrder.subtotal != null ? Number(existingOrder.subtotal) : null);
              const d = discountAmount != null ? Number(discountAmount) : Number(existingOrder.discount_amount || 0);
              const t = taxAmount != null ? Number(taxAmount) : Number(existingOrder.tax_amount || 0);
              if (s != null) return Number((s - d + t).toFixed(2));
              const itemsArr = Array.isArray(incomingItems) ? incomingItems : prevItemsRaw;
              return Number(((itemsArr || []).reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0)).toFixed(2));
            })(),
            status: req.body.status || existingOrder.status || 'Pending',
            payment_status: req.body.paymentStatus || req.body.payment_status || existingOrder.payment_status || 'Unpaid',
            payment_method: req.body.paymentMethod || req.body.payment_method || existingOrder.payment_method || 'Cash',
            courier: req.body.courier ?? existingOrder.courier ?? null,
            tracking_id: (req.body.trackingId ?? req.body.tracking_id) ?? existingOrder.tracking_id ?? null,
            channel: req.body.channel || existingOrder.channel || 'Manual',
            partial_paid_amount: ((ps) => {
              const s = String(ps || '').toLowerCase();
              return s === 'partial paid' ? Number(req.body.partialPaidAmount ?? req.body.partial_paid_amount ?? existingOrder.partial_paid_amount ?? 0) : null;
            })(req.body.paymentStatus || req.body.payment_status || existingOrder.payment_status)
        };

        // Compute inventory adjustments based on status transitions
        try {
          const prevItems = Array.isArray(prevItemsRaw) ? prevItemsRaw : [];
          const newItems = Array.isArray(incomingItems) ? incomingItems : prevItems;

          const prevStatus = (existingOrder.status || '').toLowerCase();
          const newStatus = (mapped.status || '').toLowerCase();
          const prevConfirmed = isConfirmedStatus(prevStatus);
          const newConfirmed = isConfirmedStatus(newStatus);
          const newIsCancelled = isCancelledStatus(newStatus);
          const newIsReturned = isReturnedStatus(newStatus);

          // Build quantity maps per product
          const toMap = (items) => {
            const m = new Map();
            for (const it of Array.isArray(items) ? items : []) {
              const pid = Number(it.product_id);
              const qty = Number(it.quantity || 0);
              if (!Number.isNaN(pid) && pid > 0 && qty > 0) {
                m.set(pid, (m.get(pid) || 0) + qty);
              }
            }
            return m;
          };

          const prevMap = toMap(prevItems);
          const newMap = toMap(newItems);

          if (!prevConfirmed && newConfirmed) {
            // Validate availability before confirming
            for (const [pid, needQty] of newMap.entries()) {
              const prod = await Product.getById(pid, accountIdUpd);
              const available = Number(prod?.stock || 0);
              if (!prod || available < needQty) {
                const name = prod?.name || `ID ${pid}`;
                return res.status(400).json({
                  success: false,
                  message: `Insufficient stock for product ${name}`
                });
              }
            }
            // Transition to confirmed: allocate stock for all new items
            for (const [pid, qty] of newMap.entries()) {
              await Product.adjustStock(pid, -qty, accountIdUpd);
            }
          } else if (prevConfirmed && newConfirmed) {
            const restoredOnEdit = !!req.body.restoredOnEdit;
            if (restoredOnEdit) {
              // Edit started with stock restored; allocate absolute new quantities
              const allPids = new Set([...prevMap.keys(), ...newMap.keys()]);
              for (const pid of allPids) {
                const newQty = newMap.get(pid) || 0;
                if (newQty > 0) {
                  const prod = await Product.getById(pid, accountIdUpd);
                  const available = Number(prod?.stock || 0);
                  if (!prod || available < newQty) {
                    const name = prod?.name || `ID ${pid}`;
                    return res.status(400).json({
                      success: false,
                      message: `Insufficient stock for product ${name}`
                    });
                  }
                }
              }
              for (const pid of allPids) {
                const newQty = newMap.get(pid) || 0;
                if (newQty > 0) {
                  await Product.adjustStock(pid, -newQty, accountIdUpd);
                }
              }
            } else {
              // Still confirmed: adjust for item quantity changes (delta)
              const allPids = new Set([...prevMap.keys(), ...newMap.keys()]);
              for (const pid of allPids) {
                const oldQty = prevMap.get(pid) || 0;
                const newQty = newMap.get(pid) || 0;
                const delta = newQty - oldQty; // positive means allocate more
                if (delta > 0) {
                  const prod = await Product.getById(pid, accountIdUpd);
                  const available = Number(prod?.stock || 0);
                  if (!prod || available < delta) {
                    const name = prod?.name || `ID ${pid}`;
                    return res.status(400).json({
                      success: false,
                      message: `Insufficient stock for product ${name}`
                    });
                  }
                }
              }
              for (const pid of allPids) {
                const oldQty = prevMap.get(pid) || 0;
                const newQty = newMap.get(pid) || 0;
                const delta = newQty - oldQty;
                if (delta !== 0) {
                  await Product.adjustStock(pid, -delta, accountIdUpd);
                }
              }
            }
          } else if (prevConfirmed && (newIsCancelled || newIsReturned)) {
            // Confirmed -> Cancelled or Returned: restore stock only if not already restored at edit-start
            if (!req.body.restoredOnEdit) {
              for (const [pid, qty] of prevMap.entries()) {
                await Product.adjustStock(pid, qty, accountIdUpd);
              }
            }
          } else {
            // Other transitions: no stock change
          }
        } catch (invErr) {
          console.error('Inventory adjust error (update with status):', invErr.message);
        }

        const updatedOrder = await Order.update(req.params.id, mapped, accountIdUpd);
        
        res.json({
            success: true,
            message: 'Order updated successfully',
            data: formatOrderForFrontend(updatedOrder)
        });
        // Notify clients on update
        broadcast('orders.changed', { id: updatedOrder.id });
        broadcast('products.changed', {});
    } catch (error) {
        console.error('Error in updateOrder:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to update order',
            error: error.message
        });
    }
};

// Delete order for the authenticated user
const deleteOrder = async (req, res) => {
    try {
        // Fetch order first to possibly restore inventory
        const accountIdDel = req.user.role === 'admin' ? null : req.user.account_id;
        const order = await Order.findById(req.params.id, accountIdDel);
        if (!order) {
          return res.status(404).json({
            success: false,
            message: 'Order not found or access denied'
          });
        }

        try {
          const wasConfirmed = isConfirmedStatus(order.status || '');
          if (wasConfirmed) {
            const items = typeof order.products === 'string' ? JSON.parse(order.products || '[]') : (order.products || []);
            for (const it of Array.isArray(items) ? items : []) {
              const pid = Number(it.product_id);
              const qty = Number(it.quantity || 0);
              if (!Number.isNaN(pid) && pid > 0 && qty > 0) {
                await Product.adjustStock(pid, qty, accountIdDel);
              }
            }
          }
        } catch (invErr) {
          console.error('Inventory adjust error (delete):', invErr.message);
        }
        
        const deleted = await Order.delete(req.params.id, accountIdDel);
        
        if (deleted) {
            res.json({
                success: true,
                message: 'Order deleted successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Order not found or access denied'
            });
        }
    } catch (error) {
        console.error('Error in deleteOrder:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to delete order',
            error: error.message
        });
    }
};

// Start edit: restore stock previously allocated for confirmed orders
const startEditOrder = async (req, res) => {
    try {
        const accountIdEdit = req.user.role === 'admin' ? null : req.user.account_id;
        const order = await Order.findById(req.params.id, accountIdEdit);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found or access denied' });
        }

        const prevStatus = (order.status || '').toLowerCase();
        const prevConfirmed = isConfirmedStatus(prevStatus);

        try {
            if (prevConfirmed) {
                const items = typeof order.products === 'string' ? JSON.parse(order.products || '[]') : (order.products || []);
                for (const it of Array.isArray(items) ? items : []) {
                    const pid = Number(it.product_id);
                    const qty = Number(it.quantity || 0);
                    if (!Number.isNaN(pid) && pid > 0 && qty > 0) {
                        await Product.adjustStock(pid, qty, accountIdEdit);
                    }
                }
            }
        } catch (invErr) {
            console.error('Inventory adjust error (edit-start):', invErr.message);
        }

        res.json({ success: true, message: 'Stock restored for editing', data: formatOrderForFrontend(order) });
        broadcast('products.changed', {});
    } catch (error) {
        console.error('Error in startEditOrder:', error.message);
        res.status(500).json({ success: false, message: 'Failed to prepare order for edit', error: error.message });
    }
};

module.exports = {
    getAllOrders,
    getOrderById,
    createOrder,
    updateOrder,
    deleteOrder,
    startEditOrder
};
