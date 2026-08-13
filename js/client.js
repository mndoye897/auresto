let cart = [];
let favorites = new Set();
let activeCategory = 'Tous';
let tableId = '';
let tableName = '';
let paymentMethod = 'wave';
// Mode de service choisi par le client : 'dinein' (sur place) ou 'takeaway'.
let orderType = 'dinein';
const MENU_CUSTOMIZATION_PREVIEW_KEY = 'auresto_menu_customization_preview';
const isPreviewMode = new URLSearchParams(location.search).get('preview') === '1';
const liveDesignChannel = 'BroadcastChannel' in window ? new BroadcastChannel('auresto-menu-design') : null;
let livePreviewCustomization = null;
let livePreviewContent = null;
let clientReady = false;
let cartAddBadgeTimer = null;
const cardAddFeedbackTimers = new WeakMap();
let paymentCheckoutInProgress = false;

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
  const nameEl = document.getElementById('clientName');
  const titleEl = document.getElementById('heroTitle');
  const subEl = document.getElementById('heroSubtitle');
  if (nameEl) nameEl.textContent = restoName;
  if (titleEl) titleEl.textContent = restoName;
  if (subEl) subEl.textContent = description;

  const brandEmblem = document.getElementById('brandEmblem');
  if (brandEmblem) {
    if (data.branding?.logo) {
      brandEmblem.innerHTML = `<img src="${data.branding.logo}" alt="${restoName} logo" />`;
    } else {
      brandEmblem.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 19c0-3.31 2.69-6 6-6s6 2.69 6 6"/><circle cx="12" cy="6" r="3.2"/><line x1="3" y1="19" x2="21" y2="19"/></svg>';
    }
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

function categoryIconSvg(catName) {
  const lower = (catName || '').toLowerCase();
  if (catName === 'Tous') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17h18"/><path d="M4 17a8 8 0 0 1 16 0"/><path d="M12 4v2"/><circle cx="12" cy="3" r="0.6" fill="currentColor"/></svg>';
  }
  if (typeof AurestoIcons !== 'undefined' && AurestoIcons.get) {
    if (lower.includes('entr') || lower.includes('salad') || lower.includes('starter')) return AurestoIcons.get('leaf', { size: 20 });
    if (lower.includes('boisson') || lower.includes('drink') || lower.includes('jus')) return AurestoIcons.get('cup-soda', { size: 20 });
    if (lower.includes('dessert') || lower.includes('glace') || lower.includes('sucr')) return AurestoIcons.get('ice-cream', { size: 20 });
    if (lower.includes('grill') || lower.includes('bbq') || lower.includes('rôt')) return AurestoIcons.get('flame', { size: 20 });
    if (lower.includes('accompagn') || lower.includes('café') || lower.includes('thé')) return AurestoIcons.get('coffee', { size: 20 });
    return AurestoIcons.get('spoon', { size: 20 });
  }
  // Icône cuillère (spoon) élégante et minimale
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c-2.5 0-4.5 2-4.5 5 0 2.8 2 4.8 3.5 6.5V21a1 1 0 0 0 2 0v-7.5c1.5-1.7 3.5-3.7 3.5-6.5 0-3-2-5-4.5-5z"/></svg>';
}

