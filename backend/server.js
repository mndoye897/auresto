require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');
const { trouverImagePlat } = require('./services/unsplash');
const crypto = require('crypto');
const { createCheckoutSession, getConfig: getDexPayConfig, isConfigured: isDexPayConfigured, verifyWebhookSignature } = require('./services/dexpay');

const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json({
  limit: '15mb',
  verify: (req, res, buffer) => {
    // Le corps exact est nécessaire pour vérifier la signature HMAC DexPay.
    req.rawBody = Buffer.from(buffer);
  }
}));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

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
  // Diffusion strictement limitée à la salle du restaurant concerné.
  // Un io.emit() global exposerait les commandes d'un restaurant à tous
  // les autres clients connectés.
  if (!restaurantId) return;
  io.to(`restaurant_${restaurantId}`).emit(eventName, payload);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const googleClient = new OAuth2Client();

// Authentification par restaurant (lib/auth.js). Chaque route
// /api/restaurants/:id/* doit être scopée : le restaurant est résolu et
// vérifié côté serveur, jamais déduit d'un simple id d'URL.
const { createRestaurantAuth, generateRestaurantAccessToken, createOwnerSession, validateOwnerSession } = require('./lib/auth');
const { requireRestaurantAuth } = createRestaurantAuth(pool, googleClient);

