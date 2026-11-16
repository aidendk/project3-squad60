(() => {
    const TAX_RATE = 0.0825;
    function roundMoney(value) {
        return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    }
    function formatMoney(amount) {
        return `$${Number(amount).toFixed(2)}`;
    }
    const helpers = { TAX_RATE, roundMoney, formatMoney };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    else globalThis.shopMoney = helpers;
})();
