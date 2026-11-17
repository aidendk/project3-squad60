// Vishnu Accessibility Controller: WCAG 2.1 AAA High Contrast & Focus Management
(function () {
    function applyContrast(enable, announce) {
        document.documentElement.classList.toggle('high-contrast', enable);

        // Update all contrast toggle buttons on the page
        const buttons = document.querySelectorAll('#contrast-toggle-btn, #contrast-btn, .contrast-toggle-btn');
        buttons.forEach((btn) => {
            btn.setAttribute('aria-pressed', enable ? 'true' : 'false');
            const stateText = btn.querySelector('.contrast-state-text');
            if (stateText) {
                stateText.textContent = enable ? 'On' : 'Off';
            }
        });

        try {
            localStorage.setItem('qb_contrast', enable ? 'high' : 'normal');
            sessionStorage.setItem('kiosk-contrast', enable ? 'on' : 'off');
            sessionStorage.setItem('kitchen-contrast', enable ? 'on' : 'off');
        } catch (e) {}

        if (announce) {
            let announcer = document.getElementById('a11y-announcer');
            if (!announcer) {
                announcer = document.createElement('div');
                announcer.id = 'a11y-announcer';
                announcer.className = 'sr-only';
                announcer.setAttribute('role', 'status');
                announcer.setAttribute('aria-live', 'polite');
                document.body.appendChild(announcer);
            }
            announcer.textContent = enable
                ? 'High contrast mode enabled. Contrast ratio exceeds WCAG 2.1 AAA standard.'
                : 'High contrast mode disabled.';
        }
    }

    function isContrastActive() {
        try {
            return (
                localStorage.getItem('qb_contrast') === 'high' ||
                sessionStorage.getItem('kiosk-contrast') === 'on' ||
                sessionStorage.getItem('kitchen-contrast') === 'on'
            );
        } catch (e) {
            return false;
        }
    }

    // Apply immediately to prevent flash of unstyled content
    if (isContrastActive()) {
        document.documentElement.classList.add('high-contrast');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const active = isContrastActive();
        applyContrast(active, false);

        // Event delegation for contrast toggle buttons (excluding pages with local controllers like kiosk/kitchen)
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#contrast-toggle-btn, .contrast-toggle-btn');
            if (btn) {
                const current = document.documentElement.classList.contains('high-contrast');
                applyContrast(!current, true);
            }
        });
    });
})();
