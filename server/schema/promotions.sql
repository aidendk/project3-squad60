CREATE TABLE IF NOT EXISTS promotions (
    promo_id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL CHECK (length(btrim(title)) > 0),
    promo_type VARCHAR(20) NOT NULL CHECK (promo_type IN ('PERCENT', 'FLAT', 'BOGO')),
    discount_value NUMERIC(5,2) NOT NULL CHECK (
        (promo_type = 'PERCENT' AND discount_value > 0 AND discount_value <= 100) OR
        (promo_type = 'FLAT' AND discount_value > 0) OR
        (promo_type = 'BOGO' AND discount_value = 100)
    ),
    target_category VARCHAR(50) CHECK (target_category IN ('ALL', 'Milk Tea', 'Fruit Tea', 'Specialty')),
    day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME,
    end_time TIME,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK ((start_time IS NULL AND end_time IS NULL) OR
        (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time <> end_time))
);

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS end_date DATE;
-- Seed identities preserve a manager's toggle choices across restarts.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS seed_key VARCHAR(50) UNIQUE;
-- Keep deleted seed identities so startup does not recreate removed deals.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
INSERT INTO promotions (seed_key, title, promo_type, discount_value, target_category, day_of_week, start_time, end_time)
VALUES
    ('taco-tuesday', 'Taco Tuesday Special - 20% Off Fruit Teas', 'PERCENT', 20, 'Fruit Tea', 2, NULL, NULL),
    ('happy-hour', 'Daily Happy Hour - $1.00 Off All Milk Teas', 'FLAT', 1, 'Milk Tea', NULL, '14:00', '17:00')
ON CONFLICT (seed_key) DO NOTHING;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_discount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_details JSONB NOT NULL DEFAULT '[]'::jsonb;
