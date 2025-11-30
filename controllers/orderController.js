const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const Settings = require('../models/settingsModel');
const { broadcast } = require('../utils/sse');

// Generate order ID
const generateOrderId = () => {
    const ts = Date.now();
    const rand = Math.floor(Math.random() * 1000000);
    return `ORD-${ts}-${rand}`;
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
        date: order.created_at
    };
};

const computePricing = async (items, userId, accountId, overrides) => {
    const arr = Array.isArray(items) ? items : [];
    const settings = await Settings.getByUser(userId);
    const taxRatePctDefault = Number(settings?.default_tax_rate || 0);
    const discountRatePctDefault = Number(settings?.default_discount_rate || 0);
    const taxInclusiveDefault = settings?.tax_inclusive ? 1 : 0;
    const taxRateOverridePct = overrides?.tax_rate;
    const taxIncludedProvided = overrides?.tax_included;
    const taxRatePct = taxRateOverridePct != null ? Number(taxRateOverridePct) : taxRatePctDefault;
    const taxRate = taxRatePct > 0 ? (taxRatePct / 100) : 0;
    const taxInclusive = taxIncludedProvided != null ? (taxIncludedProvided ? 1 : 0) : taxInclusiveDefault;
    const productIds = [...new Set(arr.map(it => Number(it.product_id)).filter(pid => Number.isFinite(pid) && pid > 0))];
    const productsById = new Map();
    for (const pid of productIds) {
        try {
            const p = await Product.getById(pid, accountId);
            if (p) productsById.set(Number(p.id), p);
        } catch {}
    }
    const baseSum = arr.reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
    const netSum = taxRate > 0 && taxInclusive ? (baseSum / (1 + taxRate)) : baseSum;
    const subtotalCalc = netSum;
    const productDiscountSum = arr.reduce((sum, it) => {
        const qty = Number(it.quantity || 1);
        const unitPrice = Number(it.price || 0);
        const netUnit = taxRate > 0 && taxInclusive ? (unitPrice / (1 + taxRate)) : unitPrice;
        const pid = Number(it.product_id);
        const prod = Number.isFinite(pid) ? productsById.get(pid) : null;
        const prodRate = prod ? Number(prod.discount_rate || 0) : 0;
        const rate = prodRate > 0 ? (prodRate / 100) : 0;
        return sum + (netUnit * qty * rate);
    }, 0);
    const defaultEligibleSum = arr.reduce((sum, it) => {
        const qty = Number(it.quantity || 1);
        const unitPrice = Number(it.price || 0);
        const netUnit = taxRate > 0 && taxInclusive ? (unitPrice / (1 + taxRate)) : unitPrice;
        const pid = Number(it.product_id);
        const prod = Number.isFinite(pid) ? productsById.get(pid) : null;
        const prodRate = prod ? Number(prod.discount_rate || 0) : 0;
        return prodRate > 0 ? sum : (sum + netUnit * qty);
    }, 0);
    const discountRateDefault = discountRatePctDefault > 0 ? (discountRatePctDefault / 100) : 0;
    const defaultDiscountSum = defaultEligibleSum * discountRateDefault;
    const discountCalc = Number((productDiscountSum + defaultDiscountSum).toFixed(2));
    const taxableBase = subtotalCalc - discountCalc;
    const taxCalc = Number((taxableBase * taxRate).toFixed(2));
    const totalCalc = Number((taxableBase + taxCalc).toFixed(2));
    return {
        subtotal: Number(subtotalCalc.toFixed(2)),
        discount_amount: discountCalc,
        tax_amount: taxCalc,
        total_price: totalCalc,
        tax_included: taxInclusive
    };
};

