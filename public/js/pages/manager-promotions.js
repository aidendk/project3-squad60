(() => {
    const form = document.getElementById('promotion-form');
    const list = document.getElementById('promotion-list');
    const status = document.getElementById('promotion-status');
    const submit = document.getElementById('promotion-submit');
    const cancel = document.getElementById('promotion-cancel');
    const heading = document.getElementById('promotion-form-heading');
    const editingNote = document.getElementById('promotion-editing');
    const reload = document.getElementById('promotions-reload');
    const type = document.getElementById('promo-type');
    const value = document.getElementById('promo-value');
    const valueLabel = document.getElementById('promo-value-label');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let promotions = [];
    let editingId = null;
    let returnFocus = null;
    let busy = false;

    function updateValue() {
        const bogo = type.value === 'BOGO';
        value.disabled = busy || bogo;
        value.max = type.value === 'FLAT' ? '999.99' : '100';
        valueLabel.textContent = type.value === 'FLAT' ? 'Discount ($ per drink)' : bogo ? 'Free drink (%)' : 'Discount (%)';
        if (bogo) value.value = '100';
    }
    type.addEventListener('change', updateValue);

    function setBusy(saving) {
        busy = saving;
        form.setAttribute('aria-busy', String(saving));
        form.querySelectorAll('input, select, button').forEach(control => { control.disabled = saving; });
        list.querySelectorAll('button').forEach(control => { control.disabled = saving; });
        reload.disabled = saving;
        updateValue();
    }

    async function request(url, options) {
        let response, body;
        try {
            response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
            body = await response.json();
        } catch {
            throw new Error('Could not confirm the current deal data. Refresh deals before trying again.');
        }
        if (!response.ok) throw new Error(body.error || 'Unable to load deals. Please try again.');
        return body;
    }

    function resetEditor(focus = false) {
        editingId = null;
        form.reset();
        heading.textContent = 'Create a deal';
        submit.textContent = 'Create deal';
        cancel.hidden = editingNote.hidden = true;
        updateValue();
        if (focus) (returnFocus?.isConnected ? returnFocus : heading).focus();
        returnFocus = null;
    }

    function edit(promotion, button) {
        editingId = promotion.promo_id;
        returnFocus = button;
        for (const [name, fieldValue] of Object.entries(promotion)) {
            const field = form.elements.namedItem(name);
            if (!field) continue;
            if (field.type === 'checkbox') field.checked = fieldValue;
            else field.value = fieldValue ?? '';
        }
        updateValue();
        heading.textContent = 'Edit deal';
        editingNote.textContent = `Editing ${promotion.title} (deal #${promotion.promo_id}).`;
        submit.textContent = 'Save changes';
        cancel.hidden = editingNote.hidden = false;
        form.elements.title.focus();
        form.scrollIntoView({ block: 'nearest' });
    }

    function render() {
        list.replaceChildren();
        if (!promotions.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No deals yet. Create your first special above.';
            list.append(empty);
        }
        promotions.forEach(promotion => {
            const card = document.createElement('article');
            card.className = 'promotion-card';
            card.dataset.promotionId = promotion.promo_id;
            const copy = document.createElement('div');
            const title = document.createElement('h4');
            title.textContent = promotion.title;
            const offer = document.createElement('p');
            offer.textContent = `${shopPromotions.promotionLabel(promotion)} · ${promotion.target_category === 'ALL' || !promotion.target_category ? 'All drinks' : promotion.target_category}`;
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Deal details';
            const schedule = document.createElement('p');
            schedule.className = 'note';
            const day = promotion.day_of_week == null ? 'Every day' : days[promotion.day_of_week];
            const time = promotion.start_time ? `${promotion.start_time.slice(0, 5)}–${promotion.end_time.slice(0, 5)}` : 'All day';
            const dates = promotion.start_date || promotion.end_date
                ? ` · ${promotion.start_date || 'Any date'} through ${promotion.end_date || 'No end date'}` : ' · No date restrictions';
            schedule.textContent = `Deal #${promotion.promo_id} · ${day} · ${time} (America/Chicago)${dates}`;
            details.append(summary, schedule);
            const state = document.createElement('span');
            state.className = 'workspace-badge';
            state.textContent = promotion.is_active ? 'Enabled · follows schedule' : 'Disabled';
            const controls = document.createElement('div');
            controls.className = 'menu-row-actions';
            const addButton = (text, action, className = '') => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = className;
                button.textContent = text;
                button.dataset.action = action;
                button.setAttribute('aria-label', `${text} ${promotion.title}`);
                controls.append(button);
                return button;
            };
            const editButton = addButton('Edit', 'edit');
            editButton.setAttribute('aria-controls', 'promotion-form');
            editButton.addEventListener('click', () => { if (!busy) edit(promotion, editButton); });
            const toggle = addButton(promotion.is_active ? 'Disable' : 'Enable', 'toggle');
            toggle.setAttribute('aria-pressed', String(promotion.is_active));
            toggle.addEventListener('click', () => mutate(promotion, 'toggle'));
            addButton('Delete', 'delete', 'danger-action').addEventListener('click', () => mutate(promotion, 'delete'));
            copy.append(title, offer, details, state);
            card.append(copy, controls);
            list.append(card);
        });
    }

    async function load() {
        promotions = await request('/api/manager/promotions');
        render();
    }

    async function mutate(promotion, action) {
        if (busy) return;
        if (action === 'delete' && !window.confirm(`Delete "${promotion.title}"? It will stop applying to new orders.`)) return;
        setBusy(true);
        status.textContent = action === 'delete' ? 'Deleting deal...' : 'Updating deal...';
        try {
            await request(`/api/manager/promotions/${promotion.promo_id}${action === 'toggle' ? '/toggle' : ''}`, {
                method: action === 'delete' ? 'DELETE' : 'PATCH'
            });
            if (editingId === promotion.promo_id) resetEditor();
            await load();
            status.textContent = `${promotion.title} ${action === 'delete' ? 'deleted' : 'updated'}.`;
            const focus = list.querySelector(`[data-promotion-id="${promotion.promo_id}"] [data-action="${action}"]`)
                || list.querySelector('button') || reload;
            setBusy(false);
            focus.focus();
        } catch (error) {
            status.textContent = `${error.message} Refresh deals to check their current state before retrying.`;
        } finally { setBusy(false); }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const data = Object.fromEntries(new FormData(form));
        data.discount_value = type.value === 'BOGO' ? 100 : data.discount_value;
        data.is_active = form.elements.is_active.checked;
        const wasEditing = editingId !== null;
        setBusy(true);
        status.textContent = 'Saving deal...';
        try {
            await request(`/api/manager/promotions${wasEditing ? `/${editingId}` : ''}`, {
                method: wasEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
            resetEditor();
            await load();
            status.textContent = `Deal ${wasEditing ? 'updated' : 'created'}. Enabled deals appear on the kiosk during their scheduled hours.`;
            heading.focus();
        } catch (error) { status.textContent = error.message; }
        finally { setBusy(false); }
    });
    cancel.addEventListener('click', () => { if (!busy) resetEditor(true); });
    form.addEventListener('keydown', event => {
        if (event.key === 'Escape' && editingId !== null && !busy) { event.preventDefault(); resetEditor(true); }
    });
    async function refresh() {
        if (busy) return;
        setBusy(true);
        status.textContent = 'Loading deals...';
        try { await load(); status.textContent = ''; }
        catch (error) { status.textContent = error.message; }
        finally { setBusy(false); }
    }
    reload.addEventListener('click', refresh);
    updateValue();
    refresh();
})();
