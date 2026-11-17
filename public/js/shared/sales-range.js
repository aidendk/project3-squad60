(function (root) {
    function validate(startDate, endDate) {
        if (startDate === undefined || endDate === undefined || startDate === '' || endDate === '') {
            return 'Select both a start date and an end date.';
        }
        const format = /^\d{4}-\d{2}-\d{2}$/;
        if (typeof startDate !== 'string' || typeof endDate !== 'string' || !format.test(startDate) || !format.test(endDate)) {
            return 'Start date and end date must use YYYY-MM-DD format.';
        }
        for (const date of [startDate, endDate]) {
            const parsed = new Date(`${date}T00:00:00Z`);
            if (date.startsWith('0000-') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
                return 'Enter valid calendar dates for the start date and end date.';
            }
        }
        if (startDate > endDate) return 'Start date must be on or before end date.';
        return null;
    }

    // Calendar arithmetic in UTC avoids DST and the browser's local timezone.
    const dayCount = (startDate, endDate) => (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000 + 1;
    const dateAt = (startDate, index) => new Date(Date.parse(`${startDate}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10);
    const api = { validate, dayCount, dateAt };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SalesRange = api;
})(typeof window === 'object' ? window : globalThis);