// Génère un access_token pour les restaurants qui n'en ont pas encore
// (lignes créées avant la migration 006).
async function backfillRestaurantTokens() {
  try {
    const { rows } = await pool.query(
      "SELECT id FROM restaurants WHERE access_token IS NULL OR access_token = ''"
    );
    for (const row of rows) {
      await pool.query('UPDATE restaurants SET access_token=$1 WHERE id=$2', [
        generateRestaurantAccessToken(),
        row.id
      ]);
    }
    if (rows.length) console.log(`Backfilled access_token for ${rows.length} restaurant(s).`);
  } catch (err) {
    console.warn('Access token backfill skipped:', err.message);
  }
}

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
  const { name, address, city, phone, description, location, ownerEmail } = req.body;
  try {
    // Le token est généré ici et renvoyé UNE fois au créateur : c'est lui
    // qui authentifiera ensuite toutes les requêtes de ce restaurant.
    const accessToken = generateRestaurantAccessToken();
    const { rows } = await pool.query(
      `INSERT INTO restaurants(name,address,city,phone,description,latitude,longitude,owner_email,access_token)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        name, address, city, phone, description,
        location?.latitude || null, location?.longitude || null,
        (ownerEmail || '').toLowerCase() || null,
        accessToken
      ]
    );
    res.json({ ...rows[0], access_token: accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Récupération du token pour un restaurant déjà créé : réservée au
// propriétaire, prouvé soit par jeton Google vérifié, soit par l'e-mail
// enregistré. Ne renvoie jamais de token sans correspondance.
app.post('/api/auth/restaurant/token', async (req, res) => {
  const { restaurantId, email } = req.body || {};
  try {
    const id = parseInt(restaurantId, 10);
    if (!id) return res.status(400).json({ error: 'INVALID_ID' });

    const { rows } = await pool.query('SELECT * FROM restaurants WHERE id=$1', [id]);
    const restaurant = rows[0];
    if (!restaurant) return res.status(404).json({ error: 'NOT_FOUND' });

    let ownerVerified = false;

    const bearer = req.headers['authorization'];
    const googleToken = req.headers['x-google-token'] || (bearer?.startsWith('Bearer ') ? bearer.substring(7) : null);
    if (googleToken && restaurant.owner_email) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: googleToken,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        const verifiedEmail = ticket.getPayload()?.email?.toLowerCase();
        if (verifiedEmail && verifiedEmail === restaurant.owner_email.toLowerCase()) ownerVerified = true;
      } catch { /* jeton invalide : on retombe sur les autres preuves */ }
    }

    if (!ownerVerified && restaurant.owner_email && email) {
      if (String(email).toLowerCase() === restaurant.owner_email.toLowerCase()) ownerVerified = true;
    }

    // Plus de bootstrap automatique : un restaurant sans owner_email ne
    // peut pas être revendiqué par le premier e-mail venu. Le créateur doit
    // passer par le jeton (généré à la création) ou Google Sign-In.
    if (!ownerVerified) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Impossible de vérifier la propriété de ce restaurant.' });
    }

    let token = restaurant.access_token;
    if (!token) {
      token = generateRestaurantAccessToken();
      await pool.query('UPDATE restaurants SET access_token=$1 WHERE id=$2', [token, id]);
    }
    res.json({ ok: true, restaurantId: id, access_token: token });
  } catch (err) {
    console.error('Restaurant token error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/restaurants/:id', requireRestaurantAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM restaurants WHERE id=$1', [req.params.id]);
    const restaurant = rows[0] || null;
    // Ne jamais réexposer le secret dans une lecture courante.
    if (restaurant) delete restaurant.access_token;
    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Menu items
app.get('/api/restaurants/:id/menu', requireRestaurantAuth(), async (req, res) => {
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

app.post('/api/categories', requireRestaurantAuth(), async (req, res) => {
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

app.post('/api/restaurants/:id/menu', requireRestaurantAuth(), async (req, res) => {
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
app.put('/api/restaurants/:id', requireRestaurantAuth(), async (req, res) => {
  const { name, address, city, phone, description, location, hoursSchedule } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE restaurants SET name=$1, address=$2, city=$3, phone=$4, description=$5, latitude=$6, longitude=$7, hours_schedule=$8 WHERE id=$9 RETURNING *`,
      [name, address, city, phone, description, location?.latitude || null, location?.longitude || null, JSON.stringify(hoursSchedule || {}), req.params.id]
    );
    const restaurant = rows[0] || null;
    // Ne jamais réexposer le secret dans une réponse (RETURNING * le
    // renverrait à chaque mise à jour).
    if (restaurant) delete restaurant.access_token;
    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync full app state
app.post('/api/restaurants/:id/full-sync', requireRestaurantAuth({ allowEmailBootstrap: true }), async (req, res) => {
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
    // Sync categories (delete old, insert new).
    // On conserve la correspondance nom -> id : les plats arrivent du client
    // avec un nom de catégorie, jamais un identifiant.
    const categoryIdByName = new Map();
    if (categories && Array.isArray(categories)) {
      await pool.query('DELETE FROM categories WHERE restaurant_id=$1', [restaurantId]);
      let position = 0;
      for (const cat of categories) {
        const { rows } = await pool.query(
          'INSERT INTO categories(restaurant_id, name, position) VALUES($1,$2,$3) RETURNING id',
          [restaurantId, cat, position++]
        );
        categoryIdByName.set(String(cat).toLowerCase(), rows[0].id);
      }
    } else {
      // Catégories non renvoyées par le client : on réutilise celles déjà en base
      // pour ne pas perdre le rattachement des plats.
      const { rows } = await pool.query('SELECT id, name FROM categories WHERE restaurant_id=$1', [restaurantId]);
      rows.forEach(r => categoryIdByName.set(String(r.name).toLowerCase(), r.id));
    }
    // Sync menu items
    if (menu && Array.isArray(menu.items)) {
      await pool.query('DELETE FROM menu_items WHERE restaurant_id=$1', [restaurantId]);
      const insertedItems = [];
      for (const item of menu.items) {
        // Sans ce rattachement, le menu client (qui filtre par catégorie)
        // n'affiche aucun plat : tous arrivaient avec category_id NULL.
        const categoryId = categoryIdByName.get(String(item.category || '').toLowerCase()) || null;
        const { rows } = await pool.query(
          `INSERT INTO menu_items(restaurant_id, category_id, name, description, price, photo, image_url, available) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, image_url`,
          [restaurantId, categoryId, item.name, item.description || '', item.price || 0, item.photo || '', item.image_url || null, item.available !== false]
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

// Load full app state from DB (Public endpoint for QR code menu scans)
app.get('/api/restaurants/:id/full-state', async (req, res) => {
  const restaurantId = req.params.id;
  try {
    const restResult = await pool.query('SELECT * FROM restaurants WHERE id=$1', [restaurantId]);
    const catResult = await pool.query('SELECT name FROM categories WHERE restaurant_id=$1 ORDER BY position, id', [restaurantId]);
    // Jointure sur les catégories : le menu client filtre les plats par nom de
    // catégorie, il lui faut donc ce nom sur chaque plat, pas seulement la liste.
    const menuResult = await pool.query(
      `SELECT m.*, c.name AS category_name
         FROM menu_items m
         LEFT JOIN categories c ON c.id = m.category_id
        WHERE m.restaurant_id=$1
        ORDER BY m.id`,
      [restaurantId]
    );

    const restaurant = restResult.rows[0] || null;
    const categories = catResult.rows.map(r => r.name);
    const items = menuResult.rows.map(r => ({
      id: `item_${r.id}`,
      name: r.name,
      description: r.description,
      price: parseFloat(r.price),
      category: r.category_name || '',
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
app.patch('/api/restaurants/:id/menu/:itemId', requireRestaurantAuth(), async (req, res) => {
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

// Rate limiting minimal en mémoire (par IP) : protège le login owner du
// brute-force. Suffisant pour un backend mono-process ; à remplacer par un
// stockage partagé (Redis) si le backend passe en multi-instance.
const rateLimitBuckets = new Map();
function simpleRateLimit(key, max, windowMs) {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 1, resetAt: now + windowMs };
    rateLimitBuckets.set(key, bucket);
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

// Owner Authentication
app.post('/api/owner/login', (req, res) => {
  const { secretKey } = req.body;
  if (!secretKey) return res.status(400).json({ error: 'missing secret key' });

  if (secretKey !== process.env.OWNER_SECRET) {
    // Seules les tentatives échouées sont comptées : un login légitime
    // n'est jamais bloqué par les échecs des autres.
    if (!simpleRateLimit(`owner-login:${clientIp(req)}`, 5, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'Trop de tentatives. Réessayez plus tard.' });
    }
    return res.status(401).json({ error: 'Invalid secret key' });
  }

  // Jeton de session opaque et expirable : contrairement à l'ancien
  // base64(timestamp + OWNER_SECRET), le secret ne peut plus être
  // reconstruit à partir du jeton.
  const token = createOwnerSession();
  res.json({ token, message: 'Login successful' });
});

// Helper function to validate owner token
function validateOwnerToken(token) {
  return validateOwnerSession(token);
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

// Statuts autorisés — vocabulaire unique partagé avec le frontend.
const ORDER_STATUSES = ['new', 'preparing', 'ready', 'served', 'cancelled'];

function normalizeStatus(value) {
  const s = String(value || '').toLowerCase();
  if (ORDER_STATUSES.includes(s)) return s;
  const legacy = { pending: 'new', in_progress: 'preparing', done: 'served', completed: 'served', canceled: 'cancelled' };
  return legacy[s] || null;
}

function mapOrderRow(row, items) {
  return {
    id: row.id,
    clientOrderId: row.client_order_id || null,
    restaurantId: row.restaurant_id,
    tableName: row.table_number || null,
    customerName: row.customer_name || null,
    payment: row.payment_method || null,
    orderType: row.order_type || 'dinein',
    status: row.status,
    total: Number(row.total || 0),
    createdAt: row.created_at,
    items: items || (Array.isArray(row.items_json) ? row.items_json : [])
  };
}

function dexPayReturnUrls(reference) {
  const appUrl = String(process.env.AURESTO_APP_URL || '').trim().replace(/\/$/, '');
  const webhookUrl = String(process.env.DEXPAY_WEBHOOK_URL || '').trim();

  if (!appUrl || !webhookUrl) return null;

  const successUrl = new URL('client.html', `${appUrl}/`);
  successUrl.searchParams.set('payment', 'success');
  successUrl.searchParams.set('reference', reference);

  const failureUrl = new URL('client.html', `${appUrl}/`);
  failureUrl.searchParams.set('payment', 'failure');
  failureUrl.searchParams.set('reference', reference);

  return { successUrl: successUrl.toString(), failureUrl: failureUrl.toString(), webhookUrl };
}

function menuItemIdFromClientId(value) {
  const match = String(value || '').match(/^item_(\d+)$/);
  return match ? Number(match[1]) : null;
}

function checkoutPaymentMethod(provider) {
  const normalized = String(provider || '').toLowerCase();
  return normalized === 'orange' ? 'DEXPAY_ORANGE_MONEY' : 'DEXPAY_WAVE';
}

async function completeDexPayOrder(reference, eventData) {
  const client = await pool.connect();
  let broadcastPayload = null;

  try {
    await client.query('BEGIN');
    const paymentResult = await client.query(
      'SELECT * FROM payments WHERE transaction_id=$1 FOR UPDATE',
      [reference]
    );
    const payment = paymentResult.rows[0];

    // Retourner 200 évite les tentatives infinies pour un événement qui ne
    // concerne pas cette application (une référence inconnue, par exemple).
    if (!payment) {
      await client.query('COMMIT');
      return { ok: true, ignored: true };
    }

    const receivedAmount = Number(eventData?.amount);
    if (!Number.isFinite(receivedAmount) || Math.round(receivedAmount) !== Math.round(Number(payment.amount))) {
      await client.query(
        "UPDATE payments SET status='AMOUNT_MISMATCH' WHERE id=$1",
        [payment.id]
      );
      await client.query('COMMIT');
      return { ok: false, code: 'AMOUNT_MISMATCH' };
    }

    if (payment.order_id) {
      await client.query("UPDATE payments SET status='COMPLETED', paid_at=NOW() WHERE id=$1", [payment.id]);
      await client.query('COMMIT');
      return { ok: true, alreadyCompleted: true };
    }

    const metadata = payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
    const items = Array.isArray(metadata.items) ? metadata.items : [];
    if (!items.length || !metadata.tableName) {
      throw new Error('Paiement DexPay sans commande valide associée.');
    }

    const customerName = String(eventData?.customer?.name || '').trim().slice(0, 60) || null;
    const paymentMethod = String(eventData?.operator || checkoutPaymentMethod(metadata.preferredProvider))
      .trim()
      .slice(0, 60)
      .toUpperCase();
    const { rows } = await client.query(
      `INSERT INTO orders(restaurant_id, table_number, customer_name, payment_method, status, total, items_json, client_order_id, order_type)
       VALUES($1,$2,$3,$4,'new',$5,$6,$7,$8)
       RETURNING *`,
      [
        payment.restaurant_id,
        metadata.tableName,
        customerName,
        paymentMethod,
        Number(payment.amount),
        JSON.stringify(items),
        `dexpay_${reference}`,
        metadata.orderType === 'takeaway' ? 'takeaway' : 'dinein'
      ]
    );
    const order = rows[0];

    for (const item of items) {
      const qty = Number(item.qty) || 1;
      const unitPrice = Number(item.price) || 0;
      await client.query(
        `INSERT INTO order_items(order_id, restaurant_id, name, category, qty, unit_price, line_total, created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.id, payment.restaurant_id, item.name, item.category || null, qty, unitPrice, qty * unitPrice, order.created_at]
      );
    }

    await client.query(
      "UPDATE payments SET status='COMPLETED', order_id=$1, provider=$2, paid_at=NOW() WHERE id=$3",
      [order.id, paymentMethod, payment.id]
    );
    await client.query('COMMIT');

    broadcastPayload = mapOrderRow(order, items);
    return { ok: true, order: broadcastPayload };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    if (broadcastPayload) broadcastOrderEvent(broadcastPayload.restaurantId, 'order:new', broadcastPayload);
  }
}

// Crée un checkout hébergé DexPay. Le montant est recalculé à partir du menu
// en base, jamais accepté tel quel depuis le navigateur.
app.post('/api/restaurants/:id/payments/dexpay/checkout', async (req, res) => {
  const restaurantId = parseInt(req.params.id, 10);
  if (!restaurantId) return res.status(400).json({ error: 'INVALID_RESTAURANT' });
  if (!isDexPayConfigured()) {
    return res.status(503).json({ error: 'DEXPAY_NOT_CONFIGURED', message: 'Le paiement en ligne est en cours de configuration.' });
  }

  const dexPayConfig = getDexPayConfig();
  if (!dexPayConfig.webhookSecret) {
    return res.status(503).json({ error: 'DEXPAY_WEBHOOK_NOT_CONFIGURED', message: 'La confirmation sécurisée DexPay n’est pas encore configurée.' });
  }

  const { items, tableName, tableId, orderType, preferredProvider } = req.body || {};
  const requestedItems = Array.isArray(items) ? items.slice(0, 50) : [];
  if (!requestedItems.length) return res.status(400).json({ error: 'EMPTY_ORDER' });

  const ids = requestedItems.map(item => menuItemIdFromClientId(item.id));
  if (ids.some(id => !id)) {
    return res.status(400).json({ error: 'INVALID_MENU_ITEM', message: 'Un article du panier n’est plus disponible.' });
  }

  try {
    const restaurantResult = await pool.query('SELECT id, name FROM restaurants WHERE id=$1', [restaurantId]);
    if (!restaurantResult.rows.length) return res.status(404).json({ error: 'NOT_FOUND' });

    const menuResult = await pool.query(
      `SELECT m.id, m.name, m.price, c.name AS category_name
         FROM menu_items m
         LEFT JOIN categories c ON c.id=m.category_id
        WHERE m.restaurant_id=$1 AND m.available IS NOT FALSE AND m.id = ANY($2::int[])`,
      [restaurantId, [...new Set(ids)]]
    );
    const menuById = new Map(menuResult.rows.map(item => [item.id, item]));
    const confirmedItems = [];

    for (const requested of requestedItems) {
      const menuItem = menuById.get(menuItemIdFromClientId(requested.id));
      const qty = Math.floor(Number(requested.qty));
      if (!menuItem || !Number.isInteger(qty) || qty < 1 || qty > 20) {
        return res.status(400).json({ error: 'INVALID_ORDER_ITEMS', message: 'Le panier contient un article ou une quantité invalide.' });
      }
      confirmedItems.push({
        id: `item_${menuItem.id}`,
        name: menuItem.name,
        category: menuItem.category_name || '',
        price: Number(menuItem.price),
        qty,
        note: String(requested.note || '').trim().slice(0, 300)
      });
    }

    const amount = confirmedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000_000) {
      return res.status(400).json({ error: 'INVALID_AMOUNT' });
    }

    const reference = `AUR_${restaurantId}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
    const urls = dexPayReturnUrls(reference);
    if (!urls) {
      return res.status(503).json({
        error: 'DEXPAY_URLS_NOT_CONFIGURED',
        message: 'Les URLs de retour et de webhook DexPay doivent être configurées côté serveur.'
      });
    }

    const metadata = {
      tableName: String(tableName || tableId || 'Table').trim().slice(0, 40),
      orderType: orderType === 'takeaway' ? 'takeaway' : 'dinein',
      preferredProvider: preferredProvider === 'orange' ? 'orange' : 'wave',
      items: confirmedItems
    };

    await pool.query(
      `INSERT INTO payments(restaurant_id, provider, amount, currency, status, transaction_id, payment_type, metadata)
       VALUES($1,'DEXPAY',$2,'XOF','INITIATED',$3,'ORDER',$4::jsonb)`,
      [restaurantId, amount, reference, JSON.stringify(metadata)]
    );

    const session = await createCheckoutSession({
      reference,
      itemName: `Commande ${restaurantResult.rows[0].name} · ${confirmedItems.length} article(s)`,
      amount,
      successUrl: urls.successUrl,
      failureUrl: urls.failureUrl,
      webhookUrl: urls.webhookUrl,
      metadata: { restaurant_id: String(restaurantId), payment_reference: reference }
    });

    if (!session.ok) {
      await pool.query("UPDATE payments SET status='INITIATION_FAILED' WHERE transaction_id=$1", [reference]);
      return res.status(502).json({ error: session.code, message: session.message });
    }

    await pool.query(
      'UPDATE payments SET checkout_session_id=$1, status=$2 WHERE transaction_id=$3',
      [session.sessionId, String(session.status || 'INITIATED').toUpperCase(), reference]
    );

    res.status(201).json({
      ok: true,
      reference,
      amount,
      mode: session.mode,
      paymentUrl: session.paymentUrl
    });
  } catch (error) {
    console.error('[DEXPAY] Checkout creation failed:', error.message);
    res.status(500).json({ error: 'DEXPAY_CHECKOUT_FAILED', message: 'Impossible de préparer le paiement.' });
  }
});

// Réception publique, mais authentifiée par la signature HMAC DexPay. Une
// commande est créée uniquement sur checkout.completed, jamais sur le retour
// navigateur (success_url).
app.post('/api/payments/dexpay/webhook', async (req, res) => {
  const signature = req.headers['x-dexchange-signature'] || req.headers['x-dexpay-signature'];
  if (!verifyWebhookSignature(req.rawBody, signature)) {
    return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  }

  const event = String(req.body?.event || '');
  const data = req.body?.data || {};
  const reference = String(data.reference || '').trim();
  if (!reference) return res.status(400).json({ error: 'MISSING_REFERENCE' });

  try {
    if (event === 'checkout.completed') {
      const result = await completeDexPayOrder(reference, data);
      if (!result.ok) return res.status(400).json({ error: result.code });
      return res.json({ received: true, created: !result.alreadyCompleted });
    }

    if (['checkout.failed', 'checkout.cancelled'].includes(event)) {
      const status = event === 'checkout.cancelled' ? 'CANCELLED' : 'FAILED';
      await pool.query('UPDATE payments SET status=$1 WHERE transaction_id=$2 AND order_id IS NULL', [status, reference]);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[DEXPAY] Webhook processing failed:', error.message);
    res.status(500).json({ error: 'WEBHOOK_PROCESSING_FAILED' });
  }
});

// Création de commande : route PUBLIQUE, comme le dépôt d'avis. Le client
// qui scanne le QR code n'a évidemment aucun jeton de restaurateur ; exiger
// une authentification ici renvoyait un 403 et la commande n'arrivait jamais
// au restaurant. La lecture (GET) reste, elle, authentifiée.
app.post('/api/restaurants/:id/orders', async (req, res) => {
  const restaurantId = parseInt(req.params.id, 10);
  if (!restaurantId) return res.status(400).json({ error: 'INVALID_RESTAURANT' });

  const { rows: restRows } = await pool.query('SELECT id, access_token FROM restaurants WHERE id=$1', [restaurantId]);
  if (!restRows.length) return res.status(404).json({ error: 'NOT_FOUND' });

  // Seul le restaurateur (jeton valide) peut imposer un statut ; une
  // commande déposée depuis la salle démarre toujours à « new ».
  const token = req.headers['x-restaurant-token'] || null;
  const isStaff = Boolean(token && restRows[0].access_token && token === restRows[0].access_token);

  const { tableNumber, tableName, customerName, items, total, paymentMethod, payment, clientOrderId, status, orderType } = req.body || {};

  const safeItems = Array.isArray(items) ? items.slice(0, 100) : [];
  if (!safeItems.length) return res.status(400).json({ error: 'EMPTY_ORDER' });

  // Le total est recalculé côté serveur : une valeur envoyée par le
  // client ne doit pas pouvoir fausser le chiffre d'affaires.
  const computedTotal = safeItems.reduce(
    (sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1),
    0
  );
  const finalTotal = computedTotal > 0 ? computedTotal : Number(total) || 0;
  const finalStatus = isStaff ? (normalizeStatus(status) || 'new') : 'new';
  // Mode de service choisi par le client : sur place ou à emporter.
  const finalOrderType = orderType === 'takeaway' ? 'takeaway' : 'dinein';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO orders(restaurant_id, table_number, customer_name, payment_method, status, total, items_json, client_order_id, order_type)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (restaurant_id, client_order_id) WHERE client_order_id IS NOT NULL
       DO UPDATE SET status = EXCLUDED.status
       RETURNING *`,
      [
        restaurantId,
        tableName || tableNumber || null,
        customerName || null,
        payment || paymentMethod || 'CASH',
        finalStatus,
        finalTotal,
        JSON.stringify(safeItems),
        clientOrderId || null,
        finalOrderType
      ]
    );

    const order = rows[0];

    // Lignes de commande : socle des analyses par plat.
    await client.query('DELETE FROM order_items WHERE order_id=$1', [order.id]);
    for (const item of safeItems) {
      const qty = Number(item.qty) || 1;
      const unit = Number(item.price) || 0;
      await client.query(
        `INSERT INTO order_items(order_id, restaurant_id, name, category, qty, unit_price, line_total, created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.id, restaurantId, String(item.name || 'Article'), item.category || null, qty, unit, qty * unit, order.created_at]
      );
    }

    await client.query('COMMIT');

    const payload = mapOrderRow(order, safeItems);
    broadcastOrderEvent(restaurantId, 'order:new', payload);
    res.json({ ok: true, order: payload });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create order failed:', err);
    res.status(500).json({ error: 'ORDER_CREATE_FAILED', message: err.message });
  } finally {
    client.release();
  }
});

// Historique des commandes du restaurant authentifié.
app.get('/api/restaurants/:id/orders', requireRestaurantAuth(), async (req, res) => {
  const restaurantId = req.restaurant.id;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const status = normalizeStatus(req.query.status);

  try {
    const params = [restaurantId];
    let where = 'WHERE restaurant_id = $1';
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (req.query.since) {
      const since = new Date(req.query.since);
      if (!isNaN(since.getTime())) {
        params.push(since.toISOString());
        where += ` AND created_at >= $${params.length}`;
      }
    }
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE restaurant_id = $1`,
      [restaurantId]
    );

    res.json({
      ok: true,
      total: countRes.rows[0].n,
      orders: rows.map(r => mapOrderRow(r))
    });
  } catch (err) {
    console.error('List orders failed:', err);
    res.status(500).json({ error: 'ORDER_LIST_FAILED', message: err.message });
  }
});

app.patch('/api/restaurants/:id/orders/:orderId/status', requireRestaurantAuth(), async (req, res) => {
  const restaurantId = req.restaurant.id;
  const { orderId } = req.params;
  const status = normalizeStatus(req.body?.status);

  if (!status) {
    return res.status(400).json({ error: 'INVALID_STATUS', message: `Statut attendu : ${ORDER_STATUSES.join(', ')}.` });
  }

  try {
    // L'identifiant peut être l'id SERIAL de la base OU l'identifiant
    // local du frontend (ex: "order_1786351468278"). Passer ce dernier
    // dans une colonne integer provoquait une erreur SQL.
    const numericId = /^\d+$/.test(String(orderId)) ? parseInt(orderId, 10) : null;

    // Le filtre restaurant_id empêche de modifier la commande d'un autre.
    const { rows } = numericId !== null
      ? await pool.query(
          'UPDATE orders SET status=$1 WHERE id=$2 AND restaurant_id=$3 RETURNING *',
          [status, numericId, restaurantId]
        )
      : await pool.query(
          'UPDATE orders SET status=$1 WHERE client_order_id=$2 AND restaurant_id=$3 RETURNING *',
          [status, String(orderId), restaurantId]
        );
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });

    broadcastOrderEvent(restaurantId, 'order:status_updated', { orderId: rows[0].id, restaurantId, status });
    res.json({ ok: true, order: mapOrderRow(rows[0]) });
  } catch (err) {
    console.error('Update order status failed:', err);
    res.status(500).json({ error: 'ORDER_STATUS_FAILED', message: err.message });
  }
});

// ============================================================
// Avis clients
//
// Particularité : le client qui scanne le QR code n'est PAS authentifié.
// Le dépôt d'avis est donc public, mais strictement validé et limité.
// La lecture, elle, reste réservée au restaurant authentifié.
// ============================================================
const REVIEW_MAX_COMMENT = 800;
const REVIEW_MAX_NAME = 60;
const REVIEW_WINDOW_MINUTES = 60;

// Empreinte non nominative : on ne stocke jamais l'IP en clair.
function authorFingerprint(req, restaurantId) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}|${restaurantId}`).digest('hex');
}

app.post('/api/restaurants/:id/reviews', async (req, res) => {
  const restaurantId = parseInt(req.params.id, 10);
  if (!restaurantId) return res.status(400).json({ error: 'INVALID_RESTAURANT' });

  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'INVALID_RATING', message: 'La note doit être comprise entre 1 et 5.' });
  }

  const comment = String(req.body?.comment || '').trim().slice(0, REVIEW_MAX_COMMENT);
  const customerName = String(req.body?.customerName || '').trim().slice(0, REVIEW_MAX_NAME) || null;
  const tableNumber = String(req.body?.tableName || req.body?.tableNumber || '').trim().slice(0, 40) || null;

  try {
    const exists = await pool.query('SELECT id FROM restaurants WHERE id=$1', [restaurantId]);
    if (!exists.rows.length) return res.status(404).json({ error: 'NOT_FOUND' });

    // Anti-abus : un seul avis par empreinte et par heure.
    const fingerprint = authorFingerprint(req, restaurantId);
    const recent = await pool.query(
      `SELECT id FROM reviews
       WHERE restaurant_id=$1 AND author_fingerprint=$2
         AND created_at > now() - ($3 || ' minutes')::interval
       LIMIT 1`,
      [restaurantId, fingerprint, String(REVIEW_WINDOW_MINUTES)]
    );
    if (recent.rows.length) {
      return res.status(429).json({ error: 'REVIEW_TOO_SOON', message: 'Vous avez déjà laissé un avis récemment. Merci !' });
    }

    const { rows } = await pool.query(
      `INSERT INTO reviews(restaurant_id, rating, comment, customer_name, table_number, author_fingerprint)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id, rating, created_at`,
      [restaurantId, rating, comment || null, customerName, tableNumber, fingerprint]
    );

    broadcastOrderEvent(restaurantId, 'review:new', { id: rows[0].id, rating, createdAt: rows[0].created_at });
    res.json({ ok: true, review: rows[0] });
  } catch (err) {
    console.error('Create review failed:', err);
    res.status(500).json({ error: 'REVIEW_CREATE_FAILED' });
  }
});

// Lecture des avis — réservée au restaurant authentifié.
app.get('/api/restaurants/:id/reviews', requireRestaurantAuth(), async (req, res) => {
  const restaurantId = req.restaurant.id;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  try {
    const params = [restaurantId];
    let where = 'WHERE restaurant_id = $1';
    const rating = parseInt(req.query.rating, 10);
    if (rating >= 1 && rating <= 5) {
      params.push(rating);
      where += ` AND rating = $${params.length}`;
    }
    if (req.query.status === 'hidden' || req.query.status === 'published') {
      params.push(req.query.status);
      where += ` AND status = $${params.length}`;
    }
    params.push(limit, offset);

    const list = await pool.query(
      `SELECT id, rating, comment, customer_name, table_number, status, created_at
       FROM reviews ${where} ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const stats = await pool.query(
      `SELECT
         COUNT(*)::int                                  AS total,
         COALESCE(AVG(rating), 0)::float                AS average,
         COUNT(*) FILTER (WHERE rating = 5)::int        AS r5,
         COUNT(*) FILTER (WHERE rating = 4)::int        AS r4,
         COUNT(*) FILTER (WHERE rating = 3)::int        AS r3,
         COUNT(*) FILTER (WHERE rating = 2)::int        AS r2,
         COUNT(*) FILTER (WHERE rating = 1)::int        AS r1,
         COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last30
       FROM reviews WHERE restaurant_id = $1`,
      [restaurantId]
    );
    const s = stats.rows[0];

    res.json({
      ok: true,
      stats: {
        total: s.total,
        average: Math.round(s.average * 10) / 10,
        distribution: { 5: s.r5, 4: s.r4, 3: s.r3, 2: s.r2, 1: s.r1 },
        last30Days: s.last30
      },
      reviews: list.rows.map(r => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        customerName: r.customer_name,
        tableName: r.table_number,
        status: r.status,
        createdAt: r.created_at
      }))
    });
  } catch (err) {
    console.error('List reviews failed:', err);
    res.status(500).json({ error: 'REVIEW_LIST_FAILED' });
  }
});

// Masquer / réafficher un avis (modération par le restaurateur).
app.patch('/api/restaurants/:id/reviews/:reviewId', requireRestaurantAuth(), async (req, res) => {
  const restaurantId = req.restaurant.id;
  const reviewId = parseInt(req.params.reviewId, 10);
  const status = req.body?.status;
  if (!['published', 'hidden'].includes(status)) {
    return res.status(400).json({ error: 'INVALID_STATUS' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE reviews SET status=$1 WHERE id=$2 AND restaurant_id=$3 RETURNING id, status',
      [status, reviewId, restaurantId]
    );
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ ok: true, review: rows[0] });
  } catch (err) {
    console.error('Update review failed:', err);
    res.status(500).json({ error: 'REVIEW_UPDATE_FAILED' });
  }
});

// ============================================================
// Marketing AI — analyses et assistant
// Le restaurant provient toujours de req.restaurant (authentifié).
// ============================================================
const { buildRestaurantContext } = require('./services/analytics');
const marketingAI = require('./services/ai');

// Cache court des contextes analytiques : évite de recalculer toutes les
// agrégations à chaque message du chat.
const analyticsCache = new Map();
const ANALYTICS_TTL_MS = 60 * 1000;

async function getContextCached(restaurantId) {
  const hit = analyticsCache.get(restaurantId);
  if (hit && Date.now() - hit.at < ANALYTICS_TTL_MS) return hit.data;
  const data = await buildRestaurantContext(pool, restaurantId);
  analyticsCache.set(restaurantId, { at: Date.now(), data });
  return data;
}

// Indique au frontend si l'assistant est utilisable (sans exposer la clé).
app.get('/api/marketing/status', (req, res) => {
  res.json({ ok: true, aiConfigured: marketingAI.isConfigured(), provider: marketingAI.PROVIDER });
});

// Statistiques du restaurant authentifié (cartes d'insights).
app.get('/api/restaurants/:id/marketing/insights', requireRestaurantAuth(), async (req, res) => {
  try {
    const context = await getContextCached(req.restaurant.id);
    res.json({ ok: true, insights: context });
  } catch (err) {
    console.error('Insights failed:', err);
    res.status(500).json({ error: 'INSIGHTS_FAILED', message: err.message });
  }
});

// Recommandations automatiques générées par l'IA.
app.get('/api/restaurants/:id/marketing/recommendations', requireRestaurantAuth(), async (req, res) => {
  if (!marketingAI.isConfigured()) {
    return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });
  }
  try {
    const context = await getContextCached(req.restaurant.id);
    const recommendations = await marketingAI.generateRecommendations(context);
    res.json({ ok: true, recommendations });
  } catch (err) {
    console.error('Recommendations failed:', err.code || err.message);
    res.status(502).json({ error: err.code || 'AI_REQUEST_FAILED' });
  }
});

// Chat conversationnel.
app.post('/api/restaurants/:id/marketing/chat', requireRestaurantAuth(), async (req, res) => {
  const { question, history } = req.body || {};
  if (!marketingAI.isConfigured()) {
    return res.status(503).json({ error: 'AI_NOT_CONFIGURED' });
  }
  try {
    const context = await getContextCached(req.restaurant.id);
    const answer = await marketingAI.askMarketingAI({ question, context, history });
    res.json({ ok: true, answer });
  } catch (err) {
    const code = err.code || 'AI_REQUEST_FAILED';
    console.error('Marketing chat failed:', code);
    res.status(code === 'EMPTY_QUESTION' ? 400 : 502).json({ error: code });
  }
});

const port = process.env.PORT || 4000;
server.listen(port, async () => {
  console.log(`Auresto backend running on port ${port} with Socket.io enabled`);
  await backfillRestaurantTokens();
});
