(() => {
    const statusBox = document.getElementById('database-status');
    const statusText = document.getElementById('database-status-text');

    async function checkDatabaseStatus() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        try {
            const response = await fetch('/health', {
                cache: 'no-store',
                signal: controller.signal
            });

            const data = await response.json();
            const connected = response.ok && data.database === 'connected';

            statusBox.classList.toggle('connected', connected);
            statusBox.classList.toggle('unavailable', !connected);

            statusText.textContent = connected
                ? 'Database: Connected'
                : 'Database: Unavailable';
        } catch (err) {
            statusBox.classList.remove('connected');
            statusBox.classList.add('unavailable');
            statusText.textContent = 'Database: Unavailable';
        } finally {
            clearTimeout(timeout);
            setTimeout(checkDatabaseStatus, 30000);
        }
    }

    checkDatabaseStatus();

    // =========================================================================
    // Carol Accessibility Suite: Large Text & Motor Tremor Protection
    // =========================================================================
    const largeTextBtn = document.getElementById('large-text-btn');
    const textStateText = largeTextBtn ? largeTextBtn.querySelector('.text-state-text') : null;
    const a11yAnnouncer = document.getElementById('a11y-announcer');

    function applyLargeText(enable, announce) {
        document.documentElement.classList.toggle('large-text', enable);
        if (largeTextBtn) {
            largeTextBtn.setAttribute('aria-pressed', enable ? 'true' : 'false');
        }
        if (textStateText) {
            textStateText.textContent = enable ? 'On' : 'Off';
        }
        try {
            localStorage.setItem('qb_large_text', enable ? 'large' : 'normal');
            sessionStorage.setItem('kiosk-large-text', enable ? 'on' : 'off');
        } catch (e) {}

        if (announce && a11yAnnouncer) {
            a11yAnnouncer.textContent = enable
                ? 'Large text mode enabled for improved readability.'
                : 'Large text mode disabled.';
        }
    }

    // Check initial state from storage
    const isLarge = (() => {
        try {
            return (
                localStorage.getItem('qb_large_text') === 'large' ||
                sessionStorage.getItem('kiosk-large-text') === 'on'
            );
        } catch (e) {
            return false;
        }
    })();

    if (isLarge) {
        applyLargeText(true, false);
    }

    if (largeTextBtn) {
        largeTextBtn.addEventListener('click', () => {
            const current = document.documentElement.classList.contains('large-text');
            applyLargeText(!current, true);
        });
    }

    // Motor Tremor Protection: 350ms click debouncing on portal launch cards
    let lastNavTime = 0;
    const portalCards = document.querySelectorAll('.portal-card');
    portalCards.forEach((card) => {
        card.addEventListener('click', (e) => {
            const now = Date.now();
            if (now - lastNavTime < 350) {
                // Ignore accidental double-tap jitter caused by hand tremors
                e.preventDefault();
                return;
            }
            lastNavTime = now;
        });
    });
})();
