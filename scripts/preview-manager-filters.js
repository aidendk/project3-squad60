// Isolated fixture server for check-manager-filters.js. Never connects to PostgreSQL.
const express = require('express');
const path = require('node:path');
const app = express();
const root = path.join(__dirname, '..');
const menuItems = [
    'Classic Milk Tea', 'Brown Sugar Fresh Milk', 'Mango Green Tea',
    'Passionfruit Honey Tea', 'Taro Milk Drink', 'Mango Popping Boba', 'Mango Smoothie'
].map((name, index) => ({ menu_item_id: index + 1, name, price: 5.5 }));

app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.use('/js', express.static(path.join(root, 'public')));
app.get('/manager', (req, res) => res.render('manager', {
    menuItems: req.query.empty ? [] : menuItems,
    menuError: !!req.query.menuError,
    inventoryItems: [{ inventory_item_id: 1, name: 'Tea concentrate', current_fill_level: 100, reorder_threshold: 10 }],
    inventoryError: false, lowStockCount: 0
}));
app.get('/api/reports/sales', (req, res) => res.status(503).json({ error: 'Isolated filter preview' }));
app.get('/api/menu', (req, res) => res.json(menuItems));
app.get('/cashier', (req, res) => res.render('cashier'));
app.listen(3101, '127.0.0.1', error => {
    if (error) throw error;
    console.log('Isolated filter preview: http://127.0.0.1:3101/manager');
});
