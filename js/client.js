let cart = [];
let favorites = new Set();
let activeCategory = 'Tous';
let tableId = '';
let tableName = '';
let paymentMethod = 'wave';
const MENU_CUSTOMIZATION_PREVIEW_KEY = 'auresto_menu_customization_preview';
const isPreviewMode = new URLSearchParams(location.search).get('preview') === '1';
const liveDesignChannel = 'BroadcastChannel' in window ? new BroadcastChannel('auresto-menu-design') : null;
let livePreviewCustomization = null;
let livePreviewContent = null;
let clientReady = false;

function getData() {
  return AurestoStore.load();
}

function withLivePreviewContent(data) {
  if (!isPreviewMode || !livePreviewContent) return data;
  return {
    ...data,
    restaurant: { ...(data.restaurant || {}), ...(livePreviewContent.restaurant || {}) },
    branding: { ...(data.branding || {}), ...(livePreviewContent.branding || {}) }
  };
}

function renderRestaurantIdentity(data, fallbackName = '') {
  const restaurant = data.restaurant || {};
  const restoName = restaurant.name || fallbackName || 'Auresto';
  const description = restaurant.description || 'Découvrez nos plats raffinés préparés avec passion 🤎';
  document.getElementById('clientName').textContent = restoName;
  document.getElementById('heroTitle').textContent = restoName;
  document.getElementById('heroSubtitle').textContent = description;

  const brandEmblem = document.getElementById('brandEmblem');
  if (data.branding?.logo) {
    brandEmblem.innerHTML = `<img src="${data.branding.logo}" alt="${restoName} logo" />`;
  } else {
    brandEmblem.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 19c0-3.31 2.69-6 6-6s6 2.69 6 6"/><circle cx="12" cy="6" r="3.2"/><line x1="3" y1="19" x2="21" y2="19"/></svg>';
  }
}

function getMenuCustomization(data) {
  const saved = data.menuCustomization || {};
  let preview = livePreviewCustomization;

  if (!preview && isPreviewMode) {
    try {
      preview = JSON.parse(sessionStorage.getItem(MENU_CUSTOMIZATION_PREVIEW_KEY) || '{}');
    } catch {
      preview = {};
    }
  }

  if (!preview || !Object.keys(preview).length) return saved;

  return {
    ...saved,
    ...preview,
    colors: { ...(saved.colors || {}), ...(preview.colors || {}) },
    display: { ...(saved.display || {}), ...(preview.display || {}) },
    gradient: { ...(saved.gradient || {}), ...(preview.gradient || {}) },
    logo: { ...(saved.logo || {}), ...(preview.logo || {}) }
  };
}

function getOrderedCategories(data, customization) {
  const categories = Array.isArray(data.menu?.categories) ? data.menu.categories : [];
  const preferredOrder = Array.isArray(customization.categoryOrder) ? customization.categoryOrder : [];
  const known = new Set(categories);
  const ordered = preferredOrder.filter(category => known.has(category));
  return [...ordered, ...categories.filter(category => !ordered.includes(category))];
}

