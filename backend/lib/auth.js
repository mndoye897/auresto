const crypto = require('crypto');

/**
 * Owner session tokens — never store or return OWNER_SECRET to clients.
 */
const ownerSessions = new Map();
const OWNER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function createOwnerSession() {
  const token = crypto.randomBytes(32).toString('hex');
  ownerSessions.set(token, { expiresAt: Date.now() + OWNER_SESSION_TTL_MS });
  return token;
}

function validateOwnerSession(token) {
  if (!token) return false;
  const session = ownerSessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    ownerSessions.delete(token);
    return false;
  }
  return true;
}

function extractBearerToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return req.headers['x-owner-token'] || req.query.token || null;
}

function createRequireOwnerAuth(ownerSecret) {
  return function requireOwnerAuth(req, res, next) {
    if (!ownerSecret) {
      return res.status(503).json({
        error: 'OWNER_NOT_CONFIGURED',
        message: 'OWNER_SECRET must be set in server environment variables.'
      });
    }

    const token = extractBearerToken(req);
    if (validateOwnerSession(token)) {
      return next();
    }

    return res.status(401).json({
      error: 'UNAUTHORIZED_OWNER',
      message: 'Accès réservé au propriétaire Auresto.'
    });
  };
}

function generateRestaurantAccessToken() {
  return crypto.randomBytes(32).toString('hex');
}

function extractRestaurantToken(req) {
  return req.headers['x-restaurant-token'] || null;
}

function createRestaurantAuth(pool, googleClient) {
  async function verifyGoogleEmail(token) {
    if (!token) return null;
    // Sans GOOGLE_CLIENT_ID, verifyIdToken reçoit audience:undefined et rejette
    // systématiquement : toute authentification Google échouait alors sans
    // qu'aucun message n'explique pourquoi. On le signale explicitement.
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.warn('GOOGLE_CLIENT_ID absent de l\'environnement : vérification des jetons Google impossible.');
      return null;
    }
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      return ticket.getPayload()?.email?.toLowerCase() || null;
    } catch (err) {
      console.warn('Jeton Google refusé:', err.message);
      return null;
    }
  }

  async function loadRestaurant(restaurantId) {
    const id = parseInt(restaurantId, 10);
    if (!id) return null;
    const { rows } = await pool.query('SELECT * FROM restaurants WHERE id=$1', [id]);
    return rows[0] || null;
  }

  async function authorizeRestaurantAccess(req, restaurantId, options = {}) {
    const { allowEmailBootstrap = false, accountEmail = null } = options;
    const restaurant = await loadRestaurant(restaurantId);
    if (!restaurant) {
      return { ok: false, status: 404, error: 'NOT_FOUND', message: 'Restaurant non trouvé.' };
    }

    const headerToken = extractRestaurantToken(req);
    if (headerToken && restaurant.access_token && headerToken === restaurant.access_token) {
      return { ok: true, restaurant };
    }

    const googleToken = req.headers['x-google-token'] || null;
    const bearer = req.headers['authorization'];
    const googleFromBearer = bearer?.startsWith('Bearer ') ? bearer.substring(7) : null;
    const email = await verifyGoogleEmail(googleToken || googleFromBearer);

    if (email && restaurant.owner_email && restaurant.owner_email.toLowerCase() === email) {
      return { ok: true, restaurant, viaGoogle: true };
    }

    const bootstrapEmail = (accountEmail || req.body?.account?.email || '').toLowerCase();
    if (
      allowEmailBootstrap &&
      bootstrapEmail &&
      restaurant.owner_email &&
      restaurant.owner_email.toLowerCase() === bootstrapEmail
    ) {
      return { ok: true, restaurant, bootstrap: true };
    }

    return {
      ok: false,
      status: 403,
      error: 'FORBIDDEN',
      message: 'Accès non autorisé à ce restaurant.'
    };
  }

  function requireRestaurantAuth(options = {}) {
    return async (req, res, next) => {
      try {
        const restaurantId = req.params.id || req.params.restaurantId || req.body?.restaurantId || req.body?.restaurant_id;
        const auth = await authorizeRestaurantAccess(req, restaurantId, options);
        if (!auth.ok) {
          return res.status(auth.status).json({ error: auth.error, message: auth.message });
        }
        req.restaurant = auth.restaurant;
        req.restaurantAuth = auth;
        next();
      } catch (err) {
        console.error('Restaurant auth error:', err);
        res.status(500).json({ error: err.message });
      }
    };
  }

  async function requireRestaurantAuthByMenuItem(req, res, next) {
    try {
      const itemId = parseInt(req.params.id, 10);
      if (!itemId) return res.status(400).json({ error: 'invalid item id' });

      const { rows } = await pool.query(
        'SELECT mi.*, r.access_token, r.owner_email FROM menu_items mi JOIN restaurants r ON r.id = mi.restaurant_id WHERE mi.id=$1',
        [itemId]
      );
      if (!rows.length) return res.status(404).json({ error: 'menu item not found' });

      const item = rows[0];
      req.params.id = String(item.restaurant_id);
      const auth = await authorizeRestaurantAccess(req, item.restaurant_id);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error, message: auth.message });
      }
      req.restaurant = auth.restaurant;
      req.menuItem = item;
      next();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  return {
    authorizeRestaurantAccess,
    requireRestaurantAuth,
    requireRestaurantAuthByMenuItem,
    generateRestaurantAccessToken
  };
}

module.exports = {
  createOwnerSession,
  validateOwnerSession,
  extractBearerToken,
  createRequireOwnerAuth,
  createRestaurantAuth,
  generateRestaurantAccessToken
};
