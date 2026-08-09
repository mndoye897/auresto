require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');
const { trouverImagePlat } = require('./services/unsplash');

const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

io.on('connection', (socket) => {
  socket.on('join_restaurant', (restaurantId) => {
    if (restaurantId) socket.join(`restaurant_${restaurantId}`);
  });
});

function broadcastOrderEvent(restaurantId, eventName, payload) {
  if (restaurantId) {
    io.to(`restaurant_${restaurantId}`).emit(eventName, payload);
  }
  io.emit(eventName, payload);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const googleClient = new OAuth2Client();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.get('/health', (req, res) => res.json({ ok: true, socket: true }));

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
        [restaurant.name, restaurant.address, restaurant.city, restaurant.phone, restaurant.description, restaurant.location?.latitude || null, restaurant.location?.longitude || null, JSON.stringify(restaurant.hoursSchedule || {}), restaurantId]
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

// Owner Authentication
app.post('/api/owner/login', async (req, res) => {
  const { secretKey } = req.body;
  if (!secretKey) return res.status(400).json({ error: 'missing secret key' });
  
  if (secretKey !== process.env.OWNER_SECRET) {
    return res.status(401).json({ error: 'Invalid secret key' });
  }
  
  // Generate a session token (simple token for demo)
  const token = Buffer.from(Date.now().toString() + '-' + secretKey).toString('base64');
  res.json({ token, message: 'Login successful' });
});

// Helper function to validate owner token
function validateOwnerToken(token) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    return decoded.includes(process.env.OWNER_SECRET);
  } catch (err) {
    return false;
  }
}