function applyMenuCustomization(data) {
  const customization = getMenuCustomization(data);
  const colors = customization.colors || {};
  const display = customization.display || {};
  const gradient = customization.gradient || {};
  const logo = customization.logo || {};
  const root = document.documentElement;

  // Build gradient from colors array (supports 2+ colors)
  const gradientColors = Array.isArray(gradient.colors) && gradient.colors.length >= 2
    ? gradient.colors
    : [gradient.from || '#071820', gradient.to || colors.primary || '#124d58'];
  const gradientStops = gradientColors.join(', ');

  const gradientBackground = `linear-gradient(${Number(gradient.angle) || 135}deg, ${gradientStops})`;
  const themeBackgrounds = {
    gradient: gradientBackground,
    solid: gradientColors[0] || colors.primary || '#124d58',
    dark: gradientBackground,
    light: gradientBackground,
    tropical: gradientBackground,
    ocean: gradientBackground,
    sunset: gradientBackground,
    forest: gradientBackground,
    royal: gradientBackground,
    rose: gradientBackground,
    wood: 'linear-gradient(115deg, rgba(49, 25, 11, .9), rgba(104, 59, 25, .84)), repeating-linear-gradient(8deg, rgba(255,255,255,.03) 0 2px, transparent 2px 11px)',
    marble: 'linear-gradient(135deg, #101315 0%, #22262a 45%, #101315 100%)'
  };

  root.style.setProperty('--client-primary', colors.primary || '#124d58');
  root.style.setProperty('--client-secondary', colors.secondary || '#0a566c');
  root.style.setProperty('--client-accent', colors.accent || '#e8a878');
  root.style.setProperty('--client-text', colors.text || '#f3ede4');
  root.style.setProperty('--client-muted', colors.muted || '#b8b2aa');
  root.style.setProperty('--client-surface', colors.surface || '#17140f');
  root.style.setProperty('--client-bg', themeBackgrounds[customization.background] || themeBackgrounds.gradient);
  root.style.setProperty('--client-radius', `${Number(customization.radius) || 18}px`);
  root.style.setProperty('--client-menu-gap', `${Math.min(28, Math.max(8, Number(customization.spacing) || 14))}px`);
  root.style.setProperty('--client-logo-size', `${Math.min(72, Math.max(32, Number(logo.size) || 44))}px`);
  root.style.setProperty('--client-overlay', `${Math.min(90, Math.max(0, Number(customization.overlay) || 60)) / 100}`);

  const supportedLayouts = ['cards', 'vertical', 'separated'];
  document.body.dataset.menuLayout = supportedLayouts.includes(customization.layout) ? customization.layout : 'cards';
  document.body.dataset.tapEffect = customization.tapEffect || 'elevate';
  document.body.dataset.logoShape = logo.shape || 'circle';
  document.body.dataset.logoPosition = logo.position || 'center';
  document.body.dataset.showImages = display.images !== false;
  document.body.dataset.showDescriptions = display.descriptions !== false;
  document.body.dataset.showPrices = display.prices !== false;
  document.body.dataset.showBadges = display.badges !== false;
  document.body.dataset.showFavorites = display.favorites !== false;

  const hero = document.getElementById('heroBanner');
  if (hero && customization.backgroundImage) {
    hero.style.backgroundImage = `url("${customization.backgroundImage}")`;
  } else if (hero) {
    hero.style.backgroundImage = '';
  }

  return customization;
}

function getItemQty(id) {
  const line = cart.find(c => c.id === id);
  return line ? line.qty : 0;
}

// Maps a category name to an icon glyph, reusing AurestoIcons where possible.
function categoryIconSvg(catName) {
  const lower = (catName || '').toLowerCase();

  if (catName === 'Tous') {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h18"/><path d="M4 17a8 8 0 0 1 16 0"/><path d="M12 4v2"/><circle cx="12" cy="3" r="0.6" fill="currentColor"/></svg>';
  }
  if (lower.includes('entr')) return AurestoIcons.get('leaf', { size: 22 });
  if (lower.includes('accompagn')) return AurestoIcons.get('coffee', { size: 22 });
  if (lower.includes('boisson') || lower.includes('drink')) return AurestoIcons.get('cup-soda', { size: 22 });
  if (lower.includes('dessert') || lower.includes('glace') || lower.includes('sucr')) return AurestoIcons.get('ice-cream', { size: 22 });
  if (lower.includes('plat') || lower.includes('grill') || lower.includes('viande')) return AurestoIcons.get('utensils', { size: 22 });
  return AurestoIcons.get('utensils', { size: 22 });
}

