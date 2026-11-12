(() => {
    const { imageFor, kioskCategoryFor: categoryFor } = globalThis.menuCategories;
    const menuGrid = document.getElementById('menu-grid');
    const menuStatus = document.getElementById('menu-status');
    const menuHeading = document.getElementById('menu-heading');
    const tablist = document.querySelector('.category-tabs');
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const largeTextBtn = document.getElementById('large-text-btn');
    const contrastBtn = document.getElementById('contrast-btn');
    const kioskShell = document.querySelector('.kiosk-shell');
    const kioskHeader = document.querySelector('.kiosk-header');
    let activeCategory = 'Milk Tea';
    let menuDrinks = [];

    function selectCategory(category) {
        activeCategory = category;
        menuHeading.textContent = category;
        tabs.forEach((tab) => {
            const selected = tab.dataset.category === category;
            tab.setAttribute('aria-selected', selected ? 'true' : 'false');
            tab.tabIndex = selected ? 0 : -1;
            if (selected) {
                menuGrid.setAttribute('aria-labelledby', tab.id);
            }
        });
        renderMenu();
    }

    function setPressed(button, storageKey, className, enabled) {
        document.documentElement.classList.toggle(className, enabled);
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        sessionStorage.setItem(storageKey, enabled ? 'on' : 'off');
    }

    function setBackgroundHidden(hidden) {
        kioskShell.toggleAttribute('aria-hidden', hidden);
        kioskHeader.toggleAttribute('aria-hidden', hidden);
    }

    tablist.addEventListener('click', (event) => {
        const tab = event.target.closest('[role="tab"]');
        if (!tab) {
            return;
        }
        selectCategory(tab.dataset.category);
    });

    tablist.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
            return;
        }
        const index = tabs.indexOf(document.activeElement);
        if (index === -1) {
            return;
        }
        event.preventDefault();
        const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
        const nextIndex = forward
            ? (index + 1) % tabs.length
            : (index - 1 + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        selectCategory(tabs[nextIndex].dataset.category);
    });

    largeTextBtn.addEventListener('click', () => {
        const enabled = largeTextBtn.getAttribute('aria-pressed') !== 'true';
        setPressed(largeTextBtn, 'kiosk-large-text', 'large-text', enabled);
    });

    contrastBtn.addEventListener('click', () => {
        const enabled = contrastBtn.getAttribute('aria-pressed') !== 'true';
        setPressed(contrastBtn, 'kiosk-contrast', 'high-contrast', enabled);
    });

    if (sessionStorage.getItem('kiosk-large-text') === 'on') {
        setPressed(largeTextBtn, 'kiosk-large-text', 'large-text', true);
    }
    if (sessionStorage.getItem('kiosk-contrast') === 'on') {
        setPressed(contrastBtn, 'kiosk-contrast', 'high-contrast', true);
    }

    const { TAX_RATE, roundMoney, formatMoney } = globalThis.shopMoney;
    const cartItems = document.getElementById('cart-items');
    const cartEmpty = document.getElementById('cart-empty');
    const cartStatus = document.getElementById('cart-status');
    const subtotalEl = document.getElementById('subtotal');
    const taxEl = document.getElementById('tax');
    const rewardRow = document.getElementById('reward-row');
    const rewardAmount = document.getElementById('reward-amount');
    const redeemSection = document.getElementById('redeem');
    const rewardListEl = document.getElementById('reward-list');
    const pointsLabel = document.getElementById('points-label');
    const currentPoints = document.getElementById('current-points');
    const bagCount = document.getElementById('bag-count');
    const checkoutBtn = document.getElementById('checkout-btn');
    const checkoutLabel = document.getElementById('checkout-label');
    const checkoutTotal = document.getElementById('checkout-total');
    const checkoutSheet = document.getElementById('checkout-sheet');
    const checkoutBack = document.getElementById('checkout-back');
    const cart = new Map();
    let checkoutReturnFocus = null;
    let customer = null;
    let selectedRewardId = null;
    let checkedInTimer = null;

    function cartTotals() {
        const subtotal = roundMoney(
            [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0)
        );
        const applied = customer && selectedRewardId
            ? kioskRewards.applyReward(subtotal, selectedRewardId)
            : { discount: 0, points: 0 };
        const discount = applied ? applied.discount : 0;
        const discounted = roundMoney(subtotal - discount);
        const tax = roundMoney(discounted * TAX_RATE);
        return {
            subtotal,
            discount,
            tax,
            total: roundMoney(discounted + tax),
            points: applied ? applied.points : 0
        };
    }

    function renderCart() {
        cartItems.replaceChildren();
        const totals = cartTotals();
        const count = [...cart.values()].reduce((sum, item) => sum + item.quantity, 0);
        cartEmpty.hidden = cart.size > 0;
        subtotalEl.textContent = formatMoney(totals.subtotal);
        rewardRow.hidden = totals.discount <= 0;
        rewardAmount.textContent = `−${formatMoney(totals.discount)}`;
        taxEl.textContent = formatMoney(totals.tax);
        bagCount.hidden = count === 0;
        bagCount.textContent = String(count);
        if (count > 0) {
            bagCount.setAttribute('aria-label', `${count} in your order`);
        }

        cart.forEach((item) => {
            const row = document.createElement('li');
            row.className = 'cart-row';

            const thumb = document.createElement('img');
            thumb.className = 'bag-thumb';
            thumb.alt = '';
            thumb.src = item.image || imageFor(item.name);

            const body = document.createElement('div');
            body.className = 'cart-row-body';

            const top = document.createElement('div');
            top.className = 'cart-row-top';
            const name = document.createElement('span');
            name.textContent = item.name;
            const lineTotal = document.createElement('span');
            lineTotal.className = 'line-total';
            lineTotal.textContent = formatMoney(item.price * item.quantity);
            top.append(name, lineTotal);

            const controls = document.createElement('div');
            controls.className = 'cart-controls';

            const decrease = document.createElement('button');
            decrease.type = 'button';
            decrease.className = 'qty-btn';
            decrease.textContent = '−';
            decrease.setAttribute('aria-label', `Decrease ${item.name}`);
            decrease.addEventListener('click', () => changeQuantity(item.menu_item_id, -1));

            const qty = document.createElement('span');
            qty.className = 'qty';
            qty.textContent = String(item.quantity);

            const increase = document.createElement('button');
            increase.type = 'button';
            increase.className = 'qty-btn';
            increase.textContent = '+';
            increase.setAttribute('aria-label', `Increase ${item.name}`);
            increase.disabled = item.quantity >= 20;
            increase.addEventListener('click', () => changeQuantity(item.menu_item_id, 1));

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'remove-btn';
            remove.textContent = 'Remove';
            remove.setAttribute('aria-label', `Remove ${item.name}`);
            remove.addEventListener('click', () => {
                cart.delete(item.menu_item_id);
                cartStatus.textContent = `Removed ${item.name}. Total ${formatMoney(cartTotals().total)}.`;
                renderCart();
            });

            controls.append(decrease, qty, increase, remove);
            body.append(top, controls);
            row.append(thumb, body);
            cartItems.append(row);
        });

        updatePlaceOrderState();
    }

    function changeQuantity(menuItemId, delta) {
        const item = cart.get(menuItemId);
        if (!item) {
            return;
        }
        const nextQuantity = item.quantity + delta;
        if (nextQuantity <= 0) {
            cart.delete(menuItemId);
            cartStatus.textContent = `Removed ${item.name}. Total ${formatMoney(cartTotals().total)}.`;
        } else if (nextQuantity <= 20) {
            item.quantity = nextQuantity;
            cartStatus.textContent = `${item.name} quantity ${item.quantity}. Total ${formatMoney(cartTotals().total)}.`;
        }
        renderCart();
    }

    function addToCart(drink) {
        const existing = cart.get(drink.menu_item_id);
        if (existing) {
            if (existing.quantity >= 20) {
                cartStatus.textContent = 'You can add up to 20 of each drink.';
                return;
            }
            existing.quantity += 1;
        } else {
            cart.set(drink.menu_item_id, {
                menu_item_id: drink.menu_item_id,
                name: drink.name,
                price: drink.price,
                image: drink.image,
                quantity: 1
            });
        }
        cartStatus.textContent = `Added ${drink.name}. Total ${formatMoney(cartTotals().total)}.`;
        renderCart();
    }

    function renderMenu() {
        menuGrid.replaceChildren();
        const visibleDrinks = menuDrinks
            .filter((drink) => drink.category === activeCategory)
            .sort((a, b) => a.name.localeCompare(b.name));

        if (visibleDrinks.length === 0) {
            menuStatus.textContent = menuDrinks.length === 0
                ? menuStatus.textContent
                : 'No drinks in this category.';
            return;
        }

        menuStatus.textContent = `${visibleDrinks.length} drinks`;
        visibleDrinks.forEach((drink) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'drink-card';
            card.dataset.id = String(drink.menu_item_id);
            card.dataset.price = drink.price.toFixed(2);
            card.dataset.category = drink.category;
            card.setAttribute('aria-label', `Add ${drink.name}, ${formatMoney(drink.price)}`);

            const photo = document.createElement('span');
            photo.className = 'drink-photo';
            const img = document.createElement('img');
            img.alt = '';
            img.src = imageFor(drink.name);
            const add = document.createElement('span');
            add.className = 'add-mark';
            add.setAttribute('aria-hidden', 'true');
            add.textContent = '+';
            photo.append(img, add);

            const copy = document.createElement('span');
            copy.className = 'drink-copy';
            const name = document.createElement('span');
            name.className = 'drink-name';
            name.textContent = drink.name;
            const price = document.createElement('span');
            price.className = 'drink-price';
            price.textContent = formatMoney(drink.price);
            copy.append(name, price);

            card.append(photo, copy);
            menuGrid.append(card);
        });
    }

    async function loadMenu() {
        menuStatus.textContent = 'Loading drinks...';
        menuStatus.classList.remove('error');
        try {
            const response = await fetch('/api/menu');
            if (!response.ok) {
                throw new Error('Menu request failed');
            }
            const menu = await response.json();
            menuDrinks = menu
                .map((item) => ({
                    menu_item_id: item.menu_item_id,
                    name: item.name,
                    price: Number(item.price),
                    category: categoryFor(item.name)
                }))
                .filter((item) => item.category);
            renderMenu();
        } catch (err) {
            menuDrinks = [];
            menuGrid.replaceChildren();
            menuStatus.textContent = 'The menu could not be loaded. Please try again.';
            menuStatus.classList.add('error');
        }
    }

    const orderForm = document.getElementById('order-form');
    const customerNameInput = document.getElementById('customer-name');
    const placeOrderBtn = document.getElementById('place-order-btn');
    const formStatus = document.getElementById('form-status');
    const confirmation = document.getElementById('confirmation');
    const confirmationNumber = document.getElementById('confirmation-number');
    const confirmationMessage = document.getElementById('confirmation-message');
    const newOrderBtn = document.getElementById('new-order-btn');

    function updatePlaceOrderState() {
        const totals = cartTotals();
        checkoutBtn.disabled = cart.size === 0;
        checkoutLabel.textContent = cart.size === 0 ? 'Add a drink' : 'Checkout';
        checkoutTotal.hidden = cart.size === 0;
        checkoutTotal.textContent = formatMoney(totals.total);
        placeOrderBtn.disabled = customerNameInput.value.trim() === '';
        if (cart.size === 0) {
            checkoutSheet.hidden = true;
            if (confirmation.hidden) {
                setBackgroundHidden(false);
            }
        }
    }

    function openCheckout() {
        if (cart.size === 0) {
            return;
        }
        checkoutReturnFocus = document.activeElement;
        formStatus.textContent = '';
        checkoutSheet.hidden = false;
        setBackgroundHidden(true);
        customerNameInput.focus();
    }

    function closeCheckout() {
        checkoutSheet.hidden = true;
        if (confirmation.hidden) {
            setBackgroundHidden(false);
        }
        if (checkoutReturnFocus && typeof checkoutReturnFocus.focus === 'function') {
            checkoutReturnFocus.focus();
        }
    }

    customerNameInput.addEventListener('input', updatePlaceOrderState);
    checkoutBtn.addEventListener('click', openCheckout);
    checkoutBack.addEventListener('click', closeCheckout);
    checkoutSheet.addEventListener('click', (event) => {
        if (event.target === checkoutSheet) {
            closeCheckout();
        }
    });
    checkoutSheet.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeCheckout();
            return;
        }
        if (event.key !== 'Tab') {
            return;
        }
        const focusable = [...checkoutSheet.querySelectorAll('button, input')].filter((el) => !el.disabled);
        if (focusable.length === 0) {
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    orderForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const customerName = customerNameInput.value.trim();
        const totals = cartTotals();
        if (!customerName || cart.size === 0) {
            formStatus.textContent = 'Add a drink and enter a name before placing the order.';
            formStatus.classList.remove('ok');
            return;
        }

        placeOrderBtn.disabled = true;
        formStatus.textContent = 'Sending order...';
        formStatus.classList.remove('ok');

        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: [...cart.values()].map((item) => ({
                        menu_item_id: item.menu_item_id,
                        quantity: item.quantity
                    })),
                    customer_name: customerName,
                    total_price: totals.total,
                    order_source: 'kiosk',
                    ...(customer ? { customer_id: customer.customerId } : {}),
                    ...(customer && selectedRewardId ? { reward_id: selectedRewardId } : {})
                })
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error || 'The order could not be saved.');
            }

            if (customer && body.points_remaining != null) {
                customer.points = body.points_remaining;
                currentPoints.textContent = String(body.points_remaining);
                selectedRewardId = null;
                renderRewards();
            }

            confirmationNumber.textContent = `#${body.order_id}`;
            confirmationMessage.textContent = `Thanks, ${body.customer_name}. We'll call you when it's ready. Total ${formatMoney(body.total_price)}.${
                customer && body.points_remaining != null ? ` Current points: ${body.points_remaining}.` : ''
            }`;
            checkoutSheet.hidden = true;
            confirmation.hidden = false;
            setBackgroundHidden(true);
            cartStatus.textContent = confirmationMessage.textContent;
            newOrderBtn.focus();
        } catch (err) {
            formStatus.textContent = err.message;
            formStatus.classList.remove('ok');
            updatePlaceOrderState();
        }
    });

    newOrderBtn.addEventListener('click', () => {
        cart.clear();
        customerNameInput.value = customer ? customer.customerName : '';
        formStatus.textContent = '';
        cartStatus.textContent = '';
        confirmation.hidden = true;
        setBackgroundHidden(false);
        renderCart();
        const selectedTab = tablist.querySelector('[aria-selected="true"]');
        if (selectedTab) {
            selectedTab.focus();
        }
    });

    menuGrid.addEventListener('click', (event) => {
        const card = event.target.closest('.drink-card');
        if (!card) {
            return;
        }
        addToCart({
            menu_item_id: Number(card.dataset.id),
            name: card.querySelector('.drink-name').textContent,
            price: Number(card.dataset.price),
            image: card.querySelector('img').getAttribute('src')
        });
    });

    const checkIn = document.getElementById('check-in');
    const checkInForm = document.getElementById('check-in-form');
    const codeInput = document.getElementById('customer-code');
    const checkInStatus = document.getElementById('check-in-status');
    const checkInSubmit = document.getElementById('check-in-submit');
    const skipCode = document.getElementById('skip-code');
    const checkedIn = document.getElementById('checked-in');
    const checkedInLine = document.getElementById('checked-in-line');
    const welcome = document.getElementById('welcome');
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomePoints = document.getElementById('welcome-points');
    const welcomeContinue = document.getElementById('welcome-continue');

    function renderRewards() {
        if (!customer) {
            redeemSection.hidden = true;
            rewardListEl.replaceChildren();
            return;
        }
        const selected = (customer.rewards || []).find((reward) => reward.id === selectedRewardId);
        if (selected && customer.points < selected.points) {
            selectedRewardId = null;
        }
        redeemSection.hidden = false;
        rewardListEl.replaceChildren();
        (customer.rewards || []).forEach((reward) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reward-btn';
            const pressed = selectedRewardId === reward.id;
            button.disabled = customer.points < reward.points;
            button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
            button.textContent = `${reward.label} · ${reward.points} points · ${formatMoney(reward.discount)} off`;
            button.addEventListener('click', () => {
                selectedRewardId = pressed ? null : reward.id;
                renderRewards();
                renderCart();
                cartStatus.textContent = selectedRewardId
                    ? `${reward.label} applied. Total ${formatMoney(cartTotals().total)}.`
                    : `Reward removed. Total ${formatMoney(cartTotals().total)}.`;
            });
            rewardListEl.append(button);
        });
    }

    function enterMenu() {
        window.clearTimeout(checkedInTimer);
        checkIn.hidden = true;
        checkedIn.hidden = true;
        welcome.hidden = true;
        kioskShell.hidden = false;
        if (customer) {
            currentPoints.textContent = String(customer.points);
            pointsLabel.hidden = false;
            customerNameInput.value = customer.customerName;
            renderRewards();
            updatePlaceOrderState();
        }
        const selectedTab = tablist.querySelector('[aria-selected="true"]');
        if (selectedTab) {
            selectedTab.focus();
        }
    }

    function showWelcome() {
        checkedIn.hidden = true;
        welcome.hidden = false;
        welcomeTitle.textContent = `Welcome, ${customer.customerName}`;
        welcomePoints.textContent = `Current points: ${customer.points}`;
        welcomeContinue.focus();
    }

    function showCheckedIn() {
        checkIn.hidden = true;
        checkedIn.hidden = false;
        checkedInLine.focus();
        let started = false;
        const hold = () => {
            if (started) {
                return;
            }
            started = true;
            checkedInTimer = window.setTimeout(showWelcome, 800);
        };
        checkedInLine.addEventListener('animationend', hold, { once: true });
        window.setTimeout(hold, 500);
    }

    codeInput.addEventListener('input', () => {
        const digits = codeInput.value.replace(/\D/g, '').slice(0, 4);
        if (codeInput.value !== digits) {
            codeInput.value = digits;
        }
        checkInSubmit.disabled = digits.length !== 4;
        checkInStatus.textContent = '';
    });

    checkInForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const code = codeInput.value.trim();
        if (!kioskRewards.isCustomerCode(code)) {
            checkInStatus.textContent = 'Enter a 4-digit code.';
            return;
        }

        checkInSubmit.disabled = true;
        skipCode.disabled = true;
        checkInStatus.textContent = 'Checking code...';
        try {
            const response = await fetch('/api/check-in', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: code })
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error || 'That code was not found.');
            }
            customer = {
                customerId: body.customerId,
                customerName: body.customerName,
                points: body.points,
                rewards: body.rewards
            };
            selectedRewardId = null;
            checkInStatus.textContent = '';
            showCheckedIn();
        } catch (err) {
            checkInStatus.textContent = err.message;
            checkInSubmit.disabled = !kioskRewards.isCustomerCode(codeInput.value.trim());
        } finally {
            skipCode.disabled = false;
        }
    });

    skipCode.addEventListener('click', () => {
        customer = null;
        selectedRewardId = null;
        pointsLabel.hidden = true;
        redeemSection.hidden = true;
        enterMenu();
    });

    welcomeContinue.addEventListener('click', enterMenu);

    codeInput.focus();
    KioskChat.init({ getCart: () => [...cart.values()].map(({ menu_item_id, quantity }) => ({ menu_item_id, quantity })) });
    renderCart();
    loadMenu();

})();