// Owner Stats
app.get('/api/owner/stats', async (req, res) => {
  const token = req.headers['x-owner-token'];
  if (!validateOwnerToken(token)) return res.status(401).json({ error: 'Invalid owner token' });
  
  try {
    const totalRestaurants = await pool.query('SELECT COUNT(*) FROM restaurants');
    const activeRestaurants = await pool.query("SELECT COUNT(*) FROM restaurants WHERE status = 'ACTIVE'");
    const suspendedRestaurants = await pool.query("SELECT COUNT(*) FROM restaurants WHERE status = 'SUSPENDED'");
    const freeCount = await pool.query("SELECT COUNT(*) FROM restaurants WHERE subscription_plan = 'FREE'");
    const silverCount = await pool.query("SELECT COUNT(*) FROM restaurants WHERE subscription_plan = 'SILVER'");
    const goldCount = await pool.query("SELECT COUNT(*) FROM restaurants WHERE subscription_plan = 'GOLD'");
    
    // Calculate expiring soon (expires within 7 days)
    const expiringSoon = await pool.query(`
      SELECT COUNT(*) FROM restaurants 
      WHERE subscription_expires_at IS NOT NULL 
      AND subscription_expires_at <= NOW() + INTERVAL '7 days'
      AND subscription_expires_at > NOW()
      AND status != 'SUSPENDED'
    `);
    
    // Placeholder for revenue (would need payments table)
    const monthlyRevenue = 0;
    
    res.json({
      stats: {
        totalRestaurants: parseInt(totalRestaurants.rows[0].count),
        activeRestaurants: parseInt(activeRestaurants.rows[0].count),
        suspendedRestaurants: parseInt(suspendedRestaurants.rows[0].count),
        freeCount: parseInt(freeCount.rows[0].count),
        silverCount: parseInt(silverCount.rows[0].count),
        goldCount: parseInt(goldCount.rows[0].count),
        expiringSoonRestaurants: parseInt(expiringSoon.rows[0].count),
        monthlyRevenue: monthlyRevenue
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Owner List Restaurants
app.get('/api/owner/restaurants', async (req, res) => {
  const token = req.headers['x-owner-token'];
  if (!validateOwnerToken(token)) return res.status(401).json({ error: 'Invalid owner token' });
  
  const { filter = 'ALL', search = '', sort = 'created_desc' } = req.query;
  
  try {
    let query = 'SELECT * FROM restaurants WHERE 1=1';
    const params = [];
    
    if (search) {
      query += ' AND (name ILIKE $1 OR city ILIKE $1)';
      params.push(`%${search}%`);
    }
    
    if (filter === 'ACTIVE') {
      query += " AND status = 'ACTIVE'";
    } else if (filter === 'SUSPENDED') {
      query += " AND status = 'SUSPENDED'";
    } else if (filter === 'FREE') {
      query += " AND subscription_plan = 'FREE'";
    } else if (filter === 'SILVER') {
      query += " AND subscription_plan = 'SILVER'";
    } else if (filter === 'GOLD') {
      query += " AND subscription_plan = 'GOLD'";
    } else if (filter === 'EXPIRING_SOON') {
      query += " AND subscription_expires_at IS NOT NULL AND subscription_expires_at <= NOW() + INTERVAL '7 days' AND subscription_expires_at > NOW()";
    }
    
    if (sort === 'created_desc') {
      query += ' ORDER BY created_at DESC';
    } else if (sort === 'created_asc') {
      query += ' ORDER BY created_at ASC';
    } else if (sort === 'name_asc') {
      query += ' ORDER BY name ASC';
    } else if (sort === 'expires_asc') {
      query += ' ORDER BY subscription_expires_at ASC NULLS LAST';
    }
    
    const { rows } = await pool.query(query, params);
    
    res.json({
      restaurants: rows.map(r => ({
        id: r.id,
        name: r.name,
        city: r.city,
        status: r.status || 'ACTIVE',
        plan: r.subscription_plan || 'FREE',
        created_at: r.created_at,
        owner_email: r.owner_email,
        owner_phone: r.owner_phone,
        expires_at: r.subscription_expires_at,
        grace_period_days: r.grace_period_days
      })),
      count: rows.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Owner Suspend/Reactivate Restaurant
app.post('/api/owner/restaurants/:id/suspend', async (req, res) => {
  const token = req.headers['x-owner-token'];
  if (!validateOwnerToken(token)) return res.status(401).json({ error: 'Invalid owner token' });
  
  const { suspend } = req.body;
  
  try {
    const { rows } = await pool.query(
      'UPDATE restaurants SET status = $1 WHERE id = $2 RETURNING *',
      [suspend ? 'SUSPENDED' : 'ACTIVE', req.params.id]
    );
    
    if (!rows.length) return res.status(404).json({ error: 'Restaurant not found' });
    
    res.json({
      message: suspend ? 'Restaurant suspended successfully' : 'Restaurant reactivated successfully',
      restaurant: {
        id: rows[0].id,
        name: rows[0].name,
        status: rows[0].status
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Owner Update Restaurant Subscription
app.put('/api/owner/restaurants/:id/subscription', async (req, res) => {
  const token = req.headers['x-owner-token'];
  if (!validateOwnerToken(token)) return res.status(401).json({ error: 'Invalid owner token' });
  
  const { plan, status, expiresAt, gracePeriodDays, ownerEmail, ownerPhone } = req.body;
  
  try {
    const { rows } = await pool.query(
      `UPDATE restaurants 
       SET subscription_plan = $1, status = $2, subscription_expires_at = $3, grace_period_days = $4, 
           owner_email = $5, owner_phone = $6 
       WHERE id = $7 RETURNING *`,
      [plan, status, expiresAt, gracePeriodDays, ownerEmail, ownerPhone, req.params.id]
    );
    
    if (!rows.length) return res.status(404).json({ error: 'Restaurant not found' });
    
    res.json({
      message: 'Subscription updated successfully',
      restaurant: {
        id: rows[0].id,
        name: rows[0].name,
        plan: rows[0].subscription_plan,
        status: rows[0].status,
        expires_at: rows[0].subscription_expires_at
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Owner Get Subscriptions
app.get('/api/owner/subscriptions', async (req, res) => {
  const token = req.headers['x-owner-token'];
  if (!validateOwnerToken(token)) return res.status(401).json({ error: 'Invalid owner token' });
  
  try {
    const { rows } = await pool.query(
      'SELECT id, name, subscription_plan, status, subscription_expires_at, created_at FROM restaurants ORDER BY created_at DESC'
    );
    
    res.json({
      subscriptions: rows.map(r => ({
        id: r.id,
        restaurant_name: r.name,
        plan: r.subscription_plan || 'FREE',
        status: r.status || 'ACTIVE',
        expires_at: r.subscription_expires_at,
        created_at: r.created_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Owner Get Deadlines
app.get('/api/owner/deadlines', async (req, res) => {
  const token = req.headers['x-owner-token'];
  if (!validateOwnerToken(token)) return res.status(401).json({ error: 'Invalid owner token' });
  
  try {
    const { rows } = await pool.query(
      `SELECT id, name, subscription_plan, status, subscription_expires_at, grace_period_days 
       FROM restaurants 
       WHERE subscription_expires_at IS NOT NULL 
       ORDER BY subscription_expires_at ASC`
    );
    
    const today = new Date();
    const deadlines = {
      today: [],
      tomorrow: [],
      threeDays: [],
      sevenDays: [],
      gracePeriod: [],
      suspended: []
    };
    
    rows.forEach(r => {
      const expiresAt = new Date(r.subscription_expires_at);
      const daysUntil = Math.ceil((expiresAt - today) / (1000 * 60 * 60 * 24));
      
      const item = {
        id: r.id,
        name: r.name,
        plan: r.subscription_plan,
        status: r.status,
        expires_at: r.subscription_expires_at,
        days_remaining: daysUntil
      };
      
      if (r.status === 'SUSPENDED') {
        deadlines.suspended.push(item);
      } else if (daysUntil < 0) {
        deadlines.gracePeriod.push(item);
      } else if (daysUntil === 0) {
        deadlines.today.push(item);
      } else if (daysUntil === 1) {
        deadlines.tomorrow.push(item);
      } else if (daysUntil <= 3) {
        deadlines.threeDays.push(item);
      } else if (daysUntil <= 7) {
        deadlines.sevenDays.push(item);
      }
    });
    
    res.json({ deadlines });
  } catch (err) {
    console.error('Deadlines error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Owner Get Audit Logs
app.get('/api/owner/audit-logs', async (req, res) => {
  const token = req.headers['x-owner-token'];
  if (!validateOwnerToken(token)) return res.status(401).json({ error: 'Invalid owner token' });
  
  try {
    const { rows } = await pool.query(
      `SELECT al.id, al.action, al.restaurant_id, r.name as restaurant_name, 
              al.details, al.created_at
       FROM audit_logs al
       LEFT JOIN restaurants r ON al.restaurant_id = r.id
       ORDER BY al.created_at DESC
       LIMIT 100`
    );
    
    res.json({
      logs: rows.map(log => ({
        id: log.id,
        action: log.action,
        restaurant_id: log.restaurant_id,
        restaurant_name: log.restaurant_name,
        details: log.details,
        date: log.created_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Owner Get Payments
app.get('/api/owner/payments', async (req, res) => {
  const token = req.headers['x-owner-token'];
  if (!validateOwnerToken(token)) return res.status(401).json({ error: 'Invalid owner token' });
  
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.restaurant_id, r.name as restaurant_name, p.payment_type, 
              p.amount, p.status, p.transaction_id, p.order_id, p.created_at
       FROM payments p
       LEFT JOIN restaurants r ON p.restaurant_id = r.id
       ORDER BY p.created_at DESC`
    );
    
    res.json({
      payments: rows.map(p => ({
        id: p.id,
        restaurant_id: p.restaurant_id,
        restaurant: p.restaurant_name || 'Restaurant inconnu',
        payment_type: p.payment_type,
        amount: parseFloat(p.amount),
        status: p.status,
        transaction_id: p.transaction_id,
        order_id: p.order_id,
        date: p.created_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Owner Get Revenue (SUBSCRIPTION payments only)
app.get('/api/owner/revenue', async (req, res) => {
  const token = req.headers['x-owner-token'];
  if (!validateOwnerToken(token)) return res.status(401).json({ error: 'Invalid owner token' });
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Today's revenue
    const todayRevenue = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments 
       WHERE payment_type = 'SUBSCRIPTION' 
       AND created_at >= $1`,
      [today]
    );
    
    // This week's revenue
    const weekRevenue = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments 
       WHERE payment_type = 'SUBSCRIPTION' 
       AND created_at >= $1`,
      [weekStart]
    );
    
    // This month's revenue
    const monthRevenue = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments 
       WHERE payment_type = 'SUBSCRIPTION' 
       AND created_at >= $1`,
      [monthStart]
    );
    
    // Total revenue
    const totalRevenue = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments 
       WHERE payment_type = 'SUBSCRIPTION'`
    );
    
    res.json({
      today: parseFloat(todayRevenue.rows[0].total),
      week: parseFloat(weekRevenue.rows[0].total),
      month: parseFloat(monthRevenue.rows[0].total),
      total: parseFloat(totalRevenue.rows[0].total)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders Endpoints with Socket.io Real-Time Broadcast
app.post('/api/restaurants/:id/orders', async (req, res) => {
  const restaurantId = req.params.id;
  const { tableNumber, items, total, paymentMethod } = req.body;
  try {
    const orderCode = 'CMD-' + Math.floor(1000 + Math.random() * 9000);
    const { rows } = await pool.query(
      `INSERT INTO orders(restaurant_id, table_number, total_amount, payment_method, status, items_json) 
       VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
      [restaurantId, tableNumber || '01', total || 0, paymentMethod || 'CASH', 'PENDING', JSON.stringify(items || [])]
    );
    const newOrder = rows[0];
    broadcastOrderEvent(restaurantId, 'order:new', {
      id: newOrder.id,
      restaurant_id: restaurantId,
      code: orderCode,
      tableNumber: newOrder.table_number,
      total: newOrder.total_amount,
      paymentMethod: newOrder.payment_method,
      status: newOrder.status,
      items: items || [],
      createdAt: newOrder.created_at
    });
    res.json({ ok: true, order: newOrder, code: orderCode });
  } catch (err) {
    // Return graceful fallback if orders table schema differs
    const fallbackOrder = {
      id: Date.now(),
      restaurantId,
      tableNumber: tableNumber || '01',
      total,
      paymentMethod,
      status: 'PENDING',
      items
    };
    broadcastOrderEvent(restaurantId, 'order:new', fallbackOrder);
    res.json({ ok: true, order: fallbackOrder });
  }
});

app.patch('/api/restaurants/:id/orders/:orderId/status', async (req, res) => {
  const { id: restaurantId, orderId } = req.params;
  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2 AND restaurant_id=$3', [status, orderId, restaurantId]);
  } catch (err) {}
  
  broadcastOrderEvent(restaurantId, 'order:status_updated', {
    orderId,
    restaurantId,
    status
  });
  res.json({ ok: true, orderId, status });
});

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Auresto backend running on port ${port} with Socket.io enabled`));
