(() => {
    const form = document.getElementById('menu-filters');
    if (!form) return; // The menu request failed; keep its existing error state.
    const { matchesMenuItem } = globalThis.menuCategories;
    const search = document.getElementById('menu-search');
    const category = document.getElementById('menu-category');
    const clear = document.getElementById('menu-clear-filters');
    const body = document.getElementById('manager-menu-body');
    const region = document.getElementById('manager-menu-region');
    const empty = document.getElementById('menu-empty');
    const noMatches = document.getElementById('menu-no-matches');
    const status = document.getElementById('menu-filter-status');

    function applyFilters() {
        const rows = [...body.rows];
        let shown = 0;
        rows.forEach(row => {
            const name = row.querySelector('[data-item-name]').textContent;
            const itemCategory = row.querySelector('[data-item-category]').textContent;
            row.hidden = !matchesMenuItem({ name, category: itemCategory }, search.value, category.value);
            if (!row.hidden) shown++;
        });
        region.hidden = shown === 0;
        empty.hidden = rows.length !== 0;
        noMatches.hidden = shown !== 0 || rows.length === 0;
        status.textContent = rows.length
            ? `Showing ${shown} of ${rows.length} menu items.` : 'No menu items available.';
    }

    search.addEventListener('input', applyFilters);
    search.addEventListener('search', applyFilters);
    category.addEventListener('change', applyFilters);
    form.addEventListener('submit', event => {
        event.preventDefault();
        applyFilters();
    });
    clear.addEventListener('click', () => {
        search.value = category.value = '';
        applyFilters();
        search.focus();
    });
    document.addEventListener('menu:updated', applyFilters);
    applyFilters();
})();