const refreshItemPrices = async (items, accountId) => {
    const arr = Array.isArray(items) ? items : [];
    for (const it of arr) {
        const pid = Number(it.product_id);
        if (!Number.isNaN(pid) && pid > 0) {
            try {
                const prod = await Product.getById(pid, accountId);
                if (prod) it.price = Number(prod.price || it.price || 0);
            } catch {}
        }
    }
    return arr;
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
        const accountId = req.user.role === 'admin' ? null : req.user.account_id;
        const incomingItems = Array.isArray(req.body.orderItems)
            ? req.body.orderItems.map((it) => ({
                name: it.name || it.productName || 'Item',
                quantity: Number(it.quantity || 1),
                price: Number(it.price || 0),
                product_id: it.product_id ?? it.productId ?? null
              }))
            : null;
        const hasItems = Array.isArray(incomingItems) && incomingItems.length > 0;
        const fallbackPrice = req.body.price;
        const fallbackTitle = req.body.productTitle;
        if (!hasItems && (fallbackPrice == null || fallbackPrice === '')) {
          return res.status(400).json({ success: false, message: 'orderItems or price is required' });
        }
        const refreshed = await refreshItemPrices(incomingItems, accountId);
        const pricing = await computePricing(refreshed, req.user.id, accountId, {
            tax_included: req.body.tax_included,
            tax_rate: req.body.tax_rate ?? req.body.taxRate
        });
        const mapped = {
            order_id: (req.body.orderId || req.body.order_id || generateOrderId()),
            customer_name: req.body.customerName || req.body.customer_name || '',
            phone: req.body.phone || '',
            address: req.body.address || '',
            products: refreshed || [{ name: req.body.productTitle || 'Custom Order', quantity: 1, price: Number(req.body.price || 0) }],
            subtotal: pricing.subtotal,
            discount_amount: pricing.discount_amount,
            tax_amount: pricing.tax_amount,
            tax_included: pricing.tax_included,
            total_price: pricing.total_price,
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

        // Validate availability for all items on create
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
          for (const [pid, needQty] of needMap.entries()) {
            const prod = await Product.getById(pid, accountId);
            const available = Number(prod?.stock || 0);
            if (!prod || available < needQty) {
              const name = prod?.name || `ID ${pid}`;
              return res.status(400).json({ success: false, message: `Insufficient stock for product ${name}` });
            }
          }
        } catch (chkErr) {
          return res.status(500).json({ success: false, message: 'Stock validation failed', error: chkErr.message });
        }

        const newOrder = await Order.create(mapped, req.user.id, accountId);

        // On creation, if confirmed, decrease stock for each product
        try {
          const items = Array.isArray(incomingItems) ? incomingItems : [];
          for (const it of items) {
            const pid = Number(it.product_id);
            const qty = Number(it.quantity || 1);
            if (!Number.isNaN(pid) && pid > 0 && !Number.isNaN(qty) && qty > 0) {
              await Product.adjustStock(pid, -qty, accountId);
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
        console.error('Error in createOrder:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: error?.message || 'Unknown error'
        });
    }
};

// Update order for the authenticated user
const updateOrder = async (req, res) => {
    try {
        const accountId = req.user.role === 'admin' ? null : req.user.account_id;
        const incomingItems = Array.isArray(req.body.orderItems)
            ? req.body.orderItems.map((it) => ({
                name: it.name || it.productName || 'Item',
                quantity: Number(it.quantity || 1),
                price: Number(it.price || 0),
                product_id: it.product_id ?? it.productId ?? null
              }))
            : null;

        // Fetch existing order to preserve products when not provided and for inventory diff
        const existingOrder = await Order.findById(req.params.id, accountId);
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

        const itemsForPricing = await refreshItemPrices(incomingItems ?? prevItemsRaw, accountId);
        const pricing = await computePricing(itemsForPricing, req.user.id, accountId, {
            tax_included: taxIncluded != null ? taxIncluded : (existingOrder.tax_included ? 1 : 0),
            tax_rate: req.body.tax_rate ?? req.body.taxRate
        });

        const mapped = {
            order_id: req.body.orderId || req.body.order_id || existingOrder.order_id,
            customer_name: req.body.customerName || req.body.customer_name || existingOrder.customer_name || '',
            phone: req.body.phone || existingOrder.phone || '',
            address: req.body.address || existingOrder.address || '',
            products: itemsForPricing,
            subtotal: subtotal != null ? Number(subtotal) : pricing.subtotal,
            discount_amount: discountAmount != null ? Number(discountAmount) : pricing.discount_amount,
            tax_amount: taxAmount != null ? Number(taxAmount) : pricing.tax_amount,
            tax_included: taxIncluded != null ? (taxIncluded ? 1 : 0) : pricing.tax_included,
            total_price: pricing.total_price,
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

        // Inventory adjustments independent of status, with special handling for cancel/return
        try {
          const prevItems = Array.isArray(prevItemsRaw) ? prevItemsRaw : [];
          const newItems = Array.isArray(incomingItems) ? incomingItems : prevItems;
          const newStatus = (mapped.status || '').toLowerCase();
          const newIsCancelled = isCancelledStatus(newStatus);
          const newIsReturned = isReturnedStatus(newStatus);

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

          if (newIsCancelled || newIsReturned) {
            if (!req.body.restoredOnEdit) {
              for (const [pid, qty] of prevMap.entries()) {
                await Product.adjustStock(pid, qty, accountId);
              }
            }
          } else {
            const allPids = new Set([...prevMap.keys(), ...newMap.keys()]);
            for (const pid of allPids) {
              const oldQty = prevMap.get(pid) || 0;
              const newQty = newMap.get(pid) || 0;
              const delta = newQty - oldQty;
              if (delta > 0) {
                const prod = await Product.getById(pid, accountId);
                const available = Number(prod?.stock || 0);
                if (!prod || available < delta) {
                  const name = prod?.name || `ID ${pid}`;
                  return res.status(400).json({ success: false, message: `Insufficient stock for product ${name}` });
                }
              }
            }
            for (const pid of allPids) {
              const oldQty = prevMap.get(pid) || 0;
              const newQty = newMap.get(pid) || 0;
              const delta = newQty - oldQty;
              if (delta !== 0) {
                await Product.adjustStock(pid, -delta, accountId);
              }
            }
          }
        } catch (invErr) {
          console.error('Inventory adjust error (update):', invErr.message);
        }

        const updatedOrder = await Order.update(req.params.id, mapped, accountId);
        
        res.json({
            success: true,
            message: 'Order updated successfully',
            data: formatOrderForFrontend(updatedOrder)
        });
        // Notify clients on update
        broadcast('orders.changed', { id: updatedOrder.id });
        broadcast('products.changed', {});
    } catch (error) {
        console.error('Error in updateOrder:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order',
            error: error?.message || 'Unknown error'
        });
    }
};

// Delete order for the authenticated user
const deleteOrder = async (req, res) => {
    try {
        const accountId = req.user.role === 'admin' ? null : req.user.account_id;
        const order = await Order.findById(req.params.id, accountId);
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
                await Product.adjustStock(pid, qty, accountId);
              }
            }
          }
        } catch (invErr) {
          console.error('Inventory adjust error (delete):', invErr.message);
        }
        
        const deleted = await Order.delete(req.params.id, accountId);
        
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
        const accountId = req.user.role === 'admin' ? null : req.user.account_id;
        const order = await Order.findById(req.params.id, accountId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found or access denied' });
        }

        try {
            const items = typeof order.products === 'string' ? JSON.parse(order.products || '[]') : (order.products || []);
            for (const it of Array.isArray(items) ? items : []) {
                const pid = Number(it.product_id);
                const qty = Number(it.quantity || 0);
                if (!Number.isNaN(pid) && pid > 0 && qty > 0) {
                    await Product.adjustStock(pid, qty, accountId);
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

// Reconcile product stock by scanning delivered+paid orders and deducting quantities once
const reconcileStockFromOrders = async (req, res) => {
    try {
        const accountId = req.user.role === 'admin' ? null : req.user.account_id;
        const orders = await Order.getDeliveredPaidUnreconciled(accountId);
        const productsList = await Product.getAll(accountId);
        const nameToId = new Map();
        for (const p of Array.isArray(productsList) ? productsList : []) {
            const key = String(p.name || '').toLowerCase();
            if (key) nameToId.set(key, Number(p.id));
        }

        const qtyByPid = new Map();
        const reconciledIds = [];

        for (const o of Array.isArray(orders) ? orders : []) {
            let items = [];
            try {
                items = typeof o.products === 'string' ? JSON.parse(o.products || '[]') : (o.products || []);
            } catch {}
            if (!Array.isArray(items) || items.length === 0) continue;

            for (const it of items) {
                const rawPid = it.product_id != null ? Number(it.product_id) : NaN;
                const nameKey = String(it.name || it.external_name || '').toLowerCase();
                const pid = Number.isFinite(rawPid) && rawPid > 0 ? rawPid : (nameToId.get(nameKey) || null);
                const qty = Number(it.quantity || 0);
                if (!pid || Number.isNaN(qty) || qty <= 0) continue;
                qtyByPid.set(pid, (qtyByPid.get(pid) || 0) + qty);
            }

            reconciledIds.push(o.id);
        }

        for (const [pid, qty] of qtyByPid.entries()) {
            await Product.adjustStock(pid, -qty, accountId);
        }

        if (reconciledIds.length > 0) {
            await Order.markStockReconciled(reconciledIds, accountId);
        }

        broadcast('products.changed', {});
        res.json({ success: true, message: 'Stock reconciled from delivered+paid orders', updated_products: qtyByPid.size, updated_orders: reconciledIds.length });
    } catch (error) {
        console.error('Error in reconcileStockFromOrders:', error);
        res.status(500).json({ success: false, message: 'Failed to reconcile stock', error: error?.message || 'Unknown error' });
    }
};

module.exports = {
    getAllOrders,
    getOrderById,
    createOrder,
    updateOrder,
    deleteOrder,
    startEditOrder,
    reconcileStockFromOrders
};
