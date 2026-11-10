(() => {
    const prices = typeof module !== 'undefined' && module.exports
        ? require('./price-validation') : globalThis.menuPriceValidation;

    function validateMenuItem(body) {
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (!name || [...name].length > 100 || name.includes('\0')) {
            return { error: 'Enter an item name from 1 to 100 characters.' };
        }
        const price = prices.parsePrice(body?.price);
        if (price === null) return { error: prices.priceMessage };
        if (!Array.isArray(body?.ingredients) || body.ingredients.length < 1 || body.ingredients.length > 100) {
            return { error: 'Add between 1 and 100 recipe ingredients.' };
        }
        const seen = new Set();
        const ingredients = [];
        for (const entry of body.ingredients) {
            if (!entry || !Number.isInteger(entry.inventory_item_id) || entry.inventory_item_id < 1 || entry.inventory_item_id > 2147483647
                || !Number.isInteger(entry.quantity_required) || entry.quantity_required < 1 || entry.quantity_required > 2147483647) {
                return { error: 'Choose an ingredient and enter a whole-number quantity from 1 to 2,147,483,647 units per drink.' };
            }
            if (seen.has(entry.inventory_item_id)) return { error: 'Select each ingredient only once; combine its quantity in one row.' };
            seen.add(entry.inventory_item_id);
            ingredients.push({ inventory_item_id: entry.inventory_item_id, quantity_required: entry.quantity_required });
        }
        return { item: { name, price, ingredients } };
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { validateMenuItem };
    else globalThis.menuItemValidation = { validateMenuItem };
})();
