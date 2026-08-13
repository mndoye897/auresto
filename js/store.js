const STORAGE_KEY = 'auresto_data';
const RESTAURANT_ID_KEY = 'auresto_restaurant_id';
const RESTAURANT_TOKEN_KEY = 'auresto_restaurant_token';
const DB_NAME = 'AurestoDB';
const DB_STORE = 'appState';

// API configuration
window.AURESTO_API_BASE = window.AURESTO_API_BASE || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname
    ? 'http://localhost:4000'
    : window.location.origin
);

let restaurantId = null;
let stateCache = null;

function getRestaurantId() {
  if (!restaurantId) {
    try {
      const params = new URLSearchParams(window.location.search);
      const rFromUrl = params.get('r') || params.get('restaurantId');
      if (rFromUrl) {
        restaurantId = parseInt(rFromUrl, 10) || null;
        if (restaurantId) localStorage.setItem(RESTAURANT_ID_KEY, restaurantId);
      }
    } catch (e) {}
    if (!restaurantId) {
      restaurantId = parseInt(localStorage.getItem(RESTAURANT_ID_KEY)) || null;
    }
  }
  return restaurantId;
}

function setRestaurantId(id) {
  restaurantId = id;
  if (id) localStorage.setItem(RESTAURANT_ID_KEY, id);
}

// ---------------------------------------------------------------
// Jeton d'accès du restaurant : toutes les routes /api/restaurants/*
// sont authentifiées côté serveur. Sans ce jeton, les appels échouent
// en 403.
// ---------------------------------------------------------------
function getRestaurantToken() {
  try { return localStorage.getItem(RESTAURANT_TOKEN_KEY) || null; } catch { return null; }
}

function setRestaurantToken(token) {
  if (!token) return;
  try { localStorage.setItem(RESTAURANT_TOKEN_KEY, token); } catch {}
}

function apiHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const token = getRestaurantToken();
  if (token) headers['x-restaurant-token'] = token;
  return headers;
}

// Récupère le jeton pour un restaurant déjà créé (appareil différent,
// stockage vidé...). La propriété est vérifiée côté serveur via
// l'e-mail du compte ; aucun jeton n'est délivré sans correspondance.
async function ensureRestaurantToken(accountEmail) {
  if (getRestaurantToken()) return getRestaurantToken();
  const rid = getRestaurantId();
  if (!rid || !accountEmail) return null;
  try {
    const res = await fetch(window.AURESTO_API_BASE + '/api/auth/restaurant/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: rid, email: accountEmail })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.access_token) {
      setRestaurantToken(data.access_token);
      return data.access_token;
    }
  } catch (err) {
    console.warn('Récupération du jeton restaurant impossible', err);
  }
  return null;
}

async function syncWithApi(data) {
  if (!data.restaurant?.name) return { success: false, restaurantId: null };

  try {
    // Try to create or get restaurant ID if not set
    const accountEmail = data.account?.email || null;
    let rid = getRestaurantId();
    if (!rid) {
      // Au lieu de créer un doublon : on adopte le restaurant existant du
      // même nom (vérifié par e-mail du propriétaire côté serveur).
      const existingId = await resolveRestaurantIdByName(data.restaurant.name, accountEmail);
      if (existingId) {
        rid = existingId;
      } else {
        // Create restaurant in DB
        const res = await fetch(window.AURESTO_API_BASE + '/api/restaurants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: data.restaurant.name, ownerEmail: accountEmail })
        });
        if (!res.ok) {
          console.warn('Failed to create restaurant:', res.status, res.statusText);
          return { success: false, restaurantId: null };
        }
        const created = await res.json();
        if (created.id) {
          setRestaurantId(created.id);
          rid = created.id;
        }
        // Le serveur ne renvoie ce jeton qu'à la création : on le conserve.
        if (created.access_token) setRestaurantToken(created.access_token);
      }
    }

    // Restaurant déjà créé mais jeton absent localement : on le récupère.
    if (rid && !getRestaurantToken()) await ensureRestaurantToken(accountEmail);

    // Sync full state (including hoursSchedule)
    if (rid) {
      const syncRes = await fetch(window.AURESTO_API_BASE + `/api/restaurants/${rid}/full-sync`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          restaurant: data.restaurant,
          categories: data.menu?.categories || [],
          menu: data.menu || { items: [] },
          account: data.account ? { email: accountEmail } : undefined
        })
      });
      if (syncRes.status === 404) {
        // Restaurant supprimé/fusionné en base : on oublie l'identifiant
        // local et on recommence (adoption ou création propre).
        localStorage.removeItem(RESTAURANT_ID_KEY);
        localStorage.removeItem(RESTAURANT_TOKEN_KEY);
        return syncWithApi(data);
      }
      if (!syncRes.ok) {
        console.warn('Full-sync failed:', syncRes.status, syncRes.statusText);
        return { success: false, restaurantId: rid };
      }
    }

    return { success: true, restaurantId: rid };
  } catch (err) {
    console.warn('API sync failed (falling back to localStorage)', err);
    return { success: false, restaurantId: getRestaurantId() };
  }
}

