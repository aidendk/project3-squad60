function inputError(status, message) {
    return Object.assign(new Error(message), { status });
}

async function createMenuItem(pool, item) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        // These existing primary keys have no sequence/default. Serialize ID
        // allocation and duplicate-name checks without changing the schema.
        await client.query('LOCK TABLE menu_item, recipe IN SHARE ROW EXCLUSIVE MODE');
        const ingredientIds = item.ingredients.map(entry => entry.inventory_item_id);
        const inventory = await client.query({
            text: 'SELECT inventory_item_id FROM inventory_item WHERE inventory_item_id = ANY($1::integer[]) FOR KEY SHARE',
            values: [ingredientIds], query_timeout: 5000
        });
        if (inventory.rows.length !== ingredientIds.length) throw inputError(400, 'One or more recipe ingredients no longer exist. Reload the page and choose current ingredients.');
        const duplicate = await client.query({
            text: 'SELECT menu_item_id FROM menu_item WHERE LOWER(BTRIM(name)) = LOWER($1)',
            values: [item.name], query_timeout: 5000
        });
        if (duplicate.rows.length) throw inputError(409, 'A menu item with that name already exists. Choose a different name.');
        const result = await client.query({
            text: `INSERT INTO menu_item (menu_item_id, name, price)
                VALUES ((SELECT COALESCE(MAX(menu_item_id), 0) + 1 FROM menu_item), $1, $2)
                RETURNING menu_item_id, name, price`,
            values: [item.name, item.price], query_timeout: 5000
        });
        const saved = result.rows[0];
        const recipe = await client.query({
            text: `INSERT INTO recipe (recipe_id, menu_item_id, inventory_item_id, quantity_required)
                SELECT (SELECT COALESCE(MAX(recipe_id), 0) FROM recipe) + ROW_NUMBER() OVER (),
                       $1, ingredient.inventory_item_id, ingredient.quantity_required
                FROM UNNEST($2::integer[], $3::integer[]) AS ingredient(inventory_item_id, quantity_required)
                RETURNING inventory_item_id, quantity_required`,
            values: [saved.menu_item_id, ingredientIds, item.ingredients.map(entry => entry.quantity_required)],
            query_timeout: 5000
        });
        await client.query('COMMIT');
        return { ...saved, price: Number(saved.price), ingredients: recipe.rows };
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Error rolling back menu creation', rollbackError); }
        throw error;
    } finally {
        client.release();
    }
}

async function updateMenuItemDetails(pool, id, item) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        // Serialize duplicate-name checks with menu creation and other edits.
        await client.query('LOCK TABLE menu_item IN SHARE ROW EXCLUSIVE MODE');
        const existing = await client.query({
            text: 'SELECT menu_item_id FROM menu_item WHERE menu_item_id = $1 FOR UPDATE',
            values: [id], query_timeout: 5000
        });
        if (!existing.rowCount) throw inputError(404, 'Menu item not found. Reload the menu to see current items.');
        const duplicate = await client.query({
            text: 'SELECT menu_item_id FROM menu_item WHERE LOWER(BTRIM(name)) = LOWER($1) AND menu_item_id <> $2',
            values: [item.name, id], query_timeout: 5000
        });
        if (duplicate.rowCount) throw inputError(409, 'A menu item with that name already exists. Choose a different name.');
        const saved = await client.query({
            text: 'UPDATE menu_item SET name = $1, category = $2 WHERE menu_item_id = $3 RETURNING menu_item_id, name, price, category',
            values: [item.name, item.category, id], query_timeout: 5000
        });
        await client.query('COMMIT');
        return { ...saved.rows[0], price: Number(saved.rows[0].price) };
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Error rolling back menu edit', rollbackError); }
        throw error;
    } finally {
        client.release();
    }
}

// Both ordering paths consume saved recipes in their existing transaction.
// Return matching menu IDs so cashier's legacy name-based fallback is skipped.
async function deductRecipeInventory(client, items) {
    const result = await client.query({
        text: `WITH ordered AS (
            SELECT * FROM UNNEST($1::integer[], $2::integer[]) AS item(menu_item_id, quantity)
        ), matched AS (
            SELECT r.menu_item_id, r.inventory_item_id, r.quantity_required::numeric * o.quantity AS quantity
            FROM recipe r JOIN ordered o USING (menu_item_id)
        ), required AS (
            SELECT inventory_item_id, SUM(quantity) AS quantity FROM matched GROUP BY inventory_item_id
        ), deducted AS (
            UPDATE inventory_item i
            SET current_fill_level = GREATEST(0, i.current_fill_level - required.quantity)
            FROM required WHERE i.inventory_item_id = required.inventory_item_id
            RETURNING i.inventory_item_id
        )
        SELECT DISTINCT menu_item_id FROM matched`,
        values: [items.map(item => item.menu_item_id), items.map(item => item.quantity)],
        query_timeout: 5000
    });
    return new Set(result.rows.map(row => row.menu_item_id));
}

module.exports = { createMenuItem, updateMenuItemDetails, deductRecipeInventory };
