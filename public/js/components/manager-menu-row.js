(() => {
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    function update(row, item) {
        row.dataset.menuItemId = String(item.menu_item_id);
        row.querySelector('[data-item-name]').textContent = item.name;
        row.querySelector('[data-item-category]').textContent = menuCategories.categoryFor(item.name, item.category);
        row.querySelector('[data-item-price]').textContent = currency.format(item.price);
        const priceButton = row.querySelector('.update-price');
        priceButton.dataset.menuItemId = String(item.menu_item_id);
        priceButton.dataset.price = item.price;
        priceButton.setAttribute('aria-label', `Update price for ${item.name}`);
        const detailsButton = row.querySelector('.edit-menu-item');
        detailsButton.dataset.menuItemId = String(item.menu_item_id);
        detailsButton.setAttribute('aria-label', `Edit details for ${item.name}`);
    }

    function create(item) {
        const row = document.createElement('tr');
        const name = document.createElement('th');
        name.scope = 'row';
        name.dataset.itemName = '';
        const category = document.createElement('td');
        category.dataset.itemCategory = '';
        const price = document.createElement('td');
        price.dataset.itemPrice = '';
        const actions = document.createElement('td');
        const controls = document.createElement('div');
        controls.className = 'menu-row-actions';
        [['edit-menu-item', 'Edit details', 'edit-menu-form'], ['update-price', 'Update Price', 'price-form']].forEach(([className, text, form]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = className;
            button.textContent = text;
            button.setAttribute('aria-controls', form);
            controls.append(button);
        });
        actions.append(controls);
        row.append(name, category, price, actions);
        update(row, item);
        return row;
    }

    window.managerMenuRows = { create, update };
})();
