(() => {
    // Preserve the existing cashier classification; menu_item has no category
    // column. Keep manager filters and cashier cards on the same rules.
    const toppings = new Set([
        'tapioca pearls', 'mango popping boba', 'grass jelly', 'aloe vera',
        'egg pudding', 'red bean', 'lychee jelly', 'cheese foam'
    ]);
    function categoryFor(name) {
        const normalized = name.trim().toLowerCase();
        if (toppings.has(normalized)) return 'Toppings';
        if (normalized.includes('milk tea') || normalized.includes('fresh milk')) return 'Milk Tea';
        if (normalized.includes('tea')) return 'Fruit Tea';
        return 'Specialty';
    }
    function matchesMenuItem(item, search, category) {
        return item.name.toLowerCase().includes(search.trim().toLowerCase())
            && (!category || categoryFor(item.name) === category);
    }
    const helpers = { categoryFor, matchesMenuItem };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    else globalThis.menuCategories = helpers;
})();