async function init() {
  const params = new URLSearchParams(location.search);
  tableId = params.get('table') || '';
  const tableNameFromUrl = params.get('tableName') || tableId;
  const restaurantName = params.get('restaurant') || '';

  let data = getData();

  let rParam = params.get('r') || params.get('restaurantId');
  // Compatibilité avec les anciens QR codes, qui ne contenaient que le nom du
  // restaurant. Les nouveaux QR embarquent toujours ?r=<id>.
  if (!rParam && restaurantName && restaurantName !== 'restaurant') {
    try {
      rParam = await AurestoStore.resolveRestaurantIdByName?.(restaurantName) || '';
    } catch (err) {
      console.warn('Résolution du restaurant du QR impossible:', err);
    }
  }
  if (rParam || !data.menu?.items?.length) {
    try {
      const apiData = await AurestoStore.init();
      if (apiData && apiData.menu && apiData.menu.items.length) {
        data = apiData;
      }
    } catch (err) {
      console.warn('API load failed, using local data:', err);
    }
  }

  // Populate sample items if menu is empty
  if (!data.menu?.items?.length) {
    const sampleItems = [
      { id: 'plat_1', name: 'Thiéboudienne', category: 'Plats', price: 5000, description: 'Riz au poisson accompagné de légumes', available: true },
      { id: 'plat_2', name: 'Yassa Poulet', category: 'Plats', price: 4500, description: 'Poulet mariné à la sauce oignon et citron', available: true },
      { id: 'plat_3', name: 'Mafé de bœuf', category: 'Plats', price: 5500, description: 'Bœuf mijoté dans une sauce onctueuse aux arachides', available: true },
      { id: 'plat_4', name: 'Poulet DG', category: 'Plats', price: 4800, description: 'Poulet sauté aux légumes et plantains', available: true },
      { id: 'boisson_1', name: 'Jus de Bissap', category: 'Boissons', price: 1500, description: 'Infusion fraîche d’hibiscus parfumé à la menthe', available: true },
      { id: 'boisson_2', name: 'Gingembre Citron', category: 'Boissons', price: 1500, description: 'Jus de gingembre épicé pressé au citron vert', available: true },
      { id: 'boisson_3', name: 'Jus de Bouye', category: 'Boissons', price: 2000, description: 'Nectar de pain de singe (fruit du baobab) onctueux', available: true },
      { id: 'boisson_4', name: 'Cocktail Passion', category: 'Boissons', price: 2500, description: 'Mélange de fruits exotiques et fruit de la passion', available: true }
    ];
    data.menu.items = sampleItems;
    data.menu.categories = ['Plats', 'Boissons', 'Desserts'];
    AurestoStore.save(data);
  }

  data = withLivePreviewContent(data);
  const table = data.tables.find(t => t.id === tableId);
  tableName = table?.name || tableNameFromUrl || 'Table';
  const customization = applyMenuCustomization(data);

  renderRestaurantIdentity(data, restaurantName);
  renderOpeningHours(data.restaurant || {});
  const tagEl = document.getElementById('cartSheetTableTag');
  if (tagEl) tagEl.textContent = tableName;

  activeCategory = 'Tous';
  renderCategories(getOrderedCategories(data, customization));
  renderMenu(data);
  updateCartBar();
  initReviewForm(data);
  clientReady = true;

  const paymentReturn = params.get('payment');
  if (paymentReturn === 'success') {
    showToast('Paiement reçu. Confirmation sécurisée de votre commande en cours…');
  } else if (paymentReturn === 'failure') {
    showToast('Paiement non finalisé. Vous pouvez réessayer quand vous le souhaitez.');
  }
}

// ============================================================
// Avis client
//
// Le bloc est replié : seules les étoiles sont visibles. Donner une note
// déplie le reste du formulaire. L'envoi passe par la route publique
// POST /api/restaurants/:id/reviews (le client n'est pas authentifié).
// ============================================================
let reviewRating = 0;

