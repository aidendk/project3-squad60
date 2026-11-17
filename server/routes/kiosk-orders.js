const express = require('express');
const { applyReward, pointsEarned } = require('../../public/js/shared/rewards');
const { TAX_RATE: SALES_TAX_RATE, roundMoney } = require('../../public/js/shared/money');
const { insertKioskOrder } = require('../services/kiosk-orders');
const { listPromotions } = require('../services/promotions');
const { applyPromotions } = require('../../public/js/shared/promotions');

function createKioskOrdersRouter({ pool, menuSchemaReady = Promise.resolve(), promotionsSchemaReady = Promise.resolve() }) {
    const router = express.Router();
    router.post('/api/orders', express.json({ limit: '100kb' }), async (req, res) => {
        const { items, customer_name, total_price, order_source, customer_id, reward_id } = req.body || {};
        const customerName = typeof customer_name === 'string' ? customer_name.trim() : '';
        const rawCustomerId = customer_id == null ? '' : String(customer_id).trim();
        const parsedCustomerId = rawCustomerId === '' ? null : Number(rawCustomerId);
        const customerId = parsedCustomerId;
        const rewardId = reward_id == null || reward_id === '' ? null : reward_id;

        if (order_source !== 'kiosk') {
            return res.status(400).json({ error: 'order_source must be kiosk' });
        }
        if (customerId != null && (!Number.isInteger(customerId) || customerId <= 0)) {
            return res.status(400).json({ error: 'customer_id must be a loyalty account' });
        }
        if (rewardId != null && typeof rewardId !== 'string') {
            return res.status(400).json({ error: 'Unknown reward' });
        }
        if (rewardId && !customerId) {
            return res.status(400).json({ error: 'A reward requires a checked-in customer' });
        }
        if (!customerName || customerName.length > 80) {
            return res.status(400).json({ error: 'customer_name is required' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items are required' });
        }

        const mergedItems = new Map();
        for (const item of items) {
            const menuItemId = Number(item && item.menu_item_id);
            const quantity = Number(item && item.quantity);
            if (!Number.isInteger(menuItemId) || menuItemId <= 0) {
                return res.status(400).json({ error: 'Each item needs a menu_item_id' });
            }
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
                return res.status(400).json({ error: 'Each item quantity must be from 1 to 20' });
            }
            const nextQuantity = (mergedItems.get(menuItemId) || 0) + quantity;
            if (nextQuantity > 20) {
                return res.status(400).json({ error: 'Each item quantity must be from 1 to 20' });
            }
            mergedItems.set(menuItemId, nextQuantity);
        }

        try {
            await Promise.all([menuSchemaReady, promotionsSchemaReady]);
            const menuResult = await pool.query({
                text: 'SELECT menu_item_id, name, price, category FROM menu_item WHERE menu_item_id = ANY($1::int[])',
                values: [[...mergedItems.keys()]],
                query_timeout: 5000
            });
            if (menuResult.rowCount !== mergedItems.size) {
                return res.status(400).json({ error: 'One or more drinks are not on the menu' });
            }

            const pricedItems = menuResult.rows.map((row) => ({
                menu_item_id: row.menu_item_id,
                name: row.name,
                category: row.category,
                price: Number(row.price),
                quantity: mergedItems.get(row.menu_item_id)
            }));
            const activePromotions = await listPromotions(pool, { activeOnly: true });
            const promotionPricing = applyPromotions(pricedItems, activePromotions);
            const subtotal = promotionPricing.subtotal;
            const applied = applyReward(promotionPricing.discountedSubtotal, rewardId);
            if (!applied) {
                return res.status(400).json({ error: 'Unknown reward' });
            }
            const discountedSubtotal = roundMoney(promotionPricing.discountedSubtotal - applied.discount);
            const tax = roundMoney(discountedSubtotal * SALES_TAX_RATE);
            const expectedTotal = roundMoney(discountedSubtotal + tax);

            if (typeof total_price !== 'number' || !Number.isFinite(total_price) || roundMoney(total_price) !== expectedTotal) {
                return res.status(409).json({
                    error: 'Prices or deals changed. Review the updated total before placing your order again.',
                    expected_total: expectedTotal,
                    active_promotions: activePromotions,
                    menu_items: pricedItems
                });
            }

            const savedOrder = await insertKioskOrder(pool, {
                items: pricedItems,
                totalPrice: expectedTotal,
                tax,
                promotionDiscount: promotionPricing.discount,
                promotionDetails: promotionPricing.discounts,
                customerId,
                pointsSpent: applied.points,
                pointsEarned: customerId ? pointsEarned(subtotal) : 0,
                rewardReason: applied.label ? `Redeemed ${applied.label}` : ''
            });

            const payload = {
                order_id: savedOrder.order_id,
                customer_name: customerName,
                order_source: 'kiosk',
                items: pricedItems,
                subtotal,
                promotion_discount: promotionPricing.discount,
                promotions: promotionPricing.discounts,
                reward_discount: applied.discount,
                tax,
                total_price: expectedTotal
            };
            if (customerId) {
                payload.points_earned = savedOrder.points_earned;
                payload.points_remaining = savedOrder.points_remaining;
            }
            if (applied.points > 0) {
                payload.discount = applied.discount;
                payload.points_spent = applied.points;
            }
            res.status(201).json(payload);
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 409) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error('Error saving kiosk order', err);
            res.status(500).json({ error: 'Unable to save order' });
        }
    });
    return router;
}

module.exports = { createKioskOrdersRouter };
