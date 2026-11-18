(() => {
    const body = document.getElementById('inventory-body');
    if (!body) return;
    const form = document.getElementById('inventory-edit-form');
    const fields = document.getElementById('inventory-edit-fields');
    const status = document.getElementById('inventory-status');
    const error = document.getElementById('inventory-error');
    const add = document.getElementById('inventory-add');
    const save = document.getElementById('inventory-save');
    let selected = null;
    let busy = false;
    let creating = false;

    function close(focus = true) {
        form.hidden = true;
        if (focus) (creating ? add : selected?.querySelector('button'))?.focus();
        selected = null;
        creating = false;
    }
    function setBusy(value) {
        busy = fields.disabled = value;
        form.setAttribute('aria-busy', String(value));
        add.disabled = value;
        save.textContent = value ? 'Saving...' : creating ? 'Add ingredient' : 'Save changes';
        body.querySelectorAll('button').forEach(button => { button.disabled = value; });
    }
    function updateSummary() {
        const count = body.querySelectorAll('[data-stock-status="low"]').length;
        document.getElementById('inventory-alert-count').textContent = count;
        document.querySelector('.inventory-summary span').textContent = `${count === 1 ? 'ingredient needs' : 'ingredients need'} attention`;
        document.querySelector('#inventory .workspace-badge').textContent = `${body.rows.length} ${body.rows.length === 1 ? 'ingredient' : 'ingredients'}`;
        const stockLink = document.querySelector('[href="#inventory"][data-manager-link]');
        let badge = stockLink.querySelector('.nav-count');
        if (count && !badge) { badge = document.createElement('span'); badge.className = 'nav-count'; stockLink.append(badge); }
        if (badge) {
            badge.textContent = count;
            badge.setAttribute('aria-label', `${count} low-stock ingredients`);
            badge.hidden = count === 0;
        }
        document.querySelector('.sidebar-note p').textContent = count
            ? `${count} ${count === 1 ? 'ingredient is' : 'ingredients are'} below their reorder thresholds.`
            : 'No ingredients are below their reorder thresholds.';
        body.closest('.table-scroll').hidden = body.rows.length === 0;
        document.getElementById('inventory-empty').hidden = body.rows.length > 0;
        const menuFields = document.getElementById('add-menu-fields');
        const canAddMenuItem = menuFields.dataset.menuAvailable === 'true' && body.rows.length > 0;
        menuFields.disabled = !canAddMenuItem || document.getElementById('add-menu-form').getAttribute('aria-busy') === 'true';
        document.getElementById('menu-data-warning').hidden = canAddMenuItem;
    }
    function syncIngredient(id, name) {
        // Keep both active recipe editors and future cloned rows current.
        const template = document.getElementById('recipe-row-template');
        const selects = [...document.querySelectorAll('[data-ingredient]'), ...template.content.querySelectorAll('[data-ingredient]')];
        selects.forEach(select => {
            let option = [...select.options].find(option => option.value === String(id));
            if (name === null) { option?.remove(); return; }
            if (!option) {
                option = document.createElement('option');
                option.value = id;
                select.append(option);
            }
            option.textContent = name;
        });
    }
    function updateRow(row, item) {
        row.dataset.inventoryItemId = item.inventory_item_id;
        row.querySelector('[data-inventory-name]').textContent = item.name;
        row.querySelector('[data-inventory-quantity]').textContent = item.current_fill_level;
        row.querySelector('[data-inventory-threshold]').textContent = item.reorder_threshold;
        const low = Number(item.current_fill_level) < Number(item.reorder_threshold);
        row.dataset.stockStatus = low ? 'low' : 'ok';
        row.classList.toggle('low-stock', low);
        row.querySelector('[data-inventory-status]').textContent = low ? 'Low stock' : 'In stock';
        row.querySelector('.edit-inventory-item').setAttribute('aria-label', `Edit ${item.name}`);
        row.querySelector('.delete-inventory-item').setAttribute('aria-label', `Delete ${item.name}`);
    }
    function appendRow(item) {
        const row = document.createElement('tr');
        for (const [index, field] of ['name', 'quantity', 'threshold', 'status'].entries()) {
            const cell = document.createElement(index === 0 ? 'th' : 'td');
            if (index === 0) cell.scope = 'row';
            cell.dataset[`inventory${field[0].toUpperCase()}${field.slice(1)}`] = '';
            row.append(cell);
        }
        const actions = document.createElement('td');
        const controls = document.createElement('div');
        controls.className = 'menu-row-actions';
        for (const action of ['edit', 'delete']) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `${action}-inventory-item manager-action${action === 'delete' ? ' danger-action' : ''}`;
            button.textContent = action === 'edit' ? 'Edit' : 'Delete';
            if (action === 'edit') button.setAttribute('aria-controls', 'inventory-edit-form');
            controls.append(button);
        }
        actions.append(controls);
        row.append(actions);
        updateRow(row, item);
        body.append(row);
    }
    async function request(id, options) {
        let response, result;
        try {
            response = await fetch(`/api/manager/inventory${id == null ? '' : `/${id}`}`, { ...options, signal: AbortSignal.timeout(15000) });
            result = await response.json();
        } catch {
            throw new Error('Could not confirm the change. Reload inventory before trying again.');
        }
        if (!response.ok) throw new Error(result.error || 'Unable to update inventory.');
        return result;
    }
    add.addEventListener('click', () => {
        if (busy) return;
        selected = null;
        creating = true;
        form.reset();
        form.elements.current_fill_level.value = '0';
        form.elements.reorder_threshold.value = '20';
        document.getElementById('inventory-edit-heading').textContent = 'Add ingredient';
        save.textContent = 'Add ingredient';
        status.textContent = error.textContent = '';
        form.hidden = false;
        form.elements.name.focus();
    });
    body.addEventListener('click', async event => {
        const button = event.target.closest('button');
        if (!button || busy) return;
        const row = button.closest('tr');
        const id = row.dataset.inventoryItemId;
        const name = row.querySelector('[data-inventory-name]').textContent;
        status.textContent = error.textContent = '';
        if (button.matches('.edit-inventory-item')) {
            creating = false;
            selected = row;
            save.textContent = 'Save changes';
            form.elements.name.value = name;
            form.elements.current_fill_level.value = row.querySelector('[data-inventory-quantity]').textContent;
            form.elements.reorder_threshold.value = row.querySelector('[data-inventory-threshold]').textContent;
            document.getElementById('inventory-edit-heading').textContent = `Edit ${name}`;
            form.hidden = false;
            form.elements.name.focus();
            return;
        }
        if (!button.matches('.delete-inventory-item') || !window.confirm(`Delete "${name}" from inventory? Ingredients used in recipes cannot be deleted.`)) return;
        setBusy(true);
        try {
            await request(id, { method: 'DELETE' });
            if (selected === row) close(false);
            row.remove();
            syncIngredient(id, null);
            updateSummary();
            status.textContent = `${name} deleted.`;
            setBusy(false);
            (body.querySelector('button') || document.getElementById('inventory-heading')).focus();
        } catch (failure) { error.textContent = failure.message; }
        finally { setBusy(false); }
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || (!creating && !selected)) return;
        const adding = creating;
        const data = {
            name: form.elements.name.value.trim(),
            current_fill_level: Number(form.elements.current_fill_level.value),
            reorder_threshold: Number(form.elements.reorder_threshold.value)
        };
        setBusy(true);
        error.textContent = status.textContent = '';
        try {
            const item = await request(adding ? null : selected.dataset.inventoryItemId, {
                method: adding ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
            if (adding) appendRow(item);
            else updateRow(selected, item);
            syncIngredient(item.inventory_item_id, item.name);
            updateSummary();
            status.textContent = adding ? `${item.name} added. It is now available in menu recipes.` : `${item.name} saved.`;
            setBusy(false);
            close();
        } catch (failure) { error.textContent = failure.message; }
        finally { setBusy(false); }
    });
    document.getElementById('inventory-cancel').addEventListener('click', () => { if (!busy) close(); });
    form.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); }
    });
})();