async function init() {
  const params = new URLSearchParams(location.search);
  tableId = params.get('table') || '';
  const restaurantName = params.get('restaurant') || '';

  let data = getData();

  console.log('Client init - local data items:', data.menu?.items?.length);

  if (!data.menu.items.length) {
    try {
      const apiData = await AurestoStore.init();
      if (apiData && apiData.menu && apiData.menu.items.length) {
        data = apiData;
        console.log('Client init - loaded from API:', data.menu.items.length, 'items');
      }
    } catch (err) {
      console.warn('API load failed, using local data:', err);
    }
  }

  // Only add test item if menu is completely empty and no reload flag
  if (!data.menu.items.length && !sessionStorage.getItem('testItemAdded')) {
    const testItem = {
      id: 'test_item_1',
      name: 'Thiéboudienne',
      category: 'Plats',
      price: 5000,
      description: 'Riz au poisson accompagné de légumes',
      photo: generateNanoBananaImage('Thiéboudienne'),
      image_url: generateNanoBananaImage('Thiéboudienne'),
      available: true
    };
    data.menu.items.push(testItem);
    if (!data.menu.categories.includes('Plats')) {
      data.menu.categories.push('Plats');
    }
    AurestoStore.save(data);
    sessionStorage.setItem('testItemAdded', 'true');
    console.log('Client init - added test item, reloading...');
    location.reload();
    return;
  }

  // Clear the flag after successful load
  if (data.menu.items.length > 0) {
    sessionStorage.removeItem('testItemAdded');
  }

  data = withLivePreviewContent(data);
  const table = data.tables.find(t => t.id === tableId);
  tableName = table?.name || params.get('table') || 'Table';
  const customization = applyMenuCustomization(data);

  renderRestaurantIdentity(data, restaurantName);
  document.getElementById('cartSheetTableTag').textContent = tableName;

  activeCategory = 'Tous';
  renderCategories(getOrderedCategories(data, customization));
  renderMenu(data);
  updateCartBar();
  clientReady = true;
}

function renderCategories(categories) {
  const nav = document.getElementById('catNav');
  const all = ['Tous', ...categories];
  nav.innerHTML = all.map(c => `
    <button type="button" class="cat-icon-btn${c === activeCategory ? ' active' : ''}" data-cat="${c}">
      <span class="cat-icon-glyph">${categoryIconSvg(c)}</span>
      <span class="cat-icon-label">${c}</span>
    </button>
  `).join('');
  nav.querySelectorAll('.cat-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      renderCategories(categories);
      renderMenu(getData());
    });
  });
}

function renderMenu(data) {
  const items = data.menu.items.filter(i => {
    if (activeCategory === 'Tous') return true;
    return i.category === activeCategory;
  });

  const list = document.getElementById('menuList');

  list.innerHTML = items.length
    ? items.map(item => {
      const imageUrl = getDishImageUrl(item);
      const imgId = `img_${item.id}`;
      const qty = getItemQty(item.id);
      const isFav = favorites.has(item.id);
      const isAvailable = item.available !== false;

      return `
      <article class="menu-item${!isAvailable ? ' unavailable' : ''}">
        ${isAvailable ? `
          <button type="button" class="fav-btn${isFav ? ' active' : ''}" data-fav="${item.id}" aria-label="Favori">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.05 3 5.5l7 7Z"/></svg>
          </button>
        ` : ''}
        <img id="${imgId}" src="${imageUrl}" alt="${item.name}" loading="lazy" />
        <div class="menu-item-body">
          <h3>${item.name}${!isAvailable ? ' <span class="badge-unavailable">Indisponible</span>' : ''}</h3>
          <p>${item.description || ''}</p>
          <div class="menu-item-footer">
            <span class="price">${Number(item.price).toLocaleString('fr-FR')} FCFA</span>
            ${isAvailable ? `
              <div class="qty-stepper">
                <button type="button" class="qty-minus" data-minus="${item.id}">−</button>
                <span class="qty-val" id="qtyval_${item.id}">${qty}</span>
                <button type="button" class="qty-plus" data-plus="${item.id}">+</button>
              </div>
            ` : `
              <span class="unavailable-label" style="font-size:12px;color:#ef4444;font-weight:600;background:rgba(239,68,68,0.15);padding:4px 8px;border-radius:6px;">Épuisé</span>
            `}
          </div>
        </div>
      </article>
    `;
    }).join('')
    : '<p class="menu-empty">Aucun plat dans cette catégorie.</p>';

  items.forEach(item => {
    const img = document.getElementById(`img_${item.id}`);
    if (img) {
      let loaded = false;
      img.onload = () => { loaded = true; };
      img.onerror = () => { if (!loaded) img.src = getDishImageUrl(item); };
      setTimeout(() => {
        if (!loaded && !img.complete) img.src = getDishImageUrl(item);
      }, 5000);
    }
  });

  list.querySelectorAll('[data-plus]').forEach(btn => {
    btn.addEventListener('click', () => stepItem(btn.dataset.plus, 1));
  });
  list.querySelectorAll('[data-minus]').forEach(btn => {
    btn.addEventListener('click', () => stepItem(btn.dataset.minus, -1));
  });
  list.querySelectorAll('[data-fav]').forEach(btn => {
    btn.addEventListener('click', () => toggleFavorite(btn.dataset.fav, btn));
  });
}