async function loadFromApi() {
  try {
    const rid = getRestaurantId();
    if (!rid) return null;

    const res = await fetch(window.AURESTO_API_BASE + `/api/restaurants/${rid}/full-state`, {
      headers: apiHeaders()
    });
    if (!res.ok) return null;

    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('API load failed (falling back to localStorage)', err);
    return null;
  }
}

async function resolveRestaurantIdByName(name, email) {
  const normalizedName = String(name || '').trim().slice(0, 120);
  if (!normalizedName) return null;

  const params = new URLSearchParams({ name: normalizedName });
  if (email) params.set('email', email);
  const res = await fetch(window.AURESTO_API_BASE + `/api/public/restaurants/resolve?${params.toString()}`);
  if (!res.ok) return null;

  const data = await res.json();
  const id = parseInt(data.id, 10) || null;
  if (id) setRestaurantId(id);
  return id;
}

function loadCache() {
  // Toujours lire depuis localStorage pour refléter les changements
  // faits par d'autres onglets (ex: commande client → dashboard)
  const raw = localStorage.getItem(STORAGE_KEY);
  stateCache = raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
  return stateCache;
}

function openIndexedDB() {
  if (!window.indexedDB) return Promise.reject(new Error('IndexedDB non supporté'));
  if (openIndexedDB.dbPromise) return openIndexedDB.dbPromise;
  openIndexedDB.dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return openIndexedDB.dbPromise;
}

function readIndexedDBState() {
  return openIndexedDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const request = store.get('app');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result?.payload || null);
  }));
}

function writeIndexedDBState(data) {
  return openIndexedDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.put({ id: 'app', payload: data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  })).catch(() => {
    // IndexedDB is optional. Keep working with localStorage.
  });
}

const defaultState = () => ({
  plan: 'Free',
  account: { provider: 'local', name: '', email: '', phone: '', password: '' },
  restaurant: { name: '', address: '', city: 'Dakar', phone: '', hours: '', hoursSchedule: {}, description: '', location: { latitude: '', longitude: '' } },
  branding: { logo: '', colors: { primary: '#124d58', secondary: '#0a566c', accent: '#e8a878' } },
  // Les réglages de présentation sont réservés à l'offre Gold.
  menuCustomization: {
    template: 'midnight',
    background: 'gradient',
    backgroundImage: '',
    overlay: 60,
    gradient: { colors: ['#071820', '#124d58'], from: '#071820', to: '#124d58', angle: 135 },
    colors: {
      primary: '#124d58',
      secondary: '#0a566c',
      accent: '#e8a878',
      text: '#f3ede4',
      muted: '#b8b2aa',
      surface: '#17140f'
    },
    layout: 'cards',
    radius: 18,
    spacing: 16,
    logo: { shape: 'circle', position: 'center', size: 44 },
    display: {
      images: true,
      descriptions: true,
      prices: true,
      badges: true,
      favorites: true
    },
    tapEffect: 'elevate',
    categoryOrder: []
  },
  integration: { geminiApiKey: '' },
  menu: {
    categories: ['Plats', 'Boissons', 'Desserts'],
    items: []
  },
  tables: [],
  orders: [],
  qrConfig: {
    printLayout: 'chevalet',
    headerTemplate: 'Table {name}',
    footerText: 'Scannez pour commander'
  },
  onboardingStep: 1,
  onboardingComplete: false,
  // true quand une synchronisation serveur a echoue : elle sera retentee
  // au prochain demarrage. L'application reste utilisable entre-temps.
  pendingSync: false,
  createdAt: null
});

