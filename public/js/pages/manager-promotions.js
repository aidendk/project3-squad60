(() => {
    const form = document.getElementById('promotion-form');
    const list = document.getElementById('promotion-list');
    const status = document.getElementById('promotion-status');
    const submit = document.getElementById('promotion-submit');
    const type = document.getElementById('promo-type');
    const value = document.getElementById('promo-value');
    const valueLabel = document.getElementById('promo-value-label');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let loading = false;

    function updateValue() {
        const bogo = type.value === 'BOGO';
        value.disabled = bogo;
        value.max = type.value === 'FLAT' ? '999.99' : '100';
        valueLabel.textContent = type.value === 'FLAT' ? 'Discount ($ per drink)' : bogo ? 'Free drink (%)' : 'Discount (%)';
        if (bogo) value.value = '100';
    }
    type.addEventListener('change', updateValue);

    async function request(url, options) {
        const response = await fetch(url, options);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Unable to load deals. Please try again.');
        return body;
    }

    function render(promotions) {
        list.replaceChildren();
        if (!promotions.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No deals yet. Create your first special above.';
            list.append(empty);
        }
        promotions.forEach(promotion => {
            const card = document.createElement('article');
            card.className = 'promotion-card';
            const copy = document.createElement('div');
            const heading = document.createElement('h4');
            heading.textContent = promotion.title;
            const offer = document.createElement('p');
            offer.textContent = `${shopPromotions.promotionLabel(promotion)} · ${promotion.target_category === 'ALL' || !promotion.target_category ? 'All drinks' : promotion.target_category}`;
            const schedule = document.createElement('p');
            schedule.className = 'note';
            const day = promotion.day_of_week == null ? 'Every day' : days[promotion.day_of_week];
            const time = promotion.start_time ? `${promotion.start_time.slice(0, 5)}–${promotion.end_time.slice(0, 5)}` : 'All day';
            const dates = promotion.start_date || promotion.end_date
                ? ` · ${promotion.start_date || 'Any date'} through ${promotion.end_date || 'No end date'}` : '';
            schedule.textContent = `${day} · ${time} (America/Chicago)${dates}`;
            const state = document.createElement('span');
            state.className = 'workspace-badge';
            state.textContent = promotion.is_active ? 'Enabled · follows schedule' : 'Disabled';
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.textContent = promotion.is_active ? 'Disable' : 'Enable';
            toggle.setAttribute('aria-label', `${toggle.textContent} ${promotion.title}`);
            toggle.setAttribute('aria-pressed', String(promotion.is_active));
            toggle.addEventListener('click', async () => {
                toggle.disabled = true;
                try {
                    const result = await request(`/api/manager/promotions/${promotion.promo_id}/toggle`, { method: 'PATCH' });
                    promotion.is_active = result.is_active;
                    render(promotions);
                    status.textContent = `${promotion.title} ${result.is_active ? 'enabled' : 'disabled'}.`;
                    // Re-rendered button takes the prior control's focus.
                    list.querySelectorAll('button')[promotions.indexOf(promotion)].focus();
                } catch (error) {
                    status.textContent = error.message;
                    // A failed response may follow a committed write. Reload before retrying.
                    await load(false);
                }
            });
            copy.append(heading, offer, schedule, state);
            card.append(copy, toggle);
            list.append(card);
        });
    }

    async function load(showLoading = true) {
        if (loading) return;
        loading = true;
        if (showLoading) status.textContent = 'Loading deals...';
        try {
            render(await request('/api/manager/promotions'));
            if (showLoading) status.textContent = '';
            return true;
        } catch (error) {
            list.replaceChildren();
            status.textContent = error.message;
            return false;
        } finally { loading = false; }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        submit.disabled = true;
        status.textContent = 'Saving deal...';
        const data = Object.fromEntries(new FormData(form));
        data.discount_value = type.value === 'BOGO' ? 100 : data.discount_value;
        data.is_active = form.elements.is_active.checked;
        try {
            await request('/api/manager/promotions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
            form.reset();
            updateValue();
            const loaded = await load();
            if (loaded) status.textContent = 'Deal created. Enabled deals appear on the kiosk during their scheduled hours.';
        } catch (error) { status.textContent = error.message; }
        finally { submit.disabled = false; }
    });
    document.getElementById('promotions-reload').addEventListener('click', () => load());
    updateValue();
    load();
})();
