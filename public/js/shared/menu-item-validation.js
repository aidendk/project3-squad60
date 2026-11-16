(() => {
    const prices = typeof module !== 'undefined' && module.exports
        ? require('./price-validation') : globalThis.menuPriceValidation;
    const { categories } = typeof module !== 'undefined' && module.exports
        ? require('./menu') : globalThis.menuCategories;

    function validateName(value) {
        const name = typeof value === 'string' ? value.trim() : '';
        return name && [...name].length <= 100 && !name.includes('\0') ? name : null;
    }

    function validateMenuItemDetails(body) {
        if (!body || typeof body !== 'object' || Array.isArray(body)
            || Object.keys(body).some(key => !['name', 'category'].includes(key))) {
            return { error: 'Send only the item name and category.' };
        }
        const name = validateName(body.name);
        if (name === null) return { error: 'Enter an item name from 1 to 100 characters.', field: 'name' };
        if (!categories.includes(body.category)) return { error: 'Choose a valid menu category.', field: 'category' };
        return { item: { name, category: body.category } };
    }

    function validateMenuItem(body) {
        const name = validateName(body?.name);
        if (name === null) {
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

    const validation = { validateMenuItem, validateMenuItemDetails };
    if (typeof module !== 'undefined' && module.exports) module.exports = validation;
    else globalThis.menuItemValidation = validation;
})();
