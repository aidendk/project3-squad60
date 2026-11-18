(() => {
    const { parsePrice, priceMessage } = menuPriceValidation;
    const { validateMenuItemDetails } = menuItemValidation;
    const nameInput = document.getElementById('edit-menu-name');
    const categoryInput = document.getElementById('edit-menu-category');
    const priceInput = document.getElementById('new-price');
    const detailPrice = document.getElementById('edit-menu-price');
    const recipeEditor = document.getElementById('edit-recipe-editor');
    const addIngredient = document.getElementById('edit-add-ingredient');
    let recipeRowId = 0;
    let hadRecipe = false;
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const editors = {
        details: { form: document.getElementById('edit-menu-form'), fields: [nameInput, categoryInput, detailPrice],
            save: document.getElementById('save-menu-details'), cancel: document.getElementById('cancel-menu-details'),
            error: document.getElementById('edit-menu-error'), status: document.getElementById('edit-menu-status') },
        price: { form: document.getElementById('price-form'), fields: [priceInput],
            save: document.getElementById('save-price'), cancel: document.getElementById('cancel-price'),
            error: document.getElementById('price-error'), status: document.getElementById('price-status') }
    };
    let selected = null;
    let saving = false;
    let detailsLoaded = false;

    function labelRecipeRows() {
        const rows = [...recipeEditor.children];
        document.getElementById('edit-recipe-empty').hidden = rows.length > 0;
        rows.forEach((row, index) => {
            row.querySelector('[data-ingredient-label]').textContent = `Ingredient ${index + 1}`;
            row.querySelector('[data-quantity-label]').textContent = `Quantity per drink ${index + 1}`;
            const remove = row.querySelector('[data-remove-ingredient]');
            remove.disabled = saving || (rows.length === 1 && hadRecipe);
            remove.setAttribute('aria-label', `Remove ingredient ${index + 1}`);
        });
        addIngredient.disabled = saving || rows.length >= 100;
    }
    function addRecipeRow(entry = {}) {
        const row = document.getElementById('recipe-row-template').content.firstElementChild.cloneNode(true);
        const ingredient = row.querySelector('[data-ingredient]');
        const quantity = row.querySelector('[data-quantity]');
        ingredient.id = `edit-recipe-ingredient-${++recipeRowId}`;
        quantity.id = `edit-recipe-quantity-${recipeRowId}`;
        row.querySelector('[data-ingredient-label]').htmlFor = ingredient.id;
        row.querySelector('[data-quantity-label]').htmlFor = quantity.id;
        if (entry.inventory_item_id) {
            if (![...ingredient.options].some(option => option.value === String(entry.inventory_item_id))) {
                const option = document.createElement('option');
                option.value = entry.inventory_item_id;
                option.textContent = entry.name;
                ingredient.append(option);
            }
            ingredient.value = entry.inventory_item_id;
            quantity.value = entry.quantity_required;
        }
        recipeEditor.append(row);
        labelRecipeRows();
        return ingredient;
    }
    addIngredient.addEventListener('click', () => { if (!saving) addRecipeRow().focus(); });
    recipeEditor.addEventListener('click', event => {
        const remove = event.target.closest('[data-remove-ingredient]');
        if (!remove || saving) return;
        remove.closest('.recipe-row').remove();
        labelRecipeRows();
        addIngredient.focus();
    });

    function close() {
        if (!selected) return;
        editors[selected.mode].form.hidden = true;
        const focus = selected.row.hidden ? document.getElementById('menu-search') : selected.button;
        selected = null;
        focus?.focus();
    }

    function setSaving(value, message = 'Saving...') {
        saving = value;
        const editor = editors[selected.mode];
        editor.form.querySelectorAll('input, select, button').forEach(field => { field.disabled = value; });
        document.querySelectorAll('.update-price, .edit-menu-item, .delete-menu-item').forEach(button => { button.disabled = value; });
        editor.form.setAttribute('aria-busy', String(value));
        editor.save.textContent = value ? message : selected.mode === 'price' ? 'Save' : 'Save changes';
        labelRecipeRows();
    }

    document.querySelector('.menu-management').addEventListener('click', async event => {
        const button = event.target.closest('.update-price, .edit-menu-item, .delete-menu-item');
        if (!button || saving) return;
        if (button.matches('.delete-menu-item')) {
            const row = button.closest('tr');
            const name = row.querySelector('[data-item-name]').textContent;
            if (!window.confirm(`Delete "${name}" and its recipe? Menu items used in order history cannot be deleted.`)) return;
            close();
            document.getElementById('menu-delete-error').textContent = '';
            saving = true;
            document.querySelectorAll('.update-price, .edit-menu-item, .delete-menu-item').forEach(control => { control.disabled = true; });
            const status = editors.details.status;
            status.textContent = 'Deleting menu item...';
            try {
                const response = await fetch(`/api/menu/${button.dataset.menuItemId}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Unable to delete menu item.');
                row.remove();
                document.dispatchEvent(new CustomEvent('menu:updated'));
                status.textContent = `${name} deleted.`;
                document.getElementById('menu-search').focus();
            } catch (error) {
                status.textContent = '';
                // Keep deletion errors visible outside either editor.
                document.getElementById('menu-delete-error').textContent = error instanceof TypeError || error.name === 'TimeoutError'
                    ? 'Could not confirm deletion. Reload the menu before trying again.' : error.message;
            } finally {
                saving = false;
                document.querySelectorAll('.update-price, .edit-menu-item, .delete-menu-item').forEach(control => { control.disabled = false; });
            }
            return;
        }
        close();
        const row = button.closest('tr');
        const mode = button.matches('.update-price') ? 'price' : 'details';
        const name = row.querySelector('[data-item-name]').textContent;
        selected = { row, button, mode, id: button.dataset.menuItemId };
        document.getElementById('menu-delete-error').textContent = '';
        Object.values(editors).forEach(editor => {
            editor.error.textContent = editor.status.textContent = '';
            editor.fields.forEach(field => field.removeAttribute('aria-invalid'));
        });
        nameInput.value = name;
        categoryInput.value = row.querySelector('[data-item-category]').textContent;
        priceInput.value = row.querySelector('.update-price').dataset.price;
        document.getElementById('selected-item').textContent = `${name} — Current price: ${currency.format(priceInput.value)}`;
        document.getElementById('edit-menu-selected').textContent = `Editing ${name}.`;
        editors[mode].form.hidden = false;
        if (mode === 'details') {
            detailsLoaded = false;
            recipeEditor.replaceChildren();
            setSaving(true, 'Loading details...');
            let loaded = false;
            try {
                const response = await fetch(`/api/menu/${selected.id}`, { signal: AbortSignal.timeout(15000) });
                const item = await response.json();
                if (!response.ok) throw new Error(item.error || 'Unable to load details.');
                nameInput.value = item.name;
                categoryInput.value = menuCategories.categoryFor(item.name, item.category);
                detailPrice.value = item.price;
                hadRecipe = item.ingredients.length > 0;
                item.ingredients.forEach(addRecipeRow);
                loaded = true;
                detailsLoaded = true;
            } catch (error) {
                editors.details.error.textContent = error.message;
            } finally { setSaving(false); }
            if (!loaded) {
                editors.details.save.disabled = true;
                return;
            }
        }
        editors[mode].fields[0].focus();
        editors[mode].fields[0].select();
    });

    for (const [mode, editor] of Object.entries(editors)) {
        editor.cancel.addEventListener('click', () => { if (!saving) close(); });
        editor.form.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !saving) { event.preventDefault(); close(); }
        });
        editor.fields.forEach(field => field.addEventListener('input', () => {
            field.removeAttribute('aria-invalid');
            editor.error.textContent = '';
        }));
        editor.form.addEventListener('submit', async event => {
            event.preventDefault();
            if (saving || !selected || selected.mode !== mode) return;
            if (mode === 'details' && !detailsLoaded) return;
            let body;
            if (mode === 'details') {
                const ingredients = [...recipeEditor.children].map(row => ({
                    inventory_item_id: Number(row.querySelector('[data-ingredient]').value),
                    quantity_required: Number(row.querySelector('[data-quantity]').value)
                }));
                const result = validateMenuItemDetails({ name: nameInput.value, category: categoryInput.value,
                    price: detailPrice.value, ...(hadRecipe || ingredients.length ? { ingredients } : {}) });
                if (result.error) {
                    editor.error.textContent = result.error;
                    const field = result.field === 'category' ? categoryInput : result.field === 'price' ? detailPrice
                        : result.field === 'ingredients' ? (recipeEditor.querySelector('select') || addIngredient) : nameInput;
                    field.setAttribute('aria-invalid', 'true');
                    field.focus();
                    return;
                }
                body = result.item;
            } else {
                const price = parsePrice(priceInput.value);
                if (price === null) {
                    editor.error.textContent = priceMessage;
                    priceInput.setAttribute('aria-invalid', 'true');
                    priceInput.focus();
                    return;
                }
                body = { price };
            }
            editor.error.textContent = '';
            setSaving(true);
            try {
                const response = await fetch(`/api/menu/${selected.id}`, { method: mode === 'price' ? 'PUT' : 'PATCH',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
                const item = await response.json();
                if (!response.ok) throw new Error(item.error || 'Unable to save. Please try again.');
                managerMenuRows.update(selected.row, item);
                editor.status.textContent = mode === 'price' ? `Price for ${item.name} saved at ${currency.format(item.price)}.`
                    : `Details for ${item.name} saved. Category: ${item.category}.`;
                document.dispatchEvent(new CustomEvent('menu:updated'));
                setSaving(false);
                close();
            } catch (error) {
                setSaving(false);
                editor.error.textContent = error instanceof TypeError || error instanceof SyntaxError || ['TimeoutError', 'AbortError'].includes(error.name)
                    ? 'Could not confirm the save. Reload the menu to check its current details before trying again.' : error.message;
                editor.fields[0].focus();
            }
        });
    }
})();
