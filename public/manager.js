(() => {
    const { parsePrice, parseItemId, priceMessage } = globalThis.menuPriceValidation;
    const form = document.getElementById('price-form');
    const input = document.getElementById('new-price');
    const error = document.getElementById('price-error');
    const status = document.getElementById('price-status');
    const save = document.getElementById('save-price');
    const cancel = document.getElementById('cancel-price');
    const buttons = () => document.querySelectorAll('.update-price');
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    let selected = null;
    let saving = false;

    function closeForm() {
        form.hidden = true;
        selected.button.focus();
        selected = null;
    }

    function setSaving(value) {
        saving = value;
        save.disabled = cancel.disabled = value;
        input.readOnly = value;
        buttons().forEach(button => { button.disabled = value; });
        form.setAttribute('aria-busy', String(value));
        save.textContent = value ? 'Saving…' : 'Save';
    }

    document.querySelector('.menu-management').addEventListener('click', event => {
        const button = event.target.closest('.update-price');
        if (!button) return;
        if (saving) return;
        const row = button.closest('tr');
        selected = { button, row, id: button.dataset.menuItemId, name: row.querySelector('[data-item-name]').textContent };
        input.value = button.dataset.price;
        input.removeAttribute('aria-invalid');
        error.textContent = status.textContent = '';
        document.getElementById('selected-item').textContent = `${selected.name} — Current price: ${currency.format(button.dataset.price)}`;
        form.hidden = false;
        input.focus();
        input.select();
    });

    cancel.addEventListener('click', () => { if (!saving) closeForm(); });
    form.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !saving) { event.preventDefault(); closeForm(); }
    });
    input.addEventListener('input', () => {
        input.removeAttribute('aria-invalid');
        error.textContent = '';
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (saving || !selected) return;
        const price = parsePrice(input.value);
        if (price === null || parseItemId(selected.id) === null) {
            error.textContent = price === null ? priceMessage : 'Invalid item ID. Reload the menu and try again.';
            input.setAttribute('aria-invalid', 'true');
            input.focus();
            return;
        }
        error.textContent = '';
        setSaving(true);
        try {
            const response = await fetch(`/api/menu/${selected.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price }),
                signal: AbortSignal.timeout(15000)
            });
            const item = await response.json();
            if (!response.ok) throw new Error(item.error || 'Unable to save the price. Please try again.');
            selected.row.querySelector('[data-item-price]').textContent = currency.format(item.price);
            selected.button.dataset.price = item.price;
            status.textContent = `Price for ${selected.name} saved at ${currency.format(item.price)}.`;
            setSaving(false);
            closeForm();
        } catch (err) {
            setSaving(false);
            error.textContent = err instanceof TypeError || err instanceof SyntaxError || err.name === 'TimeoutError'
                ? 'Could not confirm the save. Check your connection and reload the menu to check its current price before retrying.'
                : err.message;
            input.focus();
        }
    });
})();