const AurestoStore = {
  load() {
    // Synchrone: use cache + localStorage
    try {
      // Aucune clé d'API ne doit vivre côté navigateur : les appels IA
      // passent par le proxy backend (/api/restaurants/:id/marketing/*),
      // qui garde le secret côté serveur.
      return { ...defaultState(), ...loadCache() };
    } catch {
      return defaultState();
    }
  },

  async init() {
    // Async init: try to load from API on startup
    try {
      const apiData = await loadFromApi();
      if (apiData && apiData.restaurant) {
        // Merge API data with local data to preserve menu items if API doesn't have them
        const localData = this.load();
        const state = { ...defaultState(), ...localData, restaurant: apiData.restaurant };

        // Only use API menu if it has items, otherwise keep local menu
        if (apiData.menu && apiData.menu.items && apiData.menu.items.length > 0) {
          state.menu = apiData.menu;
        }

        stateCache = state;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (storageErr) {
          console.warn('localStorage.setItem failed during init:', storageErr);
        }
        return state;
      }
    } catch (err) {
      console.warn('API init failed, using localStorage', err);
    }

    // Synchronisation restee en attente (serveur endormi ou hors ligne au
    // moment de l'inscription) : on retente en arriere-plan, sans bloquer
    // l'affichage de la page.
    const local = this.load();
    if (local.pendingSync && local.restaurant?.name) {
      syncWithApi(local)
        .then(result => {
          if (result.success) this.update({ pendingSync: false });
        })
        .catch(err => console.warn('Nouvelle tentative de synchronisation echouee:', err));
    }

    return local;
  },

  save(data, options = {}) {
    const { sync = true } = options;

    stateCache = data;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('localStorage.setItem quota exceeded:', err);
    }
    writeIndexedDBState(data);

    // Async sync to API (non-blocking). Live design edits can opt out and
    // batch their server sync after the user has stopped changing a control.
    if (sync) {
      syncWithApi(data).catch(err => console.warn('syncWithApi error:', err));
    }

    return data;
  },

  update(patch) {
    const data = { ...this.load(), ...patch };
    return this.save(data);
  },

  // sync local state to backend API (blocking, returns result)
  async syncToServer() {
    try {
      const state = this.load();
      return await syncWithApi(state);
    } catch (err) {
      console.warn('syncToServer failed', err);
      return { success: false, restaurantId: null };
    }
  },

  reset() {
    localStorage.removeItem(STORAGE_KEY);
    const data = defaultState();
    stateCache = data;
    writeIndexedDBState(data);
    return data;
  },

  // Identifiant du restaurant courant (URL ?r= ou localStorage). Utile aux
  // pages publiques comme le menu client, qui n'ont pas de jeton.
  getRestaurantId() {
    return getRestaurantId();
  },

  resolveRestaurantIdByName(name) {
    return resolveRestaurantIdByName(name);
  },

  isLoggedIn() {
    const data = this.load();
    return Boolean(data.account?.email && data.onboardingComplete);
  },

  addMenuItem(item) {
    const data = this.load();
    const id = `item_${Date.now()}`;
    data.menu.items.push({ id, available: true, ...item });
    return this.save(data);
  },

  removeMenuItem(id) {
    const data = this.load();
    data.menu.items = data.menu.items.filter((i, index) => (i.id || `dish_${index}`) !== id && i.id !== id);
    return this.save(data);
  },

  toggleMenuItemAvailability(id) {
    const data = this.load();
    const item = data.menu.items.find((i, index) => (i.id || `dish_${index}`) === id || i.id === id);
    if (item) {
      item.available = item.available === false ? true : false;
      this.save(data);
    }
    return data;
  },

  setMenu(items, categories) {
    const data = this.load();
    data.menu.categories = categories;
    data.menu.items = items.map(item => ({
      id: item.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      available: item.available !== false,
      name: item.name,
      category: item.category,
      description: item.description || '',
      price: item.price,
      photo: item.photo || ''
    }));
    return this.save(data);
  },

  addTable(name) {
    const data = this.load();
    const id = `table_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    data.tables.push({ id, name });
    return this.save(data);
  },

  removeTable(id) {
    const data = this.load();
    data.tables = data.tables.filter(t => t.id !== id);
    return this.save(data);
  },

  updateTable(id, updates) {
    const data = this.load();
    const table = data.tables.find(t => t.id === id);
    if (table) Object.assign(table, updates);
    return this.save(data);
  },

  duplicateTable(id) {
    const data = this.load();
    const source = data.tables.find(t => t.id === id);
    if (!source) return this.save(data);
    const copy = {
      id: `table_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${source.name} (copie)`
    };
    const idx = data.tables.findIndex(t => t.id === id);
    data.tables.splice(idx + 1, 0, copy);
    return this.save(data);
  },

  addTablesBulk(names) {
    const data = this.load();
    names.forEach(name => {
      data.tables.push({
        id: `table_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name
      });
    });
    return this.save(data);
  },

  addOrder(order) {
    const data = this.load();
    const id = `order_${Date.now()}`;
    const full = {
      id,
      status: 'new',
      createdAt: new Date().toISOString(),
      ...order
    };
    data.orders.unshift(full);
    if (!location.pathname.endsWith('orders.html')) {
      setOrdersUnread();
    }

    const rid = data.restaurant?.id || getRestaurantId();
    if (rid && window.fetch) {
      const apiBase = window.AURESTO_API_BASE || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:4000' : window.location.origin);
      fetch(`${apiBase}/api/restaurants/${rid}/orders`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          // Identifiant local transmis au serveur : c'est la clé qui
          // permet ensuite de retrouver la commande côté base, les ids
          // locaux (order_<timestamp>) n'étant pas les ids SERIAL.
          clientOrderId: id,
          tableNumber: order.tableName || order.tableId || '01',
          customerName: order.customerName || null,
          items: order.items || [],
          orderType: order.orderType || 'dinein',
          total: order.total || 0,
          paymentMethod: order.payment || 'CASH',
          status: full.status
        })
      }).catch(e => console.warn('API addOrder sync fallback:', e));
    }

    return this.save(data);
  },

  updateOrderStatus(id, status) {
    const data = this.load();
    const order = data.orders.find(o => o.id === id);
    if (order) order.status = status;

    const rid = data.restaurant?.id || getRestaurantId();
    if (rid && window.fetch) {
      const apiBase = window.AURESTO_API_BASE || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:4000' : window.location.origin);
      fetch(`${apiBase}/api/restaurants/${rid}/orders/${id}/status`, {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ status })
      }).catch(e => console.warn('API updateOrderStatus sync fallback:', e));
    }

    return this.save(data);
  },

  getTableUrl(tableId) {
    const base = `${location.origin}${location.pathname.replace(/[^/]+$/, '')}client.html`;
    const data = this.load();
    // L'identifiant du restaurant est indispensable : le client qui scanne
    // le QR code n'a aucune donnée locale et doit pouvoir déposer un avis.
    const rid = data.restaurant?.id || getRestaurantId();
    const params = new URLSearchParams({
      restaurant: data.restaurant?.name || 'restaurant',
      table: tableId
    });
    if (rid) params.set('r', rid);
    return `${base}?${params.toString()}`;
  },

  updateQrConfig(qrConfig) {
    const data = this.load();
    data.qrConfig = { ...data.qrConfig, ...qrConfig };
    return this.save(data);
  },

  getStats() {
    const data = this.load();
    const today = new Date().toDateString();
    const todayOrders = data.orders.filter(o => new Date(o.createdAt).toDateString() === today);
    const revenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const itemCounts = {};

    todayOrders.forEach(o => {
      (o.items || []).forEach(i => {
        itemCounts[i.name] = (itemCounts[i.name] || 0) + (i.qty || 1);
      });
    });

    const popular = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      todayOrders: todayOrders.length,
      revenue,
      avgBasket: todayOrders.length ? Math.round(revenue / todayOrders.length) : 0,
      popular,
      active: data.orders.filter(o => ['new', 'preparing', 'ready'].includes(o.status)).length,
      completed: data.orders.filter(o => o.status === 'served').length
    };
  }
};