function refreshLivePreview() {
  if (!clientReady) return;

  const data = withLivePreviewContent(getData());
  const customization = applyMenuCustomization(data);
  const categories = getOrderedCategories(data, customization);

  if (activeCategory !== 'Tous' && !categories.includes(activeCategory)) {
    activeCategory = 'Tous';
  }

  renderRestaurantIdentity(data);
  renderCategories(categories);
  renderMenu(data);
}

function receiveLiveCustomization(customization) {
  if (!isPreviewMode || !customization || typeof customization !== 'object') return;
  livePreviewCustomization = customization;
  refreshLivePreview();
}

function receiveLiveContent(content) {
  if (!isPreviewMode || !content || typeof content !== 'object') return;
  livePreviewContent = content;
  refreshLivePreview();
}

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'auresto-preview:update') {
    receiveLiveCustomization(event.data.customization);
  }
  if (event.data?.type === 'auresto-preview:content') {
    receiveLiveContent(event.data.content);
  }
});

liveDesignChannel?.addEventListener('message', event => {
  if (event.data?.type === 'menu-design-update') {
    receiveLiveCustomization(event.data.customization);
  }
});

window.addEventListener('storage', event => {
  if (event.key === 'auresto_data') refreshLivePreview();
});

function toggleFavorite(itemId, btn) {
  if (favorites.has(itemId)) favorites.delete(itemId);
  else favorites.add(itemId);
  btn.classList.toggle('active');
}

function stepItem(itemId, delta) {
  const data = getData();
  const item = data.menu.items.find(i => i.id === itemId);
  if (!item) return;

  let existing = cart.find(c => c.id === itemId);
  if (delta > 0) {
    if (existing) existing.qty++;
    else cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
    showToast(`${item.name} ajouté`);
  } else if (existing) {
    existing.qty--;
    if (existing.qty <= 0) cart = cart.filter(c => c.id !== itemId);
  }

  const valEl = document.getElementById(`qtyval_${itemId}`);
  if (valEl) valEl.textContent = getItemQty(itemId);

  updateCartBar();
}

function addToCart(itemId) {
  stepItem(itemId, 1);
}

function updateCartBar() {
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const count = cart.reduce((s, c) => s + c.qty, 0);

  document.getElementById('cartBar').hidden = !count;
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartArticles').textContent = `${count} article${count > 1 ? 's' : ''}`;
  document.getElementById('cartTotal').textContent = `${total.toLocaleString('fr-FR')} FCFA`;

  const topBadge = document.getElementById('topCartBadge');
  topBadge.textContent = count;
  topBadge.hidden = !count;
}

