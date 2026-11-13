(() => {
    const { parsePrice, priceMessage } = menuPriceValidation;
    const { validateMenuItemDetails } = menuItemValidation;
    const nameInput = document.getElementById('edit-menu-name');
    const categoryInput = document.getElementById('edit-menu-category');
    const priceInput = document.getElementById('new-price');
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const editors = {
        details: { form: document.getElementById('edit-menu-form'), fields: [nameInput, categoryInput],
            save: document.getElementById('save-menu-details'), cancel: document.getElementById('cancel-menu-details'),
            error: document.getElementById('edit-menu-error'), status: document.getElementById('edit-menu-status') },
        price: { form: document.getElementById('price-form'), fields: [priceInput],
            save: document.getElementById('save-price'), cancel: document.getElementById('cancel-price'),
            error: document.getElementById('price-error'), status: document.getElementById('price-status') }
    };
    let selected = null;
    let saving = false;

    function close() {
        if (!selected) return;
        editors[selected.mode].form.hidden = true;
        const focus = selected.row.hidden ? document.getElementById('menu-search') : selected.button;
        selected = null;
        focus?.focus();
    }

    function setSaving(value) {
        saving = value;
        const editor = editors[selected.mode];
        editor.save.disabled = editor.cancel.disabled = value;
        editor.fields.forEach(field => { field.disabled = value; });
        document.querySelectorAll('.update-price, .edit-menu-item').forEach(button => { button.disabled = value; });
        editor.form.setAttribute('aria-busy', String(value));
        editor.save.textContent = value ? 'Saving…' : selected.mode === 'price' ? 'Save' : 'Save changes';
    }

    document.querySelector('.menu-management').addEventListener('click', event => {
        const button = event.target.closest('.update-price, .edit-menu-item');
        if (!button || saving) return;
        close();
        const row = button.closest('tr');
        const mode = button.matches('.update-price') ? 'price' : 'details';
        const name = row.querySelector('[data-item-name]').textContent;
        selected = { row, button, mode, id: button.dataset.menuItemId };
        Object.values(editors).forEach(editor => {
            editor.error.textContent = editor.status.textContent = '';
            editor.fields.forEach(field => field.removeAttribute('aria-invalid'));
        });
        nameInput.value = name;
        categoryInput.value = row.querySelector('[data-item-category]').textContent;
        priceInput.value = row.querySelector('.update-price').dataset.price;
        document.getElementById('selected-item').textContent = `${name} — Current price: ${currency.format(priceInput.value)}`;
        document.getElementById('edit-menu-selected').textContent = `Editing ${name}. Price and recipe stay unchanged.`;
        editors[mode].form.hidden = false;
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
            let body;
            if (mode === 'details') {
                const result = validateMenuItemDetails({ name: nameInput.value, category: categoryInput.value });
                if (result.error) {
                    editor.error.textContent = result.error;
                    const field = result.field === 'category' ? categoryInput : nameInput;
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
