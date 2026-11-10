async (page) => {
    // Run with the Playwright browser tool and the isolated preview on port 3101.
    // Intercepted responses test the UI without changing persistent data.
    page.setDefaultTimeout(5000);
    const assert = (ok, message) => { if (!ok) throw new Error(message); };
    let requests = 0, mode = 'error', release;
    const held = new Promise(resolve => { release = resolve; });
    const items = [{ menu_item_id: 1, name: 'Classic Milk Tea', price: 5.5 }];
    const name = `Luca's <New> Tea "special"`;
    await page.route('**/api/menu', async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: items });
        requests++;
        const input = route.request().postDataJSON();
        if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'Unable to save. Please try again.' } });
        await held;
        const item = { menu_item_id: 2, name: input.name.trim(), price: Number(input.price), ingredients: input.ingredients };
        items.push(item);
        return route.fulfill({ status: 201, json: item });
    });
    await page.route('**/api/menu/*', async route => {
        const item = items.find(item => item.menu_item_id === Number(route.request().url().split('/').at(-1)));
        item.price = Number(route.request().postDataJSON().price);
        return route.fulfill({ json: item });
    });
    await page.route('**/api/reports/sales', route => route.fulfill({ status: 503, json: { error: 'Not part of this test' } }));
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('http://127.0.0.1:3101/manager');
    await page.getByRole('heading', { name: 'Add Menu Item', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
    assert((await page.locator('#add-menu-error').textContent()).includes('name'), 'Required name must be validated');
    assert(requests === 0, 'Client-invalid fields must not submit');
    await page.getByLabel('Item name', { exact: true }).fill(name);
    await page.getByLabel('Price (USD)', { exact: true }).fill('1.001');
    await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
    assert((await page.locator('#add-menu-error').textContent()).includes('cent'), 'Price precision must be validated');
    await page.getByLabel('Price (USD)', { exact: true }).fill('6.50');
    await page.getByLabel('Ingredient 1', { exact: true }).selectOption('2');
    await page.getByLabel('Quantity per drink 1', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
    await page.getByLabel('Ingredient 2', { exact: true }).selectOption('2');
    await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
    assert((await page.locator('#add-menu-error').textContent()).includes('only once'), 'Duplicate ingredients must be rejected');
    assert(requests === 0, 'Invalid recipe must not submit');
    await page.getByLabel('Ingredient 2', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#add-menu-error').textContent.includes('Unable to save'));
    assert(await page.getByLabel('Item name', { exact: true }).inputValue() === name, 'Failure must preserve the entered item');
    assert(!await page.getByRole('button', { name: 'Add menu item', exact: true }).isDisabled(), 'Failed request must permit retry');
    assert(await page.locator('#manager-menu-body tr').count() === 1, 'Failed request must not add a row');
    mode = 'hold';
    await page.getByRole('button', { name: 'Add menu item', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), 'Submission must show a disabled saving state');
    await page.locator('#add-menu-form').evaluate(form => form.requestSubmit());
    assert(requests <= 2, 'Pending submissions must not be duplicated');
    release();
    await page.waitForFunction(() => document.querySelector('#add-menu-status').textContent.includes('added'));
    const row = page.locator('#manager-menu-body tr').last();
    assert(await row.locator('[data-item-name]').textContent() === name, 'Created name must be displayed as text');
    assert(await row.locator('[data-item-name] new').count() === 0, 'Names must never become HTML');
    assert(await row.locator('[data-item-price]').textContent() === '$6.50', 'Created price must be formatted as USD');
    assert(await page.getByLabel('Item name', { exact: true }).inputValue() === '', 'Success must reset the form');
    assert(await page.locator('.recipe-row').count() === 1, 'Success must reset the recipe editor');
    await row.getByRole('button', { name: `Update price for ${name}`, exact: true }).click();
    await page.getByLabel('New price (USD)').fill('7.50');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#manager-menu-body tr:last-child [data-item-price]').textContent === '$7.50');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Form must fit a mobile screen');

    // Existing ordering pages must render arbitrary manager-entered names and
    // use the new menu ID when adding the drink to an order.
    await page.goto('http://127.0.0.1:3101/kiosk');
    await page.getByRole('button', { name: "I don't have a code", exact: true }).click();
    await page.getByRole('tab', { name: 'Fruit Tea', exact: true }).click();
    const drink = page.getByRole('button', { name: `Add ${name}, $7.50`, exact: true });
    await drink.waitFor();
    await drink.click();
    assert(await page.locator('.cart-row .cart-row-top > span').first().textContent() === name, 'Kiosk must show the new drink in the cart');
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('http://127.0.0.1:3101/cashier');
    const card = page.locator('.item-card').filter({ has: page.locator('.item-name', { hasText: name }) });
    await card.waitFor();
    await card.click();
    assert(await page.locator('.row-name').last().textContent() === name, 'Cashier must preserve quotes and angle brackets in the new name');
    return { passed: ['labeled form', 'client validation', 'recipe editing', 'error and retry', 'saving state', 'no double submit', 'immediate menu row', 'safe name rendering', 'price update on new row', 'mobile layout', 'kiosk and cashier availability'], requests };
}