// ---------------------------------------------------------------
// Gestionnaire des Badges du Menu Latéral (Avis, Marketing, Commandes)
// ---------------------------------------------------------------
const UNREAD_REVIEWS_KEY = 'auresto_unread_reviews_count';
const LAST_SEEN_REVIEW_TIME_KEY = 'auresto_last_seen_review_time';
const MARKETING_SEEN_KEY = 'auresto_marketing_seen';
const ORDERS_SEEN_KEY = 'auresto_orders_seen';
const SOCKET_IO_CDN = 'https://cdn.socket.io/4.7.2/socket.io.min.js';

// --- 1. Avis Clients ---
function getUnreadReviewsCount() {
  try { return parseInt(localStorage.getItem(UNREAD_REVIEWS_KEY), 10) || 0; } catch { return 0; }
}

function getLastSeenReviewTime() {
  try { return localStorage.getItem(LAST_SEEN_REVIEW_TIME_KEY) || null; } catch { return null; }
}

function setUnreadReviewsCount(count) {
  const c = Math.max(0, count);
  try {
    localStorage.setItem(UNREAD_REVIEWS_KEY, String(c));
  } catch {}
  updateSidebarReviewBadge(c);
  try {
    window.dispatchEvent(new CustomEvent('auresto:unread_reviews_changed', { detail: { count: c } }));
  } catch {}
}

