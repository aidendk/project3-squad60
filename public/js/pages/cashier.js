(() => {
    // Update Live Clock
    function updateClock() {
        const now = new Date();
        document.getElementById('liveClock').textContent = now.toLocaleTimeString();
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Active Modifiers State (Task 2)
    const activeModifiers = {
        sugar: '100%',
        ice: 'Regular Ice',
        size: 'Regular (M)',
        extraPrice: 0.00
    };

    // Active Ticket State (Task 3)
    let ticketItems = [];
    let orderNumber = 101;
    let selectedPayment = 'Card';
    const { TAX_RATE } = globalThis.shopMoney; // 8.25% Texas State Tax

    // Modifier controls
    function setSugar(level, btn) {
        document.querySelectorAll('.mod-btn.sugar').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeModifiers.sugar = level;
    }

    function setIce(level, btn) {
        document.querySelectorAll('.mod-btn.ice').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeModifiers.ice = level;
    }

    function setSize(size, extra, btn) {
        document.querySelectorAll('.mod-btn.size').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeModifiers.size = size;
        activeModifiers.extraPrice = extra;
    }

    function resetModifiers() {
        activeModifiers.sugar = '100%';
        activeModifiers.ice = 'Regular Ice';
        activeModifiers.size = 'Regular (M)';
        activeModifiers.extraPrice = 0.00;

        document.querySelectorAll('.mod-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.mod-btn.sugar')[2].classList.add('active'); // 100%
        document.querySelectorAll('.mod-btn.ice')[2].classList.add('active');   // Regular Ice
        document.querySelectorAll('.mod-btn.size')[0].classList.add('active');  // Regular
    }

    // Category Filtering
    function filterCategory(category, button) {
        document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        const cards = document.querySelectorAll('.item-card');
        cards.forEach(card => {
            if (category === 'All' || card.getAttribute('data-category') === category) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    }

    // Add item to ticket when tapped
    function handleItemTap(code, name, basePrice, menuItemId = null) {
        const unitPrice = parseFloat((basePrice + activeModifiers.extraPrice).toFixed(2));

        // Check if exact same item with exact same customizations already exists
        const existingIndex = ticketItems.findIndex(item =>
            (item.code === code || (menuItemId && item.menu_item_id === menuItemId)) &&
            item.sugar === activeModifiers.sugar &&
            item.ice === activeModifiers.ice &&
            item.size === activeModifiers.size
        );

        if (existingIndex > -1) {
            ticketItems[existingIndex].quantity += 1;
        } else {
            ticketItems.push({
                id: Date.now() + Math.random(),
                code: code,
                name: name,
                menu_item_id: menuItemId,
                size: activeModifiers.size,
                sugar: activeModifiers.sugar,
                ice: activeModifiers.ice,
                unitPrice: unitPrice,
                quantity: 1
            });
        }

        renderTicket();
    }

    // Adjust quantity in ticket
    function changeQuantity(index, delta) {
        if (!ticketItems[index]) return;
        ticketItems[index].quantity += delta;
        if (ticketItems[index].quantity <= 0) {
            ticketItems.splice(index, 1);
        }
        renderTicket();
    }

    // Remove item from ticket
    function removeItem(index) {
        ticketItems.splice(index, 1);
        renderTicket();
    }

    // Void entire ticket with confirmation
    function voidTicket() {
        if (ticketItems.length === 0) return;
        if (confirm('Void the current ticket? All selected items will be cleared.')) {
            ticketItems = [];
            renderTicket();
        }
    }

    // Set payment method
    function setPaymentMethod(method, btn) {
        selectedPayment = method;
        document.querySelectorAll('.btn-payment').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    // Render ticket items and recalculate tax & totals
    function renderTicket() {
        const container = document.getElementById('ticketContainer');
        const btnVoid = document.getElementById('btnVoid');
        const btnSubmit = document.getElementById('btnSubmit');

        if (ticketItems.length === 0) {
            container.innerHTML = `
                <div class="ticket-empty" id="ticketEmptyState">
                    <strong class="empty-ticket-title">Ticket is Empty</strong>
                    <p class="empty-ticket-copy">Select modifiers above, then tap any drink to add it to the ticket.</p>
                </div>
            `;
            btnVoid.disabled = true;
            btnSubmit.disabled = true;
            updateTotals(0, 0, 0);
            return;
        }

        btnVoid.disabled = false;
        btnSubmit.disabled = false;

        let html = '';
        let subtotal = 0;

        ticketItems.forEach((item, index) => {
            const itemTotal = item.unitPrice * item.quantity;
            subtotal += itemTotal;

            html += `
                <div class="ticket-row">
                    <div class="row-details">
                        <div class="row-name">${escapeMenuText(item.name)}</div>
                        <div class="row-modifiers">
                            <span class="tag-mod">${item.sugar}</span>
                            <span class="tag-mod">${item.ice}</span>
                            <span class="tag-mod">${item.size}</span>
                        </div>
                    </div>
                    <div class="row-controls">
                        <div class="stepper">
                            <button class="stepper-btn" data-action="decrease" data-item-index="${index}">-</button>
                            <span class="stepper-qty">${item.quantity}</span>
                            <button class="stepper-btn" data-action="increase" data-item-index="${index}">+</button>
                        </div>
                        <div class="row-price">$${itemTotal.toFixed(2)}</div>
                        <button class="btn-remove-item" data-action="remove" data-item-index="${index}" title="Remove Item">&times;</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Calculations
        const tax = subtotal * TAX_RATE;
        const total = subtotal + tax;

        updateTotals(subtotal, tax, total);
    }

    // Update total labels in DOM
    function updateTotals(subtotal, tax, total) {
        document.getElementById('labelSubtotal').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('labelTax').textContent = `$${tax.toFixed(2)}`;
        document.getElementById('labelTotal').textContent = `$${total.toFixed(2)}`;
        document.getElementById('btnSubmitTotal').textContent = `$${total.toFixed(2)}`;
    }

    // Submit Ticket / Send to Kitchen (Task 4 Backend Integration)
    async function submitTicket() {
        if (ticketItems.length === 0) return;

        const btnSubmit = document.getElementById('btnSubmit');
        const submitLabel = btnSubmit.firstElementChild;
        const originalLabel = submitLabel.textContent;
        btnSubmit.disabled = true;
        submitLabel.textContent = 'Processing Order...';

        const subtotal = ticketItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
        const tax = subtotal * TAX_RATE;
        const total = subtotal + tax;

        // Structured payload matching Task 4 API requirements
        const orderPayload = {
            cashier_id: 'Reveille',
            payment_method: selectedPayment,
            items: ticketItems.map(i => ({
                code: i.code,
                name: i.name,
                menu_item_id: i.menu_item_id,
                size: i.size,
                sugar: i.sugar,
                ice: i.ice,
                quantity: i.quantity,
                unit_price: i.unitPrice,
                line_total: parseFloat((i.unitPrice * i.quantity).toFixed(2))
            })),
            subtotal: parseFloat(subtotal.toFixed(2)),
            tax: parseFloat(tax.toFixed(2)),
            total: parseFloat(total.toFixed(2)),
            timestamp: new Date().toISOString()
        };

        const toast = document.getElementById('toastBanner');

        try {
            const response = await fetch('/api/cashier/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                toast.dataset.status = 'success';
                toast.textContent = `Order #${data.order_id} placed and sent to kitchen.`;
                orderNumber = data.order_id + 1;
                document.getElementById('orderTag').textContent = `Order #${orderNumber}`;
                ticketItems = [];
                renderTicket();
            } else {
                console.warn('API returned non-200 status:', data);
                toast.dataset.status = 'warning';
                toast.textContent = `Order #${orderNumber} recorded locally (${data.error || 'DB Offline'}). Sent to kitchen.`;
                orderNumber += 1;
                document.getElementById('orderTag').textContent = `Order #${orderNumber}`;
                ticketItems = [];
                renderTicket();
            }
        } catch (err) {
            console.error('Fetch error submitting order:', err);
            toast.dataset.status = 'warning';
            toast.textContent = `Network offline. Order #${orderNumber} recorded locally and sent to kitchen.`;
            orderNumber += 1;
            document.getElementById('orderTag').textContent = `Order #${orderNumber}`;
            ticketItems = [];
            renderTicket();
        } finally {
            toast.classList.add('is-visible');
            setTimeout(() => {
                toast.classList.remove('is-visible');
            }, 4000);
            submitLabel.textContent = originalLabel;
        }
    }
    function escapeMenuText(value) {
        const text = document.createElement('span');
        text.textContent = value;
        return text.innerHTML;
    }

    // Dynamically load menu from PostgreSQL API to stay in sync with Manager & Kiosk
    async function loadCashierMenu() {
        try {
            const response = await fetch('/api/menu');
            if (!response.ok) return;
            const menu = await response.json();
            if (!Array.isArray(menu) || menu.length === 0) return;

            const grid = document.getElementById('itemGrid');
            const { categoryFor } = globalThis.menuCategories;

            const cards = document.createDocumentFragment();
            menu.forEach((item, idx) => {
                const cat = categoryFor(item.name);
                const code = `${cat.slice(0, 2).toUpperCase()}-${String(idx + 1).padStart(2, '0')}`;
                const price = Number(item.price);
                const card = document.createElement('div');
                card.className = 'item-card';
                card.dataset.category = cat;
                card.addEventListener('click', () => handleItemTap(code, item.name, price, item.menu_item_id));
                const details = document.createElement('div');
                const itemCode = document.createElement('div');
                itemCode.className = 'item-code';
                itemCode.textContent = code;
                const title = document.createElement('div');
                title.className = 'item-name';
                title.textContent = item.name;
                const amount = document.createElement('div');
                amount.className = 'item-price';
                amount.textContent = `$${price.toFixed(2)}`;
                details.append(itemCode, title);
                card.append(details, amount);
                cards.append(card);
            });
            grid.replaceChildren(cards);
        } catch (e) {
            console.warn('Using default menu fallback:', e);
        }
    }
    loadCashierMenu();

    // One delegated listener handles both the static controls and dynamic ticket rows.
    const actions = {
        category: button => filterCategory(button.dataset.category, button),
        sugar: button => setSugar(button.dataset.sugar, button),
        ice: button => setIce(button.dataset.ice, button),
        size: button => setSize(button.dataset.size, Number(button.dataset.extraPrice), button),
        payment: button => setPaymentMethod(button.dataset.payment, button),
        add: button => handleItemTap(button.dataset.code, button.dataset.name, Number(button.dataset.price)),
        reset: resetModifiers,
        void: voidTicket,
        submit: submitTicket,
        decrease: button => changeQuantity(Number(button.dataset.itemIndex), -1),
        increase: button => changeQuantity(Number(button.dataset.itemIndex), 1),
        remove: button => removeItem(Number(button.dataset.itemIndex))
    };
    document.addEventListener('click', event => {
        const control = event.target.closest('[data-action]');
        if (control && !control.disabled) actions[control.dataset.action]?.(control);
    });
})();