function initReviewForm(data) {
  const block = document.getElementById('reviewBlock');
  const stars = document.getElementById('reviewStars');
  const details = document.getElementById('reviewDetails');
  const submit = document.getElementById('reviewSubmit');
  const feedback = document.getElementById('reviewFeedback');
  const toggleBtn = document.getElementById('reviewToggleBtn');
  const cancelBtn = document.getElementById('reviewCancelBtn');
  if (!block || !stars || !details || !submit) return;

  const nameEl = document.getElementById('reviewRestoName');
  if (nameEl) nameEl.textContent = data.restaurant?.name || 'le restaurant';

  const paintStars = value => {
    stars.querySelectorAll('.review-star').forEach(star => {
      const filled = Number(star.dataset.rating) <= value;
      star.classList.toggle('filled', filled);
      star.setAttribute('aria-checked', String(Number(star.dataset.rating) === value));
    });
  };

  const collapseReviewForm = () => {
    reviewRating = 0;
    paintStars(0);
    details.hidden = true;
    if (toggleBtn) toggleBtn.hidden = true;
    if (feedback) feedback.hidden = true;
    block.classList.remove('expanded');
    const commentInput = document.getElementById('reviewComment');
    const nameInput = document.getElementById('reviewName');
    if (commentInput) commentInput.value = '';
    if (nameInput) nameInput.value = '';
  };

  stars.querySelectorAll('.review-star').forEach(star => {
    star.addEventListener('click', () => {
      const clickedRating = Number(star.dataset.rating);
      // Cliquer sur la même étoile replie le formulaire
      if (reviewRating === clickedRating && !details.hidden) {
        collapseReviewForm();
        return;
      }
      reviewRating = clickedRating;
      paintStars(reviewRating);
      // Déplie le formulaire
      details.hidden = false;
      if (toggleBtn) toggleBtn.hidden = false;
      block.classList.add('expanded');
    });
  });

  if (toggleBtn) {
    toggleBtn.addEventListener('click', collapseReviewForm);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', collapseReviewForm);
  }

  const say = (msg, ok) => {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.className = 'review-feedback ' + (ok ? 'ok' : 'error');
    feedback.hidden = false;
  };

  submit.addEventListener('click', async () => {
    if (!reviewRating) return say('Choisissez d\'abord une note.', false);

    const rid = AurestoStore.getRestaurantId ? AurestoStore.getRestaurantId() : null;
    if (!rid) return say('Avis indisponible : restaurant non identifié.', false);

    submit.disabled = true;
    submit.textContent = 'Envoi…';
    try {
      const res = await fetch(`${window.AURESTO_API_BASE}/api/restaurants/${rid}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: reviewRating,
          comment: document.getElementById('reviewComment')?.value || '',
          customerName: document.getElementById('reviewName')?.value || '',
          tableName: tableName
        })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        block.classList.add('sent');
        if (toggleBtn) toggleBtn.hidden = true;
        if (typeof AurestoStore !== 'undefined' && AurestoStore.setUnreadReviewsCount) {
          const currentCount = AurestoStore.getUnreadReviewsCount ? AurestoStore.getUnreadReviewsCount() : 0;
          AurestoStore.setUnreadReviewsCount(currentCount + 1);
        } else {
          try {
            const cur = parseInt(localStorage.getItem('auresto_unread_reviews_count') || '0', 10);
            localStorage.setItem('auresto_unread_reviews_count', String(cur + 1));
          } catch (e) {}
        }
        say('Merci pour votre retour !', true);
        return;
      }
      // 429 = un avis a déjà été laissé récemment ; ce n'est pas une panne.
      say(body.message || 'Envoi impossible pour le moment.', false);
    } catch (err) {
      say('Connexion indisponible. Réessayez dans un instant.', false);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Envoyer mon avis';
    }
  });
}

function renderCategories(categories) {
  const nav = document.getElementById('catNav');
  if (!nav) return;
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
  const customization = getMenuCustomization(data);
  const categories = getOrderedCategories(data, customization);

  const categoriesToRender = activeCategory === 'Tous'
    ? categories
    : categories.filter(c => c === activeCategory);

  const list = document.getElementById('menuList');
  if (!list) return;

  if (!categoriesToRender.length || !data.menu?.items?.length) {
    list.innerHTML = '<p class="menu-empty">Aucun plat disponible.</p>';
    return;
  }

  let html = '';

  categoriesToRender.forEach(catName => {
    const catItems = data.menu.items.filter(item => item.category === catName);
    if (!catItems.length && activeCategory === 'Tous') return;

    const catSlug = catName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    html += `
      <section class="category-section" id="cat_sec_${catSlug}">
        <div class="category-header">
          <div class="category-title-wrap">
            <span class="category-dash">—</span>
            <h2 class="category-title">${catName}</h2>
          </div>
          <button type="button" class="see-all-btn" data-see-all="${catName}">
            Voir tout <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
        <div class="carousel-wrapper">
          <button type="button" class="slide-arrow prev" data-slide-prev="${catSlug}" aria-label="Précédent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div class="carousel-track" data-track="${catSlug}">
            ${catItems.map(item => {
              const imageUrl = getDishImageUrl(item);
              const imgId = `img_${item.id}`;
              const qty = getItemQty(item.id);
              const isFav = favorites.has(item.id);
              const isAvailable = item.available !== false;

              return `
                <article class="menu-item${!isAvailable ? ' unavailable' : ''}"${isAvailable ? ` data-card-add="${item.id}" role="button" tabindex="0" aria-label="Ajouter ${item.name} au panier"` : ''}>
                  <div class="menu-item-img-wrap">
                    <img id="${imgId}" src="${imageUrl}" alt="${item.name}" loading="lazy" />
                    ${isAvailable ? `
                      <button type="button" class="fav-btn${isFav ? ' active' : ''}" data-fav="${item.id}" aria-label="Favori">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.05 3 5.5l7 7Z"/></svg>
                      </button>
                    ` : ''}
                  </div>
                  <div class="menu-item-body">
                    <h3>${item.name}${!isAvailable ? ' <span class="badge-unavailable">Indisponible</span>' : ''}</h3>
                    <p>${item.description || ''}</p>
                    <div class="menu-item-footer">
                      <span class="price">${Number(item.price).toLocaleString('fr-FR')} FCFA</span>
                      ${isAvailable ? `
                        ${qty > 0 ? `
                          <div class="qty-stepper">
                            <button type="button" class="qty-minus" data-minus="${item.id}">−</button>
                            <span class="qty-val" id="qtyval_${item.id}">${qty}</span>
                            <button type="button" class="qty-plus" data-plus="${item.id}">+</button>
                          </div>
                        ` : `
                          <button type="button" class="btn-add-circle" data-plus="${item.id}" aria-label="Ajouter au panier">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                          </button>
                        `}
                      ` : `
                        <span class="unavailable-label">Épuisé</span>
                      `}
                    </div>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
          <button type="button" class="slide-arrow next" data-slide-next="${catSlug}" aria-label="Suivant">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      </section>
    `;
  });

  list.innerHTML = html || '<p class="menu-empty">Aucun plat trouvé.</p>';

  // Image fallback check
  data.menu.items.forEach(item => {
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

  // Carousel Slide Arrows controls (< and >)
  list.querySelectorAll('[data-slide-prev]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.slidePrev;
      const track = list.querySelector(`[data-track="${slug}"]`);
      if (track) track.scrollBy({ left: -280, behavior: 'smooth' });
    });
  });

  list.querySelectorAll('[data-slide-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.slideNext;
      const track = list.querySelector(`[data-track="${slug}"]`);
      if (track) track.scrollBy({ left: 280, behavior: 'smooth' });
    });
  });

  list.querySelectorAll('[data-see-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.seeAll;
      renderCategories(getOrderedCategories(data, customization));
      renderMenu(getData());
    });
  });

  // Sur mobile, viser le petit « + » est malaise : toute la carte ajoute au
  // panier. On ignore les clics partis d'un controle qui a deja sa propre
  // action (favori, +, −), sinon l'article serait ajoute deux fois.
  list.querySelectorAll('[data-card-add]').forEach(card => {
    const addFromCard = event => {
      if (event.target.closest('[data-plus], [data-minus], [data-fav]')) return;
      stepItem(card.dataset.cardAdd, 1, card);
    };
    card.addEventListener('click', addFromCard);
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      addFromCard(event);
    });
  });

  list.querySelectorAll('[data-plus]').forEach(btn => {
    btn.addEventListener('click', () => stepItem(btn.dataset.plus, 1, btn.closest('[data-card-add]')));
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

function stepItem(itemId, delta, sourceCard = null) {
  const data = getData();
  const item = data.menu.items.find(i => i.id === itemId);
  if (!item) return;

  let existing = cart.find(c => c.id === itemId);
  if (delta > 0) {
    if (existing) existing.qty++;
    else cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
    if (sourceCard) {
      showCardAddFeedback(sourceCard);
      playItemAddChime();
    } else {
      // L'animation de la carte remplace le toast global dans le menu.
      showToast(`${item.name} ajouté`);
    }
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

function showCardAddFeedback(card) {
  const previousTimer = cardAddFeedbackTimers.get(card);
  if (previousTimer) window.clearTimeout(previousTimer);

  let indicator = card.querySelector('.card-add-indicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'card-add-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="m5 12 4.5 4.5L19 7" />
      </svg>
    `;
    card.appendChild(indicator);
  }

  card.classList.remove('added-to-cart');
  indicator.classList.remove('is-visible');
  void card.offsetWidth;
  card.classList.add('added-to-cart');
  indicator.classList.add('is-visible');

  const timer = window.setTimeout(() => {
    card.classList.remove('added-to-cart');
    indicator.classList.remove('is-visible');
    cardAddFeedbackTimers.delete(card);
  }, 1100);
  cardAddFeedbackTimers.set(card, timer);
}

function showBottomCartAddBadge() {
  const badge = document.getElementById('bottomCartAddBadge');
  if (!badge) return;

  if (cartAddBadgeTimer) window.clearTimeout(cartAddBadgeTimer);
  badge.hidden = false;
  badge.classList.remove('is-visible');
  void badge.offsetWidth;
  badge.classList.add('is-visible');

  cartAddBadgeTimer = window.setTimeout(() => {
    badge.classList.remove('is-visible');
    cartAddBadgeTimer = window.setTimeout(() => {
      badge.hidden = true;
      cartAddBadgeTimer = null;
    }, 180);
  }, 1200);
}

function updateCartBar() {
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const count = cart.reduce((s, c) => s + c.qty, 0);

  const bar = document.getElementById('cartBar');
  if (bar) bar.hidden = !count;

  const countEl = document.getElementById('cartCount');
  if (countEl) countEl.textContent = count;

  const artEl = document.getElementById('cartArticles');
  if (artEl) artEl.textContent = `${count} article${count > 1 ? 's' : ''}`;

  const totEl = document.getElementById('cartTotal');
  if (totEl) totEl.textContent = `${total.toLocaleString('fr-FR')} FCFA`;

  const topBadge = document.getElementById('topCartBadge');
  if (topBadge) {
    topBadge.textContent = count;
    topBadge.hidden = !count;
  }
}

function openCart() {
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const contentEl = document.getElementById('cartContent');
  if (contentEl) {
    contentEl.innerHTML = `
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
      <h3 style="font-size:14px">Mode de service</h3>
      <div class="order-type-options">
        <button type="button" class="order-type-btn${orderType === 'dinein' ? ' selected' : ''}" data-order-type="dinein">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h1a2 2 0 0 0 2-2V2"/><path d="M5 2v20"/><path d="M18 2v20"/><path d="M18 11c2 0 3-1.5 3-4.5S20 2 18 2"/></svg>
          Sur place
        </button>
        <button type="button" class="order-type-btn${orderType === 'takeaway' ? ' selected' : ''}" data-order-type="takeaway">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          À emporter
        </button>
      </div>
      <h3 style="font-size:14px">Payer avec</h3>
      <div class="pay-options">
        <button type="button" class="pay-btn${paymentMethod === 'wave' ? ' selected' : ''}" data-pay="wave"><span>🌊</span> Wave</button>
        <button type="button" class="pay-btn${paymentMethod === 'orange' ? ' selected' : ''}" data-pay="orange"><span>🟠</span> Orange Money</button>
      </div>
      <p class="payment-provider-note">Vous confirmerez votre choix dans le checkout sécurisé DexPay.</p>
      <button type="button" class="cart-order-btn" id="confirmPayBtn">Continuer vers DexPay</button>
      <button type="button" class="cart-footer-close-btn" id="cartFooterCloseBtn">Fermer</button>
    `;
  }

  const panel = document.getElementById('cartPanel');
  if (panel) panel.classList.add('open');

  document.querySelectorAll('#cartContent [data-minus]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.minus, -1)));
  document.querySelectorAll('#cartContent [data-plus]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.plus, 1)));
  document.querySelectorAll('.pay-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.pay-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      paymentMethod = b.dataset.pay;
    });
  });
  document.querySelectorAll('.order-type-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.order-type-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      orderType = b.dataset.orderType;
    });
  });
  document.getElementById('confirmPayBtn')?.addEventListener('click', confirmOrder);
  document.getElementById('cartFooterCloseBtn')?.addEventListener('click', closeCart);

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
  openCart();
  updateCartBar();
}

function changeQty(itemId, delta) {
  stepItem(itemId, delta);
  if (cart.length > 0) openCart();
  else closeCart();
}

function closeCart() {
  document.getElementById('cartPanel')?.classList.remove('open');
}

async function confirmOrder() {
  if (!cart.length || paymentCheckoutInProgress) return;

  // L'aperçu intégré au dashboard sert à vérifier le rendu du menu. Il ne
  // représente pas une table réelle et ne doit donc jamais créer un paiement.
  // Pour tester Wave ou Orange Money, il faut ouvrir le lien QR public du menu.
  if (isPreviewMode) {
    showToast('Paiement désactivé dans l’aperçu. Ouvrez le lien QR du menu pour tester Wave ou Orange Money.');
    return;
  }

  const restaurantId = AurestoStore.getRestaurantId?.();
  if (!restaurantId) {
    showToast('Le paiement en ligne est indisponible : restaurant non identifié.');
    return;
  }

  const confirmButton = document.getElementById('confirmPayBtn');
  paymentCheckoutInProgress = true;
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = 'Préparation du paiement…';
  }

  try {
    const response = await fetch(`${window.AURESTO_API_BASE}/api/restaurants/${restaurantId}/payments/dexpay/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableName,
        tableId,
        orderType,
        preferredProvider: paymentMethod,
        items: cart.map(item => ({ id: item.id, qty: item.qty, note: item.note || '' }))
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.paymentUrl) {
      throw new Error(payload.message || 'Le paiement ne peut pas être initialisé pour le moment.');
    }

    try {
      sessionStorage.setItem('auresto_pending_dexpay_payment', payload.reference);
    } catch {}

    // La commande reste absente du restaurant tant que DexPay n’a pas envoyé
    // son webhook signé. On vide seulement l’interface avant la redirection.
    cart = [];
    closeCart();
    updateCartBar();
    showToast(payload.mode === 'sandbox' ? 'Ouverture du simulateur DexPay…' : 'Redirection vers le paiement sécurisé…');

    window.setTimeout(() => window.location.assign(payload.paymentUrl), 250);
  } catch (error) {
    console.error('DexPay checkout error:', error);
    showToast(error.message || 'Impossible de préparer le paiement.');
    paymentCheckoutInProgress = false;
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = 'Continuer vers DexPay';
    }
  }
}

// ============================================================
// Carillon de remerciement
//
// Volontairement doux : un arpège majeur ascendant en ondes sinusoïdales,
// attaque progressive et longue décroissance. Pas de « bip » sec — c'est
// le dernier contact du client avec le restaurant, il doit être agréable
// et donner envie de revenir.
//
// Le contexte audio n'est créé qu'au moment du clic de confirmation :
// les navigateurs bloquent toute lecture non déclenchée par l'utilisateur.
// ============================================================
let thankYouAudioCtx = null;

// Créer un AudioContext coûte ~580 ms (mesuré) : c'est l'initialisation du
// matériel audio. Le faire au clic de confirmation retardait le carillon
// d'autant. On le prépare donc dès la première interaction du client avec la
// page — il touche l'écran bien avant de commander — pour que la confirmation
// n'ait plus qu'à programmer les notes.
function warmUpAudio() {
  if (thankYouAudioCtx) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    thankYouAudioCtx = new AudioCtx();
    if (thankYouAudioCtx.state === 'suspended') thankYouAudioCtx.resume();
  } catch (err) {
    console.warn('Préparation audio impossible:', err);
  }
}

['pointerdown', 'touchstart', 'keydown'].forEach(evt => {
  window.addEventListener(evt, warmUpAudio, { once: true, passive: true });
});

function playThankYouChime() {
  try {
    warmUpAudio();
    const ctx = thankYouAudioCtx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    // Démarrage au plus tôt : le contexte est déjà chaud.
    const start = ctx.currentTime;

    // Ré majeur ascendant (D5 – F#5 – A5 – D6) : consonant et lumineux.
    // Égrenage resserré pour que la phrase soit perçue comme immédiate.
    const notes = [
      { freq: 587.33, at: 0.00, gain: 0.16, dur: 1.4 },
      { freq: 739.99, at: 0.07, gain: 0.15, dur: 1.4 },
      { freq: 880.00, at: 0.14, gain: 0.14, dur: 1.5 },
      { freq: 1174.66, at: 0.23, gain: 0.10, dur: 1.8 }
    ];

    // Filtre passe-bas : arrondit le timbre, évite toute dureté sur les
    // petits haut-parleurs de téléphone.
    const softener = ctx.createBiquadFilter();
    softener.type = 'lowpass';
    softener.frequency.value = 2600;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    softener.connect(master).connect(ctx.destination);

    notes.forEach(note => {
      const t = start + note.at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, t);

      // Attaque de 60 ms puis extinction exponentielle : sonorité de
      // clochette, sans le claquement d'un démarrage brutal.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(note.gain, t + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + note.dur);

      osc.connect(gain).connect(softener);
      osc.start(t);
      osc.stop(t + note.dur + 0.05);
    });
  } catch (err) {
    // Le son est un agrément : son échec ne doit jamais gêner la commande.
    console.warn('Carillon indisponible:', err);
  }
}