function clearUnreadReviews() {
  try {
    localStorage.setItem(LAST_SEEN_REVIEW_TIME_KEY, new Date().toISOString());
  } catch {}
  setUnreadReviewsCount(0);
}

function updateSidebarReviewBadge(count = getUnreadReviewsCount()) {
  const isAvisPage = location.pathname.endsWith('avis.html');
  if (isAvisPage && count > 0) {
    clearUnreadReviews();
    return;
  }

  const reviewNavLinks = document.querySelectorAll('a[href="avis.html"]');
  reviewNavLinks.forEach(link => {
    let badge = link.querySelector('.nav-badge, #reviewNavBadge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'reviewNavBadge';
        link.appendChild(badge);
      }
      badge.className = 'nav-badge new';
      badge.textContent = 'Nouveau';
      badge.hidden = false;
      badge.style.display = 'inline-flex';
    } else if (badge) {
      badge.hidden = true;
      badge.style.display = 'none';
    }
  });
}

async function syncUnreadReviewsFromApi() {
  if (location.pathname.endsWith('avis.html')) {
    clearUnreadReviews();
    return;
  }

  const rid = getRestaurantId();
  if (!rid || !getRestaurantToken()) return;

  try {
    const res = await fetch(
      `${window.AURESTO_API_BASE}/api/restaurants/${rid}/reviews`,
      { headers: apiHeaders() }
    );
    if (!res.ok) return;

    const data = await res.json();
    const reviews = data.reviews || [];
    let lastSeen = getLastSeenReviewTime();

    if (!lastSeen) {
      const baseline = reviews[0]?.createdAt || new Date().toISOString();
      try { localStorage.setItem(LAST_SEEN_REVIEW_TIME_KEY, baseline); } catch {}
      setUnreadReviewsCount(0);
      return;
    }

    const lastSeenMs = new Date(lastSeen).getTime();
    const unread = reviews.filter(r => new Date(r.createdAt).getTime() > lastSeenMs).length;
    setUnreadReviewsCount(unread);
  } catch (err) {
    console.warn('[Auresto] syncUnreadReviewsFromApi:', err);
  }
}

