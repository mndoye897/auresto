const STORAGE_KEY = 'auresto_data';
const RESTAURANT_ID_KEY = 'auresto_restaurant_id';
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
    restaurantId = parseInt(localStorage.getItem(RESTAURANT_ID_KEY)) || null;
  }
  return restaurantId;
}

function setRestaurantId(id) {
  restaurantId = id;
  if (id) localStorage.setItem(RESTAURANT_ID_KEY, id);
}

async function syncWithApi(data) {
  if (!data.restaurant?.name) return { success: false, restaurantId: null };

  try {
    // Try to create or get restaurant ID if not set
    let rid = getRestaurantId();
    if (!rid) {
      // Create restaurant in DB
      const res = await fetch(window.AURESTO_API_BASE + '/api/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.restaurant.name })
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
    }

    // Sync full state (including hoursSchedule)
    if (rid) {
      const syncRes = await fetch(window.AURESTO_API_BASE + `/api/restaurants/${rid}/full-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant: data.restaurant,
          categories: data.menu?.categories || [],
          menu: data.menu || { items: [] }
        })
      });
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

    const res = await fetch(window.AURESTO_API_BASE + `/api/restaurants/${rid}/full-state`);
    if (!res.ok) return null;

    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('API load failed (falling back to localStorage)', err);
    return null;
  }
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
  createdAt: null
});

const AurestoStore = {
  load() {
    // Synchrone: use cache + localStorage
    try {
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return state;
      }
    } catch (err) {
      console.warn('API init failed, using localStorage', err);
    }
    return this.load();
  },

  save(data, options = {}) {
    const { sync = true } = options;

    stateCache = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

    const rid = data.restaurant?.id || getRestaurantId();
    if (rid && window.fetch) {
      const apiBase = window.AURESTO_API_BASE || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:4000' : window.location.origin);
      fetch(`${apiBase}/api/restaurants/${rid}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableNumber: order.tableName || order.tableId || '01',
          items: order.items || [],
          total: order.total || 0,
          paymentMethod: order.payment || 'CASH'
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      }).catch(e => console.warn('API updateOrderStatus sync fallback:', e));
    }

    return this.save(data);
  },

  getTableUrl(tableId) {
    const base = `${location.origin}${location.pathname.replace(/[^/]+$/, '')}client.html`;
    const data = this.load();
    return `${base}?restaurant=${encodeURIComponent(data.restaurant?.name || 'restaurant')}&table=${encodeURIComponent(tableId)}`;
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