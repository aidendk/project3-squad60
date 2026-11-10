async (page) => {
    // Run against an isolated preview with the fixture menu on port 3101.
    // The only write request is intercepted; no persistent items are created.
    page.setDefaultTimeout(5000);
    const assert = (ok, message) => { if (!ok) throw new Error(message); };
    const browserErrors = [];
    const onError = error => browserErrors.push(error.message);
    page.on('pageerror', onError);
    await page.route('**/api/menu', route => {
        const input = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: { menu_item_id: 99, name: input.name, price: Number(input.price), ingredients: input.ingredients } });
    });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('http://127.0.0.1:3101/manager');
    const search = page.getByRole('searchbox', { name: 'Search menu by name', exact: true });
    const category = page.getByLabel('Menu category', { exact: true });
    const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
    const visibleNames = () => page.locator('#manager-menu-body tr:visible [data-item-name]').allTextContents();
    await search.waitFor();
    const all = await visibleNames();
    assert(all.length === 7, 'The full fixture menu must initially be visible');
    assert((await page.locator('#menu-filter-status').textContent()).includes('7 of 7'), 'Initial result count must be correct');
    assert(await category.locator('option').allTextContents().then(options => options.join('|')) === 'All categories|Milk Tea|Fruit Tea|Specialty|Toppings', 'Use the existing menu categories');
    await search.fill('  mAnGo  ');
    assert((await visibleNames()).length === 3, 'Name search must ignore case and surrounding whitespace');
    await category.selectOption('Fruit Tea');
    assert(JSON.stringify(await visibleNames()) === JSON.stringify(['Mango Green Tea']), 'Search and category must intersect');
    await search.fill('taro');
    await page.locator('#menu-no-matches').waitFor({ state: 'visible' });
    assert((await visibleNames()).length === 0, 'Nonmatching rows must be hidden');
    assert(!await page.locator('#manager-menu-region').isVisible(), 'Empty search must not display an empty table');
    assert((await page.locator('#menu-filter-status').textContent()).includes('0 of 7'), 'Empty search count must be announced');
    await clear.click();
    assert(JSON.stringify(await visibleNames()) === JSON.stringify(all), 'Clear must restore every item in its original order');
    assert(await search.inputValue() === '' && await category.inputValue() === '', 'Clear must reset both controls');
    assert(await search.evaluate(node => node === document.activeElement), 'Clear must focus the search field');
    await search.fill('.*');
    assert((await visibleNames()).length === 0, 'Search punctuation must not become a regular expression');
    await clear.click();
    await category.focus();
    await category.press('Home');
    await category.press('ArrowDown');
    await category.press('Tab');
    assert(await category.inputValue() === 'Milk Tea', 'Category filter must support keyboard input');
    assert((await visibleNames()).length === 2, 'Milk Tea must include fresh milk as in the cashier');
    await search.focus();
    await search.pressSequentially('CLASSIC');
    await search.press('Enter');
    assert((await visibleNames()).length === 1, 'Keyboard search must work with a category');
    assert(await search.inputValue() === 'CLASSIC', 'Enter must not navigate or reset filters');
    await clear.focus();
    await clear.press('Enter');
    assert((await visibleNames()).length === 7, 'Clear must work with the keyboard');

    // A newly added item must respect active filters immediately.
    await category.selectOption('Toppings');
    await page.getByLabel('Item name', { exact: true }).fill('New Mango Milk Tea');
    await page.getByLabel('Price (USD)', { exact: true }).fill('6.50');
    await page.getByLabel('Ingredient 1', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#add-menu-status').textContent.includes('added'));
    assert((await visibleNames()).length === 1, 'A new nonmatching drink must remain filtered out');
    assert((await page.locator('#menu-filter-status').textContent()).includes('1 of 8'), 'New items must update the result count');
    await category.selectOption('Milk Tea');
    await search.fill('NEW MANGO');
    assert(JSON.stringify(await visibleNames()) === JSON.stringify(['New Mango Milk Tea']), 'New items must be searchable and categorized');
    await clear.click();
    assert((await visibleNames()).length === 8, 'Clearing must include newly created items');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Filter controls must fit a mobile screen');

    await page.goto('http://127.0.0.1:3101/manager?empty=1');
    assert(await page.locator('#menu-empty').isVisible(), 'An empty database needs its original empty-menu message');
    await search.fill('first');
    assert(!await page.locator('#menu-no-matches').isVisible(), 'An empty database must not be described as a filter mismatch');
    await page.getByLabel('Item name', { exact: true }).fill('First Milk Tea');
    await page.getByLabel('Price (USD)', { exact: true }).fill('5.00');
    await page.getByLabel('Ingredient 1', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#add-menu-status').textContent.includes('added'));
    assert(JSON.stringify(await visibleNames()) === JSON.stringify(['First Milk Tea']), 'The first added drink must join the filtered menu');
    assert(!await page.locator('#menu-empty').isVisible(), 'Adding the first drink must clear the empty-menu message');
    await page.goto('http://127.0.0.1:3101/manager?menuError=1');
    assert(await page.locator('#menu-filters').count() === 0, 'A failed menu request must keep the existing request-error state');
    assert((await page.locator('.menu-management').textContent()).includes('Unable to load the menu'), 'The menu error must remain visible');

    await page.unroute('**/api/menu');
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('http://127.0.0.1:3101/cashier');
    await page.waitForFunction(() => document.querySelectorAll('#itemGrid .item-card').length === 7);
    const categories = await page.locator('#itemGrid .item-card').evaluateAll(cards => cards.map(card => card.dataset.category));
    assert(JSON.stringify(categories) === JSON.stringify(['Milk Tea', 'Milk Tea', 'Fruit Tea', 'Fruit Tea', 'Specialty', 'Toppings', 'Specialty']), 'Extracting the category helper must preserve cashier behavior');
    assert(browserErrors.length === 0, `Unexpected browser errors: ${browserErrors.join('; ')}`);
    page.removeListener('pageerror', onError);
    return { passed: ['existing categories', 'case-insensitive search', 'combined filters', 'clear', 'no matches', 'live result count', 'literal punctuation', 'keyboard search/category/clear', 'new items', 'empty menu and first item', 'menu request error', 'cashier categories', 'mobile layout'] };
}
