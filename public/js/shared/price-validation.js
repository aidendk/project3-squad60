(function () {
    // NUMERIC(10,2), matching Java's nonnegative, no-rounding price rule.
    function parsePrice(value) {
        if (typeof value !== 'string' && typeof value !== 'number') return null;
        if (typeof value === 'number' && !Number.isFinite(value)) return null;
        const text = String(value).trim();
        if (text.length > 100 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
        const [integer, decimal = ''] = text.split('.');
        const whole = integer.replace(/^0+/, '') || '0';
        const fraction = decimal.replace(/0+$/, '');
        if (whole.length > 8 || fraction.length > 2) return null;
        return whole + '.' + fraction.padEnd(2, '0');
    }

    function parseItemId(value) {
        if (!/^[1-9]\d*$/.test(String(value))) return null;
        const id = Number(value);
        return Number.isInteger(id) && id <= 2147483647 ? id : null;
    }

    const validation = {
        parsePrice, parseItemId,
        priceMessage: 'Enter a price from $0.00 to $99,999,999.99 with no fractions smaller than a cent. Use decimal notation.'
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = validation;
    else globalThis.menuPriceValidation = validation;
})();
