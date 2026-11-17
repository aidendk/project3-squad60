(() => {
    const panels = [...document.querySelectorAll('[data-manager-panel]')];
    const links = [...document.querySelectorAll('[data-manager-link]')];

    function showWorkspace(moveFocus = false) {
        const selected = panels.find(panel => `#${panel.id}` === location.hash) || panels[0];
        if (!selected) return;
        panels.forEach(panel => { panel.hidden = panel !== selected; });
        links.forEach(link => {
            if (link.getAttribute('href') === `#${selected.id}`) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        if (moveFocus) {
            selected.querySelector('h2').focus({ preventScroll: true });
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    }

    window.addEventListener('hashchange', () => showWorkspace(true));
    showWorkspace();
})();