// Retour sonore très court associé à l'animation d'ajout d'un plat.
// Deux notes légères, moins présentes que le carillon de fin de commande.
function playItemAddChime() {
  try {
    warmUpAudio();
    const ctx = thankYouAudioCtx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const start = ctx.currentTime;
    [
      { freq: 1046.5, at: 0, gain: 0.045 },
      { freq: 1318.5, at: 0.075, gain: 0.035 }
    ].forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, start + note.at);
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + note.at);
      osc.stop(start + note.at + 0.22);
    });
  } catch (err) {
    // Le son reste un enrichissement : l'ajout au panier ne doit jamais en dépendre.
    console.warn('Son d’ajout indisponible:', err);
  }
}

function showToast(msg) {
  // On réutilise le #toast déjà présent dans client.html : il porte la classe
  // .toast, seule classe réellement stylée. L'ancien code fabriquait un
  // <div class="client-toast"> pour lequel aucune règle CSS n'existe — le
  // message était bien inséré dans la page, mais totalement invisible.
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 3000);
}

function renderOpeningHours(restaurant) {
  const hoursContainer = document.getElementById('heroHours');
  if (!hoursContainer) return;
  const schedule = restaurant.hoursSchedule;
  if (!schedule || typeof schedule !== 'object' || !Object.keys(schedule).length) {
    hoursContainer.hidden = true;
    return;
  }

  const daysOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayNamesFr = {
    monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi',
    thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche'
  };

  const jsDay = new Date().getDay();
  const todayKey = daysOrder[(jsDay + 6) % 7];
  const todayData = schedule[todayKey];
  let isOpenNow = false;

  if (todayData && !todayData.closed && todayData.open && todayData.close) {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = todayData.open.split(':').map(Number);
    const [ch, cm] = todayData.close.split(':').map(Number);
    const openMins = oh * 60 + (om || 0);
    const closeMins = ch * 60 + (cm || 0);
    isOpenNow = currentMins >= openMins && currentMins < closeMins;
  }

  const statusBadge = isOpenNow
    ? '<span class="hero-hours-open">● Ouvert</span>'
    : '<span class="hero-hours-closed">● Fermé</span>';

  let todayHoursText = 'Fermé aujourd\'hui';
  if (todayData && !todayData.closed && todayData.open && todayData.close) {
    todayHoursText = `${todayData.open} – ${todayData.close}`;
  }

  let html = `
    <button type="button" class="hero-hours-toggle" id="heroHoursToggle">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${statusBadge} <span class="hero-hours-line">${todayHoursText}</span></span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <ul class="hero-hours-week" id="heroHoursWeek" hidden>
      ${daysOrder.map(dk => {
        const d = schedule[dk];
        const isToday = dk === todayKey;
        let text = 'Fermé';
        if (d && !d.closed && d.open && d.close) text = `${d.open} – ${d.close}`;
        return `
          <li class="hero-hours-day${isToday ? ' is-today' : ''}">
            <span>${dayNamesFr[dk]} ${isToday ? '(aujourd\'hui)' : ''}</span>
            <strong>${text}</strong>
          </li>
        `;
      }).join('')}
    </ul>
  `;

  hoursContainer.innerHTML = html;
  hoursContainer.hidden = false;

  const toggleBtn = document.getElementById('heroHoursToggle');
  const weekList = document.getElementById('heroHoursWeek');
  if (toggleBtn && weekList) {
    toggleBtn.addEventListener('click', () => {
      const show = weekList.hidden;
      weekList.hidden = !show;
      toggleBtn.classList.toggle('is-open', show);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('openCartBtn')?.addEventListener('click', openCart);
  document.getElementById('cartSummaryToggle')?.addEventListener('click', openCart);
  document.getElementById('validateOrderBtn')?.addEventListener('click', openCart);
  document.getElementById('cartSheetCloseBtn')?.addEventListener('click', closeCart);
  document.getElementById('confirmOrderBtn')?.addEventListener('click', confirmOrder);
  document.getElementById('bottomCartBtn')?.addEventListener('click', openCart);
});