function openCart() {
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  document.getElementById('cartContent').innerHTML = `
    <h2 style="font-size:16px;margin:0 0 12px">Votre commande</h2>
    ${cart.map(c => `
      <div class="cart-line-block">
        <div class="cart-line">
          <span>${c.name} × ${c.qty}</span>
          <div class="qty-controls">
            <button type="button" data-minus="${c.id}">−</button>
            <span>${c.qty}</span>
            <button type="button" data-plus="${c.id}">+</button>
          </div>
          <strong>${(c.price * c.qty).toLocaleString('fr-FR')} FCFA</strong>
        </div>
        <div class="cart-line-note">
          <input type="text" class="note-input" data-note="${c.id}" placeholder="Particularités : sans piment, sauce à part, bien cuit..." value="${(c.note || '').replace(/"/g, '&quot;')}" />
          <button type="button" class="remove-line-btn" data-remove="${c.id}" aria-label="Supprimer l'article">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('')}
    <p style="text-align:right;font-size:18px;font-weight:700;margin:16px 0;color:#fbf7f0">Total : ${total.toLocaleString('fr-FR')} FCFA</p>
    <h3 style="font-size:14px">Payer avec</h3>
    <div class="pay-options">
      <button type="button" class="pay-btn selected" data-pay="wave"><span>🌊</span> Wave</button>
      <button type="button" class="pay-btn" data-pay="orange"><span>🟠</span> Orange Money</button>
    </div>
    <button type="button" class="cart-order-btn" id="confirmPayBtn">Confirmer et payer</button>
    <button type="button" class="cart-footer-close-btn" id="cartFooterCloseBtn">Fermer</button>
  `;

  document.getElementById('cartPanel').classList.add('open');
  document.querySelectorAll('#cartContent [data-minus]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.minus, -1)));
  document.querySelectorAll('#cartContent [data-plus]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.plus, 1)));
  document.querySelectorAll('.pay-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.pay-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      paymentMethod = b.dataset.pay;
    });
  });
  document.getElementById('confirmPayBtn').addEventListener('click', confirmOrder);
  document.getElementById('cartFooterCloseBtn').addEventListener('click', closeCart);

  document.querySelectorAll('.note-input').forEach(input => {
    input.addEventListener('input', () => setLineNote(input.dataset.note, input.value));
  });
  document.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeCartLine(btn.dataset.remove));
  });
}

function setLineNote(itemId, value) {
  const line = cart.find(c => c.id === itemId);
  if (line) line.note = value;
}

function removeCartLine(itemId) {
  cart = cart.filter(c => c.id !== itemId);
  const valEl = document.getElementById(`qtyval_${itemId}`);
  if (valEl) valEl.textContent = 0;
  updateCartBar();
  openCart();
}

function changeQty(id, delta) {
  stepItem(id, delta);
  openCart();
}

function confirmOrder() {
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const orderData = {
    tableId,
    tableName,
    items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price, note: c.note || '' })),
    total,
    payment: paymentMethod
  };
  console.log('confirmOrder - saving order:', orderData);
  AurestoStore.addOrder(orderData);
  
  // Verify order was saved
  const savedData = AurestoStore.load();
  console.log('confirmOrder - orders after save:', savedData.orders.length);
  
  cart = [];
  updateCartBar();
  renderMenu(getData());
  document.getElementById('cartContent').innerHTML = `
    <div class="success-screen">
      <span>✓</span>
      <h2>Commande envoyée !</h2>
      <p>Paiement ${paymentMethod === 'wave' ? 'Wave' : 'Orange Money'} confirmé.<br />Votre commande arrive en cuisine.</p>
      <button type="button" class="cart-order-btn" style="margin-top:20px" id="doneBtn">Retour au menu</button>
    </div>
  `;
  document.getElementById('doneBtn').addEventListener('click', closeCart);
}

function closeCart() {
  document.getElementById('cartPanel').classList.remove('open');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2000);
}

document.getElementById('openCartBtn').addEventListener('click', openCart);
document.getElementById('cartSummaryToggle').addEventListener('click', openCart);
document.getElementById('validateOrderBtn').addEventListener('click', openCart);
document.getElementById('cartSheetCloseBtn').addEventListener('click', closeCart);
document.getElementById('cartPanel').addEventListener('click', e => {
  if (e.target === document.getElementById('cartPanel')) closeCart();
});

AurestoStore.init().then(init);
