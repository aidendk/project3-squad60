(() => {
    const { validateMenuItem } = globalThis.menuItemValidation;
    const form = document.getElementById('add-menu-form');
    const fields = document.getElementById('add-menu-fields');
    const name = document.getElementById('add-menu-name');
    const price = document.getElementById('add-menu-price');
    const editor = document.getElementById('recipe-editor');
    const addIngredient = document.getElementById('add-ingredient');
    const template = document.getElementById('recipe-row-template');
    const submit = document.getElementById('add-menu-submit');
    const error = document.getElementById('add-menu-error');
    const status = document.getElementById('add-menu-status');
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    let rowId = 0;
    let saving = false;

    function labelRows() {
        const rows = [...editor.querySelectorAll('.recipe-row')];
        rows.forEach((row, index) => {
            row.querySelector('[data-ingredient-label]').textContent = `Ingredient ${index + 1}`;
            row.querySelector('[data-quantity-label]').textContent = `Quantity per drink ${index + 1}`;
            const remove = row.querySelector('[data-remove-ingredient]');
            remove.disabled = rows.length === 1;
            remove.setAttribute('aria-label', `Remove ingredient ${index + 1}`);
        });
        addIngredient.disabled = rows.length >= 100;
    }
    function addRow() {
        const row = template.content.firstElementChild.cloneNode(true);
        rowId++;
        const ingredient = row.querySelector('[data-ingredient]');
        const quantity = row.querySelector('[data-quantity]');
        ingredient.id = `recipe-ingredient-${rowId}`;
        quantity.id = `recipe-quantity-${rowId}`;
        row.querySelector('[data-ingredient-label]').htmlFor = ingredient.id;
        row.querySelector('[data-quantity-label]').htmlFor = quantity.id;
        editor.append(row);
        labelRows();
        return ingredient;
    }
    addRow();
    addIngredient.addEventListener('click', () => addRow().focus());
    editor.addEventListener('click', event => {
        const remove = event.target.closest('[data-remove-ingredient]');
        if (!remove || editor.children.length <= 1) return;
        remove.closest('.recipe-row').remove();
        labelRows();
        addIngredient.focus();
    });

    function appendMenuRow(item) {
        const row = document.createElement('tr');
        const title = document.createElement('th');
        title.scope = 'row';
        title.dataset.itemName = '';
        title.textContent = item.name;
        const amount = document.createElement('td');
        amount.dataset.itemPrice = '';
        amount.textContent = currency.format(item.price);
        const action = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'update-price';
        button.dataset.menuItemId = item.menu_item_id;
        button.dataset.price = item.price;
        button.textContent = 'Update Price';
        button.setAttribute('aria-label', `Update price for ${item.name}`);
        button.setAttribute('aria-controls', 'price-form');
        action.append(button);
        row.append(title, amount, action);
        document.getElementById('manager-menu-body').append(row);
        document.getElementById('menu-empty').hidden = true;
        document.getElementById('manager-menu-region').hidden = false;
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (saving || fields.disabled) return;
        error.textContent = status.textContent = '';
        const result = validateMenuItem({
            name: name.value, price: price.value,
            ingredients: [...editor.querySelectorAll('.recipe-row')].map(row => ({
                inventory_item_id: Number(row.querySelector('[data-ingredient]').value),
                quantity_required: Number(row.querySelector('[data-quantity]').value)
            }))
        });
        if (result.error) {
            error.textContent = result.error;
            error.focus();
            return;
        }
        saving = true;
        fields.disabled = true;
        form.setAttribute('aria-busy', 'true');
        submit.textContent = 'Saving…';
        let added = false;
        try {
            const response = await fetch('/api/menu', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.item), signal: AbortSignal.timeout(15000)
            });
            const item = await response.json();
            if (!response.ok) throw new Error(item.error || 'Unable to add the menu item. Please try again.');
            appendMenuRow(item);
            form.reset();
            editor.replaceChildren();
            addRow();
            status.textContent = `${item.name} added at ${currency.format(item.price)} with its recipe. Refresh any open cashier or kiosk screen to see it.`;
            added = true;
        } catch (failure) {
            error.textContent = failure instanceof TypeError || failure instanceof SyntaxError || failure.name === 'TimeoutError'
                ? 'Could not confirm the save. Reload the menu to check whether the item was added before trying again.' : failure.message;
            error.focus();
        } finally {
            fields.disabled = false;
            form.setAttribute('aria-busy', 'false');
            submit.textContent = 'Add menu item';
            saving = false;
            if (added) name.focus();
        }
    });
})();
