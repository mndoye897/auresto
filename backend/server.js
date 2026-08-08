require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');
const { trouverImagePlat } = require('./services/unsplash');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const googleClient = new OAuth2Client();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.get('/health', (req, res) => res.json({ ok: true }));

// Google Sign-In verification
app.post('/api/auth/google', async (req, res) => {
  const { token, clientId } = req.body;
  if (!token) return res.status(400).json({ error: 'missing token' });
  
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: clientId || process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    const { sub, email, name, picture } = payload;
    
    // Return user info (you can store in DB if needed)
    res.json({
      ok: true,
      user: { id: sub, email, name, picture }
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Restaurants
app.post('/api/restaurants', async (req, res) => {
  const { name, address, city, phone, description, location } = req.body;
  try {
      const { rows } = await pool.query(
        `INSERT INTO restaurants(name,address,city,phone,description,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [name, address, city, phone, description, location?.latitude || null, location?.longitude || null]
      );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/restaurants/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM restaurants WHERE id=$1', [req.params.id]);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Menu items
app.get('/api/restaurants/:id/menu', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM menu_items WHERE restaurant_id=$1 ORDER BY created_at DESC', [req.params.id]);
    res.json(rows.map(r => ({
      ...r,
      image_url: r.image_url || null
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  const { restaurant_id, name, position } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO categories(restaurant_id, name, position) VALUES($1,$2,$3) RETURNING *`,
      [restaurant_id || null, name, position || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restaurants/:id/menu', async (req, res) => {
  const restaurantId = req.params.id;
  const { name, description, price, photo, image_url, category_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO menu_items(restaurant_id, category_id, name, description, price, photo, image_url) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [restaurantId, category_id || null, name, description, price || 0, photo || null, image_url || null]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save restaurant data: name, address, phone, description, location, hours
app.put('/api/restaurants/:id', async (req, res) => {
  const { name, address, city, phone, description, location, hoursSchedule } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE restaurants SET name=$1, address=$2, city=$3, phone=$4, description=$5, latitude=$6, longitude=$7, hours_schedule=$8 WHERE id=$9 RETURNING *`,
      [name, address, city, phone, description, location?.latitude || null, location?.longitude || null, JSON.stringify(hoursSchedule || {}), req.params.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync full app state
app.post('/api/restaurants/:id/full-sync', async (req, res) => {
  const restaurantId = req.params.id;
  const { restaurant, categories, menu } = req.body;
  try {
    // Update restaurant (including hoursSchedule)
    if (restaurant) {
      await pool.query(
        `UPDATE restaurants SET name=$1, address=$2, city=$3, phone=$4, description=$5, latitude=$6, longitude=$7, hours_schedule=$8 WHERE id=$9`,
        [restaurant.name, restaurant.address, restaurant.city, restaurant.phone, restaurant.description, restaurant.location?.latitude, restaurant.location?.longitude, JSON.stringify(restaurant.hoursSchedule || {}), restaurantId]
      );
    }
    // Sync categories (delete old, insert new)
    if (categories && Array.isArray(categories)) {
      await pool.query('DELETE FROM categories WHERE restaurant_id=$1', [restaurantId]);
      for (const cat of categories) {
        await pool.query('INSERT INTO categories(restaurant_id, name, position) VALUES($1,$2,$3)', [restaurantId, cat, 0]);
      }
    }
    // Sync menu items
    if (menu && Array.isArray(menu.items)) {
      await pool.query('DELETE FROM menu_items WHERE restaurant_id=$1', [restaurantId]);
      const insertedItems = [];
      for (const item of menu.items) {
        const { rows } = await pool.query(
          `INSERT INTO menu_items(restaurant_id, category_id, name, description, price, photo, image_url, available) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, image_url`,
          [restaurantId, null, item.name, item.description || '', item.price || 0, item.photo || '', item.image_url || null, item.available !== false]
        );
        insertedItems.push({ id: rows[0].id, name: item.name, image_url: rows[0].image_url });
      }

      for (const item of insertedItems) {
        if (item.image_url) continue;
        try {
          const imageUrl = await trouverImagePlat(item.name);
          if (imageUrl) {
            await pool.query('UPDATE menu_items SET image_url=$1 WHERE id=$2', [imageUrl, item.id]);
          }
        } catch (err) {
          console.warn(`Unsplash update failed for item ${item.id}:`, err.message || err);
        }
        await wait(1200);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Load full app state from DB
app.get('/api/restaurants/:id/full-state', async (req, res) => {
  const restaurantId = req.params.id;
  try {
    const restResult = await pool.query('SELECT * FROM restaurants WHERE id=$1', [restaurantId]);
    const catResult = await pool.query('SELECT name FROM categories WHERE restaurant_id=$1', [restaurantId]);
    const menuResult = await pool.query('SELECT * FROM menu_items WHERE restaurant_id=$1', [restaurantId]);
    
    const restaurant = restResult.rows[0] || null;
    const categories = catResult.rows.map(r => r.name);
    const items = menuResult.rows.map(r => ({
      id: `item_${r.id}`,
      name: r.name,
      description: r.description,
      price: parseFloat(r.price),
      photo: r.photo || '',
      image_url: r.image_url || null,
      available: r.available
    }));
    
    res.json({
      restaurant: restaurant ? {
        name: restaurant.name,
        address: restaurant.address,
        city: restaurant.city,
        phone: restaurant.phone,
        description: restaurant.description,
        location: { latitude: restaurant.latitude, longitude: restaurant.longitude },
        hoursSchedule: restaurant.hours_schedule || {}
      } : null,
      menu: { categories, items }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a menu item's image_url (or other fields)
app.patch('/api/restaurants/:id/menu/:itemId', async (req, res) => {
  const restaurantId = req.params.id;
  let itemId = req.params.itemId;
  // Accept IDs like "item_123" or "123"
  itemId = parseInt(String(itemId).replace(/^item_/, ''), 10);
  if (!itemId) return res.status(400).json({ error: 'invalid item id' });
  const { image_url } = req.body;
  try {
    const { rows } = await pool.query('UPDATE menu_items SET image_url=$1 WHERE id=$2 AND restaurant_id=$3 RETURNING *', [image_url || null, itemId, restaurantId]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const r = rows[0];
    res.json({ id: `item_${r.id}`, name: r.name, image_url: r.image_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Auresto backend running on ${port}`));
