const { BUSINESS_TIME_ZONE } = require('./sales');

function validatePromotion(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send promotion details.' };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 100) return { error: 'Title must contain 1 to 100 characters.' };
    if (!['PERCENT', 'FLAT', 'BOGO'].includes(body.promo_type)) return { error: 'Choose PERCENT, FLAT, or BOGO.' };
    const rawValue = body.discount_value;
    if (!['number', 'string'].includes(typeof rawValue) || !/^\d+(\.\d{1,2})?$/.test(String(rawValue))) {
        return { error: 'Discount must be a number with at most two decimal places.' };
    }
    const value = Number(rawValue);
    if (body.promo_type === 'BOGO' ? value !== 100 : value <= 0 || value > (body.promo_type === 'PERCENT' ? 100 : 999.99)) {
        return { error: 'Percent discounts must be up to 100, flat discounts up to $999.99, and BOGO must use 100.' };
    }
    const category = body.target_category == null || body.target_category === '' ? 'ALL' : body.target_category;
    if (!['ALL', 'Milk Tea', 'Fruit Tea', 'Specialty'].includes(category)) return { error: 'Choose a drink category or ALL.' };
    const day = body.day_of_week == null || body.day_of_week === '' ? null : body.day_of_week;
    if (day !== null && (!/^[0-6]$/.test(String(day)) || !['number', 'string'].includes(typeof day))) {
        return { error: 'Day must be 0 (Sunday) to 6 (Saturday), or blank for every day.' };
    }
    const optional = value => value == null || value === '' ? null : value;
    const start = optional(body.start_time);
    const end = optional(body.end_time);
    const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
    if ((start === null) !== (end === null) || (start !== null && (!validTime(start) || !validTime(end) || start.slice(0, 5) === end.slice(0, 5)))) {
        return { error: 'Provide both start and end times with different minutes, or leave both blank for all day.' };
    }
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && value >= '0001-01-01' && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    const startDate = optional(body.start_date);
    const endDate = optional(body.end_date);
    if ((startDate !== null && !validDate(startDate)) || (endDate !== null && !validDate(endDate))
        || (startDate && endDate && startDate > endDate)) return { error: 'Use valid seasonal dates, with the end on or after the start.' };
    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') return { error: 'is_active must be true or false.' };
    return { promotion: {
        title, promo_type: body.promo_type, discount_value: value, target_category: category,
        day_of_week: day === null ? null : Number(day), start_time: start, end_time: end,
        start_date: startDate, end_date: endDate, is_active: body.is_active ?? true
    } };
}

const localClock = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function isPromotionActive(promotion, now = new Date()) {
    if (!promotion.is_active) return false;
    const parts = Object.fromEntries(localClock.formatToParts(now).map(part => [part.type, part.value]));
    let date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}:${parts.second}`;
    if ((promotion.start_time == null) !== (promotion.end_time == null)) return false;
    if (promotion.start_time != null && promotion.end_time != null) {
        const start = promotion.start_time.length === 5 ? `${promotion.start_time}:00` : promotion.start_time;
        const end = promotion.end_time.length === 5 ? `${promotion.end_time}:00` : promotion.end_time;
        if (start === end) return false;
        if (start < end) {
            if (time < start || time >= end) return false;
        } else {
            if (time < start && time >= end) return false;
            // A Tuesday 10pm-2am deal continues into Wednesday on Tuesday's schedule.
            if (time < end) date = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
        }
    }
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return (promotion.day_of_week == null || Number(promotion.day_of_week) === day)
        && (promotion.start_date == null || date >= promotion.start_date)
        && (promotion.end_date == null || date <= promotion.end_date);
}

async function listPromotions(pool, { activeOnly = false, now = new Date() } = {}) {
    const result = await pool.query({
        text: `SELECT promo_id, title, promo_type, discount_value, target_category, day_of_week,
            start_time, end_time, is_active, created_at,
            to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
            FROM promotions WHERE deleted_at IS NULL ORDER BY promo_id`,
        query_timeout: 5000
    });
    const rows = result.rows.map(row => ({ ...row, discount_value: Number(row.discount_value) }));
    return activeOnly ? rows.filter(row => isPromotionActive(row, now)) : rows;
}

module.exports = { validatePromotion, isPromotionActive, listPromotions, BUSINESS_TIME_ZONE };