// --- 2. Marketing ---
function getMarketingSeen() {
  try { return localStorage.getItem(MARKETING_SEEN_KEY) === 'true'; } catch { return false; }
}

function clearMarketingUnread() {
  try {
    localStorage.setItem(MARKETING_SEEN_KEY, 'true');
  } catch {}
  updateSidebarMarketingBadge();
  try {
    window.dispatchEvent(new CustomEvent('auresto:marketing_changed'));
  } catch {}
}

function updateSidebarMarketingBadge() {
  const isMarketingPage = location.pathname.endsWith('marketing.html');
  if (isMarketingPage && !getMarketingSeen()) {
    clearMarketingUnread();
    return;
  }

  const isSeen = getMarketingSeen();
  const marketingNavLinks = document.querySelectorAll('a[href="marketing.html"]');
  marketingNavLinks.forEach(link => {
    let badge = link.querySelector('.nav-badge.new, .nav-badge, #marketingNavBadge');
    if (!isSeen) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'marketingNavBadge';
        link.appendChild(badge);
      }
      badge.className = 'nav-badge new';
      badge.textContent = 'Nouveau';
      badge.hidden = false;
      badge.style.display = 'inline-flex';
    } else if (badge) {
      badge.hidden = true;
      badge.style.display = 'none';
    }
  });
}

// --- 3. Commandes ---
function getOrdersSeen() {
  try {
    const val = localStorage.getItem(ORDERS_SEEN_KEY);
    return val !== 'false';
  } catch { return true; }
}

function setOrdersUnread() {
  try {
    localStorage.setItem(ORDERS_SEEN_KEY, 'false');
  } catch {}
  updateSidebarOrdersBadge();
  try {
    window.dispatchEvent(new CustomEvent('auresto:orders_changed'));
  } catch {}
}

function clearUnreadOrders() {
  try {
    localStorage.setItem(ORDERS_SEEN_KEY, 'true');
  } catch {}
  updateSidebarOrdersBadge();
  try {
    window.dispatchEvent(new CustomEvent('auresto:orders_changed'));
  } catch {}
}

function updateSidebarOrdersBadge() {
  const isOrdersPage = location.pathname.endsWith('orders.html');
  if (isOrdersPage && !getOrdersSeen()) {
    clearUnreadOrders();
    return;
  }

  const isSeen = getOrdersSeen();
  const orderNavLinks = document.querySelectorAll('a[href="orders.html"]');
  orderNavLinks.forEach(link => {
    let badge = link.querySelector('.nav-badge.new, .nav-badge, #ordersNavBadge');
    if (!isSeen) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'ordersNavBadge';
        link.appendChild(badge);
      }
      badge.className = 'nav-badge new';
      badge.textContent = 'Nouveau';
      badge.hidden = false;
      badge.style.display = 'inline-flex';
    } else if (badge) {
      badge.hidden = true;
      badge.style.display = 'none';
    }
  });
}

