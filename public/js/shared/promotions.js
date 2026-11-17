(() => {
    const isNode = typeof module !== 'undefined' && module.exports;
    const { kioskCategoryFor } = isNode ? require('./menu') : globalThis.menuCategories;
    const { roundMoney, formatMoney } = isNode ? require('./money') : globalThis.shopMoney;

    function matchesPromotion(item, promotion) {
        const category = kioskCategoryFor(item.name, item.category);
        return category != null && (promotion.target_category == null || promotion.target_category === 'ALL'
            || promotion.target_category === category);
    }

    function promotionLabel(promotion) {
        if (promotion.promo_type === 'BOGO') return 'Buy one, get one free (same drink)';
        return promotion.promo_type === 'PERCENT'
            ? `${Number(promotion.discount_value)}% off each drink`
            : `${formatMoney(promotion.discount_value)} off each drink`;
    }

    // One best offer per menu item; ties resolve by ID. Money is allocated in cents.
    // BOGO pairs identical menu items, including quantities merged by the server.
    function applyPromotions(items, promotions) {
        const lines = new Map();
        const itemDiscounts = [];
        let subtotalCents = 0;
        let discountCents = 0;
        for (const item of items) {
            const unit = Math.round(roundMoney(item.price) * 100);
            const quantity = item.quantity;
            subtotalCents += unit * quantity;
            let best = null;
            let savings = 0;
            for (const promotion of [...promotions].sort((a, b) => a.promo_id - b.promo_id)) {
                if (!matchesPromotion(item, promotion)) continue;
                let amount = 0;
                if (promotion.promo_type === 'PERCENT') amount = Math.round(unit * Number(promotion.discount_value) / 100) * quantity;
                if (promotion.promo_type === 'FLAT') amount = Math.round(Number(promotion.discount_value) * 100) * quantity;
                if (promotion.promo_type === 'BOGO') amount = Math.floor(quantity / 2) * unit;
                amount = Math.max(0, Math.min(unit * quantity, amount));
                if (amount > savings) { best = promotion; savings = amount; }
            }
            if (best) {
                const line = lines.get(best.promo_id) || { promo_id: best.promo_id, title: best.title, cents: 0 };
                line.cents += savings;
                lines.set(best.promo_id, line);
            }
            discountCents += savings;
            itemDiscounts.push({ menu_item_id: item.menu_item_id, promo_id: best?.promo_id || null, discount: savings / 100 });
        }
        return {
            subtotal: subtotalCents / 100,
            discount: discountCents / 100,
            discountedSubtotal: (subtotalCents - discountCents) / 100,
            discounts: [...lines.values()].map(({ cents, ...line }) => ({ ...line, discount: cents / 100 })),
            items: itemDiscounts
        };
    }

    const helpers = { matchesPromotion, promotionLabel, applyPromotions };
    if (isNode) module.exports = helpers;
    else globalThis.shopPromotions = helpers;
})();
