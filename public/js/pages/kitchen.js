(() => {
    const tickets = document.getElementById('tickets');
    const lastUpdated = document.getElementById('last-updated');
    const largeTextBtn = document.getElementById('large-text-btn');
    const contrastBtn = document.getElementById('contrast-btn');
    const orderDetails = document.getElementById('order-details');
    const orderDetailsTitle = document.getElementById('order-details-title');
    const orderDetailsContent = document.getElementById('order-details-content');
    const orderDetailsClose = document.getElementById('order-details-close');
    let orders = [];

    function setPressed(button, storageKey, className, enabled) {
        document.documentElement.classList.toggle(className, enabled);
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        sessionStorage.setItem(storageKey, enabled ? 'on' : 'off');
    }

    largeTextBtn.addEventListener('click', () => {
        const enabled = largeTextBtn.getAttribute('aria-pressed') !== 'true';
        setPressed(largeTextBtn, 'kitchen-large-text', 'large-text', enabled);
    });

    contrastBtn.addEventListener('click', () => {
        const enabled = contrastBtn.getAttribute('aria-pressed') !== 'true';
        setPressed(contrastBtn, 'kitchen-contrast', 'high-contrast', enabled);
    });

    if (sessionStorage.getItem('kitchen-large-text') === 'on') {
        setPressed(largeTextBtn, 'kitchen-large-text', 'large-text', true);
    }
    if (sessionStorage.getItem('kitchen-contrast') === 'on') {
        setPressed(contrastBtn, 'kitchen-contrast', 'high-contrast', true);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (character) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function displayValue(value) {
        if (value === null || value === undefined || value === '') return '';
        if (typeof value === 'object') return Object.entries(value)
            .map(([key, item]) => `${key}: ${item}`)
            .join(', ');
        return String(value);
    }

    function customizationLines(customizations) {
        if (!customizations) return [];
        if (Array.isArray(customizations)) {
            return customizations.flatMap((customization) => {
                if (typeof customization === 'object') {
                    return Object.entries(customization).map(([key, value]) => `${key}: ${displayValue(value)}`);
                }
                return [displayValue(customization)];
            });
        }
        if (typeof customizations === 'object') {
            return Object.entries(customizations).map(([key, value]) => `${key}: ${displayValue(value)}`);
        }
        return [displayValue(customizations)];
    }

    function orderItems(order) {
        if (Array.isArray(order.items)) return order.items;
        if (order.items && typeof order.items === 'object') return Object.values(order.items);
        return [];
    }

    function itemMarkup(item) {
        const itemObject = typeof item === 'object' && item !== null ? item : { name: item };
        const name = itemObject.name || itemObject.item_name || itemObject.menu_item_name || 'Unnamed item';
        const quantity = itemObject.quantity || itemObject.qty || 1;
        const customizations = customizationLines(itemObject.customizations || itemObject.modifications || itemObject.modifiers);
        const instructions = itemObject.special_instructions || itemObject.instructions || itemObject.note;
        const customizationsMarkup = customizations.length
            ? `<div class="customizations">${customizations.map((line) => `<span><span class="customization-label">${escapeHtml(line.split(':')[0])}${line.includes(':') ? ':' : ''}</span>${line.includes(':') ? ` ${escapeHtml(line.slice(line.indexOf(':') + 1).trim())}` : ''}</span>`).join('')}</div>`
            : '';
        const instructionsMarkup = instructions
            ? `<p class="instructions">Note: ${escapeHtml(instructions)}</p>`
            : '';

        return `<li class="item">
            <div class="item-name"><span class="quantity">${escapeHtml(quantity)}×</span><span>${escapeHtml(name)}</span></div>
            ${customizationsMarkup}
            ${instructionsMarkup}
        </li>`;
    }

    function recipeMarkup(item) {
        const recipe = Array.isArray(item.recipe) ? item.recipe : [];
        if (recipe.length === 0) {
            return '<p class="no-recipe">No saved recipe for this drink.</p>';
        }
        return `<ul class="recipe-list">${recipe.map((ingredient) => `
            <li>
                <span>${escapeHtml(ingredient.ingredient || 'Unnamed ingredient')}</span>
                <strong>${escapeHtml(ingredient.quantity_required)} per drink</strong>
            </li>`).join('')}</ul>`;
    }

    function showOrderDetails(order) {
        const orderId = order.order_id ?? order.id ?? '—';
        orderDetailsTitle.textContent = `Order #${orderId}`;
        orderDetailsContent.innerHTML = orderItems(order).map((item) => {
            const name = item.name || item.item_name || item.menu_item_name || 'Unnamed item';
            const quantity = item.quantity || item.qty || 1;
            return `<section class="drink-details">
                <div class="drink-details-heading">
                    <h3>${escapeHtml(name)}</h3>
                    <span>${escapeHtml(quantity)}× ordered</span>
                </div>
                <h4>Recipe</h4>
                ${recipeMarkup(item)}
            </section>`;
        }).join('') || '<p class="no-recipe">No item details available.</p>';
        orderDetails.showModal();
        orderDetailsClose.focus();
    }

    function elapsedTime(timestamp) {
        const created = new Date(timestamp);
        if (Number.isNaN(created.getTime())) return 'Time unavailable';
        const minutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
        if (minutes < 1) return 'Just now';
        if (minutes === 1) return '1 min ago';
        return `${minutes} min ago`;
    }

    function ticketMarkup(order) {
        const items = orderItems(order);
        const source = order.source || 'POS';
        const timestamp = order.timestamp || order.created_at;
        const orderId = order.order_id ?? order.id;
        return `<article class="ticket" data-order-id="${escapeHtml(orderId ?? '')}" role="button" tabindex="0" aria-label="View details for order #${escapeHtml(orderId ?? '—')}">
            <header class="ticket-header">
                <div class="ticket-title-group">
                    <span class="order-number">#${escapeHtml(orderId ?? '—')}</span>
                    <span class="source">${escapeHtml(source)}</span>
                </div>
                <time class="elapsed" datetime="${escapeHtml(timestamp || '')}" title="${escapeHtml(timestamp || '')}">${escapeHtml(elapsedTime(timestamp))}</time>
            </header>
            <ul class="items">${items.length ? items.map(itemMarkup).join('') : '<li class="item">No item details available.</li>'}</ul>
            <footer class="ticket-footer">
                <button class="mark-ready" type="button" data-order-id="${escapeHtml(orderId ?? '')}">Mark Ready</button>
            </footer>
        </article>`;
    }

    function renderOrders() {
        tickets.innerHTML = orders.length
            ? orders.map(ticketMarkup).join('')
            : '<p class="empty">No pending orders in queue.</p>';
        lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }

    async function loadOrders() {
        try {
            const response = await fetch('/api/kitchen/orders');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to load orders.');
            orders = Array.isArray(data) ? data : [];
            renderOrders();
        } catch (error) {
            if (orders.length === 0) {
                tickets.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
                lastUpdated.textContent = 'Orders unavailable';
            } else {
                lastUpdated.textContent = `Refresh failed (${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`;
            }
        }
    }

    tickets.addEventListener('click', async (event) => {
        const button = event.target.closest('.mark-ready');
        if (!button) {
            const ticket = event.target.closest('.ticket');
            if (ticket) {
                const order = orders.find((candidate) => String(candidate.order_id ?? candidate.id) === ticket.dataset.orderId);
                if (order) showOrderDetails(order);
            }
            return;
        }
        if (button.disabled) return;

        const orderId = button.dataset.orderId;
        if (!orderId) {
            button.textContent = 'Order ID unavailable';
            button.disabled = true;
            return;
        }

        button.disabled = true;
        button.textContent = 'Updating...';
        try {
            const response = await fetch(`/api/kitchen/orders/${encodeURIComponent(orderId)}`, { method: 'PATCH' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to complete order.');
            orders = orders.filter((order) => String(order.order_id ?? order.id) !== orderId);
            renderOrders();
        } catch (error) {
            button.disabled = false;
            button.textContent = 'Mark Ready';
            button.insertAdjacentHTML('afterend', `<p class="error" role="alert">${escapeHtml(error.message)}</p>`);
        }
    });

    tickets.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const ticket = event.target.closest('.ticket');
        if (!ticket || event.target.closest('.mark-ready')) return;
        event.preventDefault();
        const order = orders.find((candidate) => String(candidate.order_id ?? candidate.id) === ticket.dataset.orderId);
        if (order) showOrderDetails(order);
    });

    orderDetailsClose.addEventListener('click', () => orderDetails.close());
    orderDetails.addEventListener('click', (event) => {
        if (event.target === orderDetails) orderDetails.close();
    });

    loadOrders();
    setInterval(() => {
        document.querySelectorAll('.elapsed').forEach((element, index) => {
            if (orders[index]) element.textContent = elapsedTime(orders[index].timestamp || orders[index].created_at);
        });
    }, 60000);
    setInterval(loadOrders, 30000);
})();
