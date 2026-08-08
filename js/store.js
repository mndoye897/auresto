const STORAGE_KEY = 'auresto_data';

const RESTAURANT_ID_KEY = 'auresto_restaurant_id';

const DB_NAME = 'AurestoDB';

const DB_STORE = 'appState';



// API configuration

window.AURESTO_API_BASE = window.AURESTO_API_BASE || 'http://localhost:4000';

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

  if (!data.restaurant?.name) return; // No valid restaurant yet

  

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

      const created = await res.json();

      if (created.id) {

        setRestaurantId(created.id);

        rid = created.id;

      }

    }

    

    // Sync full state (including hoursSchedule)

    if (rid) {

      await fetch(window.AURESTO_API_BASE + `/api/restaurants/${rid}/full-sync`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          restaurant: data.restaurant,

          categories: data.menu?.categories || [],

          menu: data.menu || { items: [] }

        })

      });

    }

  } catch (err) {

    console.warn('API sync failed (falling back to localStorage)', err);

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

  if (!stateCache) {

    const raw = localStorage.getItem(STORAGE_KEY);

    stateCache = raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();

  }

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

        const state = { ...defaultState(), restaurant: apiData.restaurant, menu: apiData.menu };

        stateCache = state;

        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

        return state;

      }

    } catch (err) {

      console.warn('API init failed, using localStorage', err);

    }

    return this.load();

  },



  save(data) {

    stateCache = data;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    writeIndexedDBState(data);

    

    // Async sync to API (non-blocking)

    syncWithApi(data).catch(err => console.warn('syncWithApi error:', err));

    

    return data;

  },



  update(patch) {

    const data = { ...this.load(), ...patch };

    return this.save(data);

  },



  // sync local state to backend API (optional)

  async syncToServer() {

    try {

      const state = this.load();

      const res = await fetch((window.AURESTO_API_BASE || '') + '/api/sync', {

        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state })

      });

      return await res.json();

    } catch (err) {

      console.warn('syncToServer failed', err);

      return null;

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

    data.menu.items = data.menu.items.filter(i => i.id !== id);

    return this.save(data);

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

    return this.save(data);

  },



  updateOrderStatus(id, status) {

    const data = this.load();

    const order = data.orders.find(o => o.id === id);

    if (order) order.status = status;

    return this.save(data);

  },



  getTableUrl(tableId) {

    const base = `${location.origin}${location.pathname.replace(/[^/]+$/, '')}client.html`;

    const data = this.load();

    return `${base}?restaurant=${encodeURIComponent(data.restaurant.name || 'restaurant')}&table=${encodeURIComponent(tableId)}`;

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

}).catch(() => {

  // ignore IndexedDB load errors

});