// --- Sockets et Listeners ---
function loadSocketIoScript() {
  return new Promise((resolve, reject) => {
    if (typeof io !== 'undefined') {
      resolve(window.io);
      return;
    }
    const existing = document.querySelector(`script[src="${SOCKET_IO_CDN}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.io));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = SOCKET_IO_CDN;
    script.async = true;
    script.onload = () => resolve(window.io);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function connectAppSockets() {
  const rid = getRestaurantId();
  if (!rid) return;

  loadSocketIoScript()
    .then(ioLib => {
      const socket = ioLib(window.AURESTO_API_BASE);
      socket.emit('join_restaurant', rid);
      socket.on('review:new', () => {
        if (location.pathname.endsWith('avis.html')) {
          if (typeof loadReviews === 'function') loadReviews();
          clearUnreadReviews();
        } else {
          syncUnreadReviewsFromApi();
        }
      });
      socket.on('order:new', () => {
        if (location.pathname.endsWith('orders.html')) {
          clearUnreadOrders();
        } else {
          setOrdersUnread();
        }
      });
    })
    .catch(err => console.warn('[Auresto] Socket error:', err));
}

function initSidebarBadgesListener() {
  const boot = () => {
    // Si on est sur une page spécifique, marquer comme lu immédiatement
    if (location.pathname.endsWith('avis.html')) clearUnreadReviews();
    if (location.pathname.endsWith('marketing.html')) clearMarketingUnread();
    if (location.pathname.endsWith('orders.html')) clearUnreadOrders();

    // Mettre à jour les badges
    updateSidebarReviewBadge();
    updateSidebarMarketingBadge();
    updateSidebarOrdersBadge();

    // Attacher des événements click sur tous les liens correspondants
    document.querySelectorAll('a[href="avis.html"]').forEach(el => {
      el.addEventListener('click', () => clearUnreadReviews());
    });
    document.querySelectorAll('a[href="marketing.html"]').forEach(el => {
      el.addEventListener('click', () => clearMarketingUnread());
    });
    document.querySelectorAll('a[href="orders.html"]').forEach(el => {
      el.addEventListener('click', () => clearUnreadOrders());
    });

    syncUnreadReviewsFromApi();
    connectAppSockets();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('storage', (e) => {
    if (e.key === UNREAD_REVIEWS_KEY) {
      updateSidebarReviewBadge(parseInt(e.newValue, 10) || 0);
    }
    if (e.key === MARKETING_SEEN_KEY) {
      updateSidebarMarketingBadge();
    }
    if (e.key === ORDERS_SEEN_KEY) {
      updateSidebarOrdersBadge();
    }
  });

  window.addEventListener('auresto:unread_reviews_changed', (e) => {
    updateSidebarReviewBadge(e.detail?.count ?? getUnreadReviewsCount());
  });
  window.addEventListener('auresto:marketing_changed', () => {
    updateSidebarMarketingBadge();
  });
  window.addEventListener('auresto:orders_changed', () => {
    updateSidebarOrdersBadge();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncUnreadReviewsFromApi();
  });

  window.addEventListener('focus', () => syncUnreadReviewsFromApi());
}

AurestoStore.getUnreadReviewsCount = getUnreadReviewsCount;
AurestoStore.setUnreadReviewsCount = setUnreadReviewsCount;
AurestoStore.clearUnreadReviews = clearUnreadReviews;
AurestoStore.updateSidebarReviewBadge = updateSidebarReviewBadge;

AurestoStore.getMarketingSeen = getMarketingSeen;
AurestoStore.clearMarketingUnread = clearMarketingUnread;
AurestoStore.updateSidebarMarketingBadge = updateSidebarMarketingBadge;

AurestoStore.getOrdersSeen = getOrdersSeen;
AurestoStore.setOrdersUnread = setOrdersUnread;
AurestoStore.clearUnreadOrders = clearUnreadOrders;
AurestoStore.updateSidebarOrdersBadge = updateSidebarOrdersBadge;

initSidebarBadgesListener();

window.AURESTO_API_BASE = window.AURESTO_API_BASE;
window.AurestoStore = AurestoStore;

readIndexedDBState().then(dbData => {
  if (!dbData) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  const cached = loadCache();
  const currentCreated = cached.createdAt;
  const dbCreated = dbData.createdAt;

  if (!raw || (dbCreated && currentCreated && dbCreated > currentCreated) || !currentCreated) {
    stateCache = { ...defaultState(), ...dbData };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateCache));
  }
}).catch(() => {});
