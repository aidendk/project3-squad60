(() => {
    const categories = ['Milk Tea', 'Fruit Tea', 'Specialty', 'Toppings'];
    // Saved categories take priority. Legacy rows keep their name-based grouping.
    const toppings = new Set([
        'tapioca pearls', 'mango popping boba', 'grass jelly', 'aloe vera',
        'egg pudding', 'red bean', 'lychee jelly', 'cheese foam'
    ]);
    function categoryFor(name, category) {
        if (categories.includes(category)) return category;
        const normalized = name.trim().toLowerCase();
        if (toppings.has(normalized)) return 'Toppings';
        if (normalized.includes('milk tea') || normalized.includes('fresh milk')) return 'Milk Tea';
        if (normalized.includes('tea')) return 'Fruit Tea';
        return 'Specialty';
    }
    function matchesMenuItem(item, search, category) {
        return item.name.toLowerCase().includes(search.trim().toLowerCase())
            && (!category || categoryFor(item.name, item.category) === category);
    }
    const DRINK_IMAGES = {
        'classic milk tea': 'classic-milk-tea.svg',
        'taro milk tea': 'taro-milk-tea.svg',
        'thai milk tea': 'thai-milk-tea.svg',
        'brown sugar milk tea': 'brown-sugar-milk-tea.svg',
        'matcha milk tea': 'matcha-milk-tea.svg',
        'jasmine green milk tea': 'jasmine-green-milk-tea.svg',
        'oolong milk tea': 'oolong-milk-tea.svg',
        'wintermelon milk tea': 'wintermelon-milk-tea.svg',
        'coffee milk tea': 'coffee-milk-tea.svg',
        'chocolate milk tea': 'chocolate-milk-tea.svg',
        'coconut milk tea': 'coconut-milk-tea.svg',
        'mango green tea': 'mango-green-tea.svg',
        'strawberry green tea': 'strawberry-green-tea.svg',
        'peach oolong tea': 'peach-oolong-tea.svg',
        'passion fruit green tea': 'passion-fruit-green-tea.svg',
        'lychee black tea': 'lychee-black-tea.svg',
        'lemon green tea': 'lemon-green-tea.svg',
        'honey green tea': 'honey-green-tea.svg',
        'blackberry tea': 'blackberry-tea.svg',
        'matcha latte': 'matcha-latte.svg',
        'brown sugar fresh milk': 'brown-sugar-fresh-milk.svg'
    };
    function imageFor(name) {
        const file = DRINK_IMAGES[name.trim().toLowerCase()] || 'signature-drink.svg';
        return `/images/menu/${file}`;
    }

    function kioskCategoryFor(name, category) {
        if (categories.includes(category)) return category === 'Toppings' ? null : category;
        const normalized = name.trim().toLowerCase();
        if (toppings.has(normalized)) {
            return null;
        }
        if (normalized.includes('milk tea')) {
            return 'Milk Tea';
        }
        if (normalized.includes('tea')) {
            return 'Fruit Tea';
        }
        return 'Specialty';
    }

    const helpers = { categories, categoryFor, kioskCategoryFor, matchesMenuItem, imageFor };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    else globalThis.menuCategories = helpers;
})();
