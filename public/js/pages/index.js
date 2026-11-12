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
})();
