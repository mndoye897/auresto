const STATUS_LABELS = { new: 'Nouvelle', preparing: 'En préparation', ready: 'Prêt', served: 'Servie' };

const STATUS_CLASS = { new: 'badge-new', preparing: 'badge-preparing', ready: 'badge-ready', served: 'badge-served' };

// --- Notification de nouvelle commande ---
let lastKnownOrderIds = new Set();
let notificationSound = null;
let orderDetectionInitialized = false;

function getNotificationSound() {
  if (notificationSound) return notificationSound;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    notificationSound = new AudioCtx();
    return notificationSound;
  } catch (err) {
    console.warn('AudioContext non disponible:', err);
    return null;
  }
}

function playNotificationSound() {
  const ctx = getNotificationSound();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime;

  // Note 1 (ding aigu)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now);
  gain1.gain.setValueAtTime(0.0001, now);
  gain1.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.4);

  // Note 2 (ding grave, légèrement décalé)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1318.5, now + 0.18);
  gain2.gain.setValueAtTime(0.0001, now + 0.18);
  gain2.gain.exponentialRampToValueAtTime(0.3, now + 0.2);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(now + 0.18);
  osc2.stop(now + 0.6);
}

function showNewOrderNotification(order) {
  const container = document.getElementById('orderNotificationContainer');
  if (!container) return;

  const itemsSummary = (order.items || []).map(i => {
    const qtyStr = i.qty && i.qty > 1 ? `${i.qty}× ` : '';
    return `${qtyStr}${i.name}`;
  }).join(', ');

  const toast = document.createElement('div');
  toast.className = 'order-notification-toast';
  toast.innerHTML = `
    <div class="order-notif-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
    </div>
    <div class="order-notif-content">
      <strong>Nouvelle commande !</strong>
      <span>${order.tableName || 'Table'} · ${itemsSummary}</span>
      <span class="order-notif-total">${formatMoney(order.total)} FCFA</span>
    </div>
    <button type="button" class="order-notif-close" aria-label="Fermer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
  `;

  container.appendChild(toast);

  // Auto-fermeture après 8 secondes
  const autoClose = setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 400);
  }, 8000);

  // Fermeture manuelle
  toast.querySelector('.order-notif-close').addEventListener('click', () => {
    clearTimeout(autoClose);
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 400);
  });

  // Limiter à 3 toasts visibles simultanément
  const toasts = container.querySelectorAll('.order-notification-toast');
  if (toasts.length > 3) {
    toasts[0].classList.add('hiding');
    setTimeout(() => toasts[0].remove(), 400);
  }
}

function detectNewOrders(orders) {
  const currentNewOrderIds = new Set(
    orders.filter(o => o.status === 'new').map(o => o.id)
  );

  // Première exécution : on initialise sans notifier les commandes existantes
  if (!orderDetectionInitialized) {
    orderDetectionInitialized = true;
    lastKnownOrderIds = currentNewOrderIds;
    return;
  }

  const newOrders = orders.filter(o =>
    o.status === 'new' && !lastKnownOrderIds.has(o.id)
  );

  lastKnownOrderIds = currentNewOrderIds;

  newOrders.forEach(order => {
    playNotificationSound();
    showNewOrderNotification(order);
  });
}



function guard() {

  console.log('Dashboard guard called');

  const data = AurestoStore.load();

  console.log('Dashboard guard - data:', data);

  console.log('Dashboard guard - onboardingComplete:', data.onboardingComplete);

  console.log('Dashboard guard - menu items:', data.menu?.items?.length);

  // Remove the getRestaurantId call since it's not needed for guard
  // const restaurantId = AurestoStore.getRestaurantId();
  // console.log('Dashboard guard - restaurantId:', restaurantId);

  // Allow access if menu has items or restaurant exists, even if onboardingComplete is false
  const hasData = Boolean(data.restaurant?.name || (data.menu?.items && data.menu.items.length > 0) || (data.orders && data.orders.length > 0));
  if (!data.onboardingComplete && !hasData) {
    console.log('Dashboard guard - redirecting to onboarding (no menu or restaurant data)');
    location.href = 'onboarding.html';
    return null;
  }
  if (!data.onboardingComplete && hasData) {
    data.onboardingComplete = true;
    AurestoStore.update({ onboardingComplete: true });
  }

  console.log('Dashboard guard - allowing access to dashboard');

  return data;

}



// Mode de service, affiché sur chaque commande : sans lui le restaurateur
// ne sait pas s'il doit dresser une assiette ou préparer un emballage.
function orderTypeLabel(order) {
  return order?.orderType === 'takeaway' ? 'À emporter' : 'Sur place';
}

function formatMoney(n) {

  return Number(n).toLocaleString('fr-FR');

}



// Recommandation du tableau de bord : calculée sur les commandes réelles,
// jamais un texte figé. On ne conseille que ce que les données soutiennent,
// et on le dit quand elles manquent.
function renderDailyRecommendation(data, stats) {
  const target = document.getElementById('dailyRecommendation');
  if (!target) return;

  const items = data.menu?.items || [];
  const popular = (stats.popular || []).map(([name]) => name);

  let message;

  if (!items.length) {
    message = 'Ajoutez vos premiers plats au menu pour recevoir des recommandations basées sur vos ventes.';
  } else if (!popular.length) {
    message = 'Pas encore assez de commandes pour dégager une tendance. Partagez vos QR codes en salle pour lancer la collecte.';
  } else {
    const jamaisCommande = items.filter(item => !popular.includes(item.name));
    if (jamaisCommande.length) {
      message = `<strong>${jamaisCommande[0].name}</strong> n'a pas été commandé cette semaine. Mettez-le en avant en haut de sa catégorie, ou testez une promotion.`;
    } else {
      message = `<strong>${popular[0]}</strong> est votre plat le plus commandé. Assurez-vous d'avoir le stock nécessaire pour le service du soir.`;
    }
  }

  target.innerHTML = message;
}



function render() {

  const data = guard();

  if (!data) return;

  // Reload data from localStorage to get latest orders
  const freshData = AurestoStore.load();
  const stats = AurestoStore.getStats();

  console.log('Dashboard render - orders:', freshData.orders.length, 'active orders:', stats.active);

  // Détecter les nouvelles commandes et notifier (audio + visuel)
  detectNewOrders(freshData.orders);



  // Widget profil : même rendu que sur les autres pages (initiale en
  // majuscule, « Compte <plan> »), sinon l'identité semble changer à chaque
  // navigation.
  const displayName = data.restaurant.name || 'Mon restaurant';
  document.getElementById('restaurantName').textContent = displayName;

  const currentPlanName = data.plan || data.restaurant?.subscription_plan || data.restaurant?.plan || 'Free';
  document.getElementById('planBadge').textContent = `Compte ${currentPlanName}`;
  document.getElementById('userAvatar').textContent = displayName.trim().charAt(0).toUpperCase() || 'A';

  const isGoldPlan = String(currentPlanName).toLowerCase() === 'gold';
  const customizeMenuLink = document.getElementById('customizeMenuLink');
  const customizeMenuNav = document.getElementById('customizeMenuNav');
  if (customizeMenuLink) customizeMenuLink.hidden = !isGoldPlan;
  if (customizeMenuNav) customizeMenuNav.hidden = !isGoldPlan;

  document.getElementById('statActive').textContent = stats.active;

  document.getElementById('statCompleted').textContent = stats.completed;

  document.getElementById('statRevenue').textContent = formatMoney(stats.revenue);

  document.getElementById('statAvg').textContent = formatMoney(stats.avgBasket);



  const active = freshData.orders.filter(o => ['new', 'preparing', 'ready'].includes(o.status));

  console.log('Dashboard render - active orders:', active.length, 'orders:', active);

  const activeBadge = document.getElementById('activeOrdersBadge');
  if (activeBadge) {
    const newCount = active.filter(o => o.status === 'new').length;
    activeBadge.textContent = `${newCount} nouvelle${newCount > 1 ? 's' : ''}`;
  }

  const activeEl = document.getElementById('activeOrders');

  activeEl.innerHTML = active.length

    ? active.map(o => {
      const itemsSummary = (o.items || []).map(i => {
        const qtyStr = i.qty && i.qty > 1 ? `${i.qty}× ` : '';
        const noteText = i.note || i.optionsSummary;
        const noteStr = noteText ? ` <span style="color:#d97706;font-weight:600;">(${noteText})</span>` : '';
        return `${qtyStr}${i.name}${noteStr}`;
      }).join(', ');

      return `
      <div class="order-row">

        <div><strong>${o.tableName || 'Table'} <span class="order-type-tag${o.orderType === 'takeaway' ? ' takeaway' : ''}">${orderTypeLabel(o)}</span></strong><small>${itemsSummary}</small></div>

        <span class="badge ${STATUS_CLASS[o.status]}">${STATUS_LABELS[o.status]}</span>

        <span class="amount">${formatMoney(o.total)} FCFA</span>

        <button type="button" class="btn btn-ghost btn-sm" data-delete-order="${o.id}" style="padding:4px 8px;color:#ef4444;font-size:12px">Supprimer</button>

      </div>
    `;
    }).join('')

    : '<div class="empty-state">Aucune commande en cours</div>';



  // Add delete order event listeners
  activeEl.querySelectorAll('[data-delete-order]').forEach(btn => {
    btn.addEventListener('click', () => deleteOrder(btn.dataset.deleteOrder));
  });



  // Les panneaux « Notifications », « Plats populaires » et « Analyses Gold »
  // ont été retirés du tableau de bord : ils occupaient de la place sans être
  // consultés. Les analyses détaillées vivent désormais sur marketing.html.

  renderDailyRecommendation(freshData, stats);



  const firstTable = (data.tables && data.tables[0]) ? data.tables[0] : null;
  const menuUrl = firstTable ? AurestoStore.getTableUrl(firstTable.id) : 'client.html?preview=1';
  ['previewMenu', 'previewMenuFooter'].forEach(id => {
    const link = document.getElementById(id);
    if (!link) return;
    link.href = menuUrl;
    link.removeAttribute('target');
    link.onclick = event => {
      event.preventDefault();
      openClientMenuPreview(menuUrl, link);
    };
  });
}

let clientMenuPreviewUrl = '';
let clientMenuPreviewTrigger = null;
let clientMenuPreviewScrollTop = 0;

function openClientMenuPreview(menuUrl, trigger) {
  const modal = document.getElementById('clientMenuPreviewModal');
  const frame = document.getElementById('clientMenuPreviewFrame');
  const dashboardHome = document.getElementById('dashboardHomeContent');
  if (!modal || !frame || !dashboardHome) return;

  clientMenuPreviewUrl = menuUrl;
  clientMenuPreviewTrigger = trigger || document.activeElement;
  clientMenuPreviewScrollTop = window.scrollY;
  frame.src = menuUrl;
  dashboardHome.hidden = true;
  modal.hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.getElementById('closeClientMenuPreviewBtn')?.focus();
}

function closeClientMenuPreview() {
  const modal = document.getElementById('clientMenuPreviewModal');
  const frame = document.getElementById('clientMenuPreviewFrame');
  const dashboardHome = document.getElementById('dashboardHomeContent');
  if (!modal || !dashboardHome || modal.hidden) return;

  modal.hidden = true;
  dashboardHome.hidden = false;
  frame.src = 'about:blank';
  window.scrollTo({ top: clientMenuPreviewScrollTop, behavior: 'auto' });
  clientMenuPreviewTrigger?.focus?.();
}

function refreshClientMenuPreview() {
  const frame = document.getElementById('clientMenuPreviewFrame');
  if (!frame || !clientMenuPreviewUrl) return;
  const separator = clientMenuPreviewUrl.includes('?') ? '&' : '?';
  frame.src = `${clientMenuPreviewUrl}${separator}previewRefresh=${Date.now()}`;
}

document.getElementById('closeClientMenuPreviewBtn')?.addEventListener('click', closeClientMenuPreview);
document.getElementById('clientMenuPreviewReloadBtn')?.addEventListener('click', refreshClientMenuPreview);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeClientMenuPreview();
});






AurestoStore.init().then(() => {

  render();

  setInterval(render, 5000);

});

// Rafraîchir immédiatement quand une commande est ajoutée depuis un autre onglet (client)
window.addEventListener('storage', (event) => {
  if (event.key === 'auresto_data') {
    render();
  }
});



// Uses global getDishImageUrl(item) from js/dish-images.js

function renderMenuEditor() {
  const data = AurestoStore.load();
  const container = document.getElementById('menuEditor');
  if (!container) return;

  const items = (data.menu && data.menu.items) || [];
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Aucun plat trouvé</div>';
    return;
  }

  container.innerHTML = items.map((dish, idx) => {
    const dishId = dish.id || `dish_${idx}`;
    const dishImage = getDishImageUrl(dish);
    const isAvailable = dish.available !== false;
    return `
      <div class="menu-editor-row${!isAvailable ? ' is-unavailable' : ''}" style="${!isAvailable ? 'opacity:0.75;background:rgba(239,68,68,0.04);' : ''}">
        <img src="${dishImage}" alt="${dish.name || 'Plat'}" width="64" height="64" onerror="this.src='images/placeholder-plat.png'" style="${!isAvailable ? 'filter:grayscale(60%);' : ''}" />
        <div class="menu-editor-meta">
          <strong>${dish.name || ''} ${!isAvailable ? '<span style="font-size:11px;color:#ef4444;background:#fee2e2;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:600;">Indisponible</span>' : ''}</strong>
          <div class="muted">${dish.category || ''} · ${Number(dish.price || 0).toLocaleString('fr-FR')} FCFA</div>
        </div>
        <div class="menu-editor-actions" style="display:flex;gap:6px;align-items:center;">
          <button type="button" class="btn btn-sm btn-edit-dish" data-dish-id="${dishId}">Modifier</button>
          <button type="button" class="btn btn-sm btn-toggle-dish" data-toggle-dish="${dishId}" style="${isAvailable ? 'background:#f59e0b;color:#fff;border:none;' : 'background:#10b981;color:#fff;border:none;'}">
            ${isAvailable ? 'Indisponible' : 'Disponible'}
          </button>
          <button type="button" class="btn btn-sm btn-delete-dish" data-delete-dish="${dishId}" style="background:#ef4444;color:#fff;border:none;">Supprimer</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-edit-dish').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = e.currentTarget.getAttribute('data-dish-id');
      const storeData = AurestoStore.load();
      const dish = (storeData.menu.items || []).find((x, index) => (x.id || `dish_${index}`) === id);
      if (dish) openItemModal(dish);
    });
  });

  container.querySelectorAll('[data-toggle-dish]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = e.currentTarget.getAttribute('data-toggle-dish');
      AurestoStore.toggleMenuItemAvailability(id);
      renderMenuEditor();
    });
  });

  container.querySelectorAll('[data-delete-dish]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = e.currentTarget.getAttribute('data-delete-dish');
      const storeData = AurestoStore.load();
      const dish = (storeData.menu.items || []).find((x, index) => (x.id || `dish_${index}`) === id);
      if (dish && confirm(`Voulez-vous vraiment supprimer le plat "${dish.name}" ?`)) {
        AurestoStore.removeMenuItem(id);
        renderMenuEditor();
      }
    });
  });
}



// Render menu editor after initial render

setTimeout(renderMenuEditor, 500);

setInterval(renderMenuEditor, 7000);



// Modal handlers for dish editing

const itemModal = document.getElementById('itemEditModal');

const closeItemModalBtn = document.getElementById('closeItemModalBtn');

const cancelItemModalBtn = document.getElementById('cancelItemModalBtn');

const saveItemModalBtn = document.getElementById('saveItemModalBtn');

const deleteItemModalBtn = document.getElementById('deleteItemBtn');

const addNewDishBtn = document.getElementById('addNewDishBtn');

// Options handlers
const optionsListContainer = document.getElementById('optionsListContainer');
const newOptName = document.getElementById('newOptName');
const newOptPrice = document.getElementById('newOptPrice');
const addOptBtn = document.getElementById('addOptBtn');

let currentOptions = [];

// Logo modal handlers
const logoModal = document.getElementById('scanLogoModal');
const closeLogoModalBtn = document.getElementById('closeLogoModalBtn');
const cancelLogoModalBtn = document.getElementById('cancelLogoModalBtn');
const saveLogoBtn = document.getElementById('saveLogoBtn');
const scanLogoBtn = document.getElementById('scanLogoBtn');
const scanLogoFileInput = document.getElementById('scanLogoFileInput');
const logoPreview = document.getElementById('logoPreview');
const logoPreviewImg = document.getElementById('logoPreviewImg');

// Category modal handlers

const categoryModal = document.getElementById('categoryModal');

const addCategoryBtn = document.getElementById('addCategoryBtn');

const closeCategoryModalBtn = document.getElementById('closeCategoryModalBtn');

const cancelCategoryModalBtn = document.getElementById('cancelCategoryModalBtn');

const saveCategoryModalBtn = document.getElementById('saveCategoryModalBtn');

const categoryChipsWrapper = document.getElementById('categoryChipsWrapper');



function openItemModal(rawItem = null) {
  const data = AurestoStore.load();
  const selectedDish = rawItem ? JSON.parse(JSON.stringify(rawItem)) : null;

  if (selectedDish) {
    document.getElementById('itemModalTitle').innerHTML = '<svg class="lucide lucide-pencil" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg> Modifier le plat';
    document.getElementById('editItemId').value = selectedDish.id || '';
    document.getElementById('editItemName').value = selectedDish.name || '';
    document.getElementById('editItemPrice').value = selectedDish.price || '';
    document.getElementById('editItemCurrency').value = selectedDish.currency || 'FCFA';
    document.getElementById('editItemCategory').value = selectedDish.category || '';
    document.getElementById('editItemCategorySelect').value = selectedDish.category || '';
    document.getElementById('editItemDesc').value = selectedDish.description || '';

    const initialPhoto = selectedDish.photo || selectedDish.image_url || selectedDish.image || selectedDish.photoUrl || selectedDish.imageUrl || selectedDish.photo_url || '';
    document.getElementById('editItemUrlInput').value = (initialPhoto !== 'images/placeholder-plat.png') ? initialPhoto : '';

    // Load options
    currentOptions = Array.isArray(selectedDish.options) ? JSON.parse(JSON.stringify(selectedDish.options)) : [];
    renderOptions();

    deleteItemModalBtn.hidden = false;
  } else {
    document.getElementById('itemModalTitle').innerHTML = '<svg class="lucide lucide-plus" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg> Ajouter un plat';
    document.getElementById('editItemId').value = '';
    document.getElementById('editItemName').value = '';
    document.getElementById('editItemPrice').value = '';
    document.getElementById('editItemCurrency').value = 'FCFA';
    document.getElementById('editItemCategory').value = '';
    document.getElementById('editItemCategorySelect').value = '';
    document.getElementById('editItemDesc').value = '';
    document.getElementById('editItemUrlInput').value = '';

    currentOptions = [];
    renderOptions();

    deleteItemModalBtn.hidden = true;
  }

  // Populate category select
  const catSelect = document.getElementById('editItemCategorySelect');
  catSelect.innerHTML = (data.menu?.categories || []).map(c => `<option value="${c}">${c}</option>`).join('');

  if (selectedDish && selectedDish.category) catSelect.value = selectedDish.category;

  updateLivePreview();
  itemModal.hidden = false;
}



function closeItemModal() {

  itemModal.hidden = true;

}



// Options management functions

function renderOptions() {

  if (!optionsListContainer) return;

  optionsListContainer.innerHTML = currentOptions.map((opt, idx) => `
    <div class="option-row" style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb">
      <span style="flex:1;font-size:13px;font-weight:500">${opt.name}</span>
      <span style="font-size:12px;color:#6b7280">${opt.price > 0 ? '+' + opt.price + ' F' : 'Gratuit'}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-opt="${idx}" style="padding:4px 8px;color:#ef4444">×</button>
    </div>
  `).join('');



  optionsListContainer.querySelectorAll('[data-remove-opt]').forEach(btn => {

    btn.addEventListener('click', () => {

      const idx = parseInt(btn.dataset.removeOpt);

      currentOptions.splice(idx, 1);

      renderOptions();

    });

  });

}



function addOption(name, price) {

  if (!name || name.trim() === '') return;

  currentOptions.push({

    name: name.trim(),

    price: parseInt(price) || 0

  });

  renderOptions();

}



function addPresetOption(name, price) {

  addOption(name, price);

}



function saveItem() {

  const id = document.getElementById('editItemId').value;

  const name = document.getElementById('editItemName').value.trim();

  const price = parseFloat(document.getElementById('editItemPrice').value);

  const currency = document.getElementById('editItemCurrency').value;

  const category = document.getElementById('editItemCategorySelect').value.trim();

  const description = document.getElementById('editItemDesc').value.trim();

  let photo = document.getElementById('editItemUrlInput').value.trim();



  if (!name) return alert('Le nom du plat est requis');

  if (!price || isNaN(price)) return alert('Le prix est requis');

  if (!category) return alert('La catégorie est requise');



  // Auto-generate image if none provided

  if (!photo) {

    photo = generateNanoBananaImage(name);

    console.log('Auto-generated image for:', name);

  }



  const data = AurestoStore.load();

  console.log('saveItem - current data items count:', data.menu.items.length);

  if (id) {

    // Update existing

    const item = data.menu.items.find(i => i.id === id);

    if (item) {

      item.name = name;

      item.price = price;

      item.currency = currency;

      item.category = category;

      item.description = description;

      item.photo = photo;

      item.image_url = photo;

      item.options = currentOptions;

    }

  } else {

    // Add new

    const newItem = {

      name,

      price,

      currency,

      category,

      description,

      photo,

      options: currentOptions

    };

    console.log('saveItem - adding new item:', newItem);

    AurestoStore.addMenuItem(newItem);

  }



  const saved = AurestoStore.save(data);

  console.log('saveItem - saved data items count:', saved.menu.items.length);

  closeItemModal();

  render();

  renderMenuEditor();

}



function deleteItem() {

  const id = document.getElementById('editItemId').value;

  if (!id) return;

  if (!confirm('Supprimer ce plat ?')) return;



  AurestoStore.removeMenuItem(id);

  closeItemModal();

  render();

  renderMenuEditor();

}



function updateLivePreview() {

  const name = document.getElementById('editItemName').value || 'Nom du plat';

  const desc = document.getElementById('editItemDesc').value || 'Description du plat...';

  const price = document.getElementById('editItemPrice').value || '5000';

  const category = document.getElementById('editItemCategorySelect').value || 'Plat principal';

  const inputPhoto = document.getElementById('editItemUrlInput').value;



  document.getElementById('livePreviewName').textContent = name;

  document.getElementById('livePreviewDesc').textContent = desc;

  document.getElementById('livePreviewPrice').textContent = Number(price).toLocaleString('fr-FR') + ' FCFA';

  document.getElementById('livePreviewCategory').textContent = category;



  const photo = getDishImageUrl({ name: name !== 'Nom du plat' ? name : '', photo: inputPhoto });

  document.getElementById('livePreviewImg').src = photo;

}

// Event listeners

if (addNewDishBtn) {

  addNewDishBtn.addEventListener('click', () => openItemModal(null));

}

if (closeItemModalBtn) {

  closeItemModalBtn.addEventListener('click', closeItemModal);

}

if (cancelItemModalBtn) {

  cancelItemModalBtn.addEventListener('click', closeItemModal);

}

if (saveItemModalBtn) {

  saveItemModalBtn.addEventListener('click', saveItem);

}

if (deleteItemModalBtn) {

  deleteItemModalBtn.addEventListener('click', deleteItem);

}



// Live preview updates

['editItemName', 'editItemPrice', 'editItemCategorySelect', 'editItemDesc', 'editItemUrlInput'].forEach(id => {

  const el = document.getElementById(id);

  if (el) el.addEventListener('input', updateLivePreview);

});



// AI Image generation

const editItemAiImgBtn = document.getElementById('editItemAiImgBtn');

if (editItemAiImgBtn) {

  editItemAiImgBtn.addEventListener('click', () => {

    const dishName = document.getElementById('editItemName').value.trim();

    if (!dishName) return alert('Entrez le nom du plat d\'abord pour générer une image');

    const aiImageUrl = generateNanoBananaImage(dishName);

    document.getElementById('editItemUrlInput').value = aiImageUrl;

    updateLivePreview();

    showToast('Image générée avec Nano Banana AI');

  });

}



// Category management

function renderCategoryChips() {

  const data = AurestoStore.load();

  const categories = data.menu?.categories || [];

  categoryChipsWrapper.innerHTML = categories.map(cat => `

    <div class="category-chip" data-cat="${cat}">

      <span>${cat}</span>

      <button type="button" class="cat-delete-btn" data-delete-cat="${cat}" title="Supprimer">×</button>

    </div>

  `).join('');



  categoryChipsWrapper.querySelectorAll('[data-delete-cat]').forEach(btn => {

    btn.addEventListener('click', e => {

      e.stopPropagation();

      const cat = btn.dataset.deleteCat;

      if (confirm(`Supprimer la catégorie "${cat}" ?`)) {

        deleteCategory(cat);

      }

    });

  });

}



function openCategoryModal() {

  document.getElementById('categoryNameInput').value = '';

  document.getElementById('categoryOldName').value = '';

  document.getElementById('categoryModalTitle').innerHTML = '<svg class="lucide lucide-folder-plus" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg> Nouvelle catégorie';

  categoryModal.hidden = false;

}



function closeCategoryModal() {

  categoryModal.hidden = true;

}



function saveCategory() {

  const name = document.getElementById('categoryNameInput').value.trim();

  const oldName = document.getElementById('categoryOldName').value;

  if (!name) return alert('Le nom de la catégorie est requis');



  const data = AurestoStore.load();

  if (oldName) {

    // Edit existing

    const idx = data.menu.categories.indexOf(oldName);

    if (idx !== -1) data.menu.categories[idx] = name;

    // Update items with this category

    data.menu.items.forEach(item => {

      if (item.category === oldName) item.category = name;

    });

  } else {

    // Add new

    if (data.menu.categories.includes(name)) return alert('Cette catégorie existe déjà');

    data.menu.categories.push(name);

  }



  AurestoStore.save(data);

  closeCategoryModal();

  renderCategoryChips();

  renderMenuEditor();

}



function deleteCategory(catName) {

  const data = AurestoStore.load();

  data.menu.categories = data.menu.categories.filter(c => c !== catName);

  AurestoStore.save(data);

  renderCategoryChips();

  renderMenuEditor();

}



function deleteOrder(orderId) {

  if (!confirm('Supprimer cette commande ?')) return;



  const data = AurestoStore.load();

  data.orders = data.orders.filter(o => o.id !== orderId);

  AurestoStore.save(data);

  render();

  showToast('Commande supprimée');

}



// Logo modal functions

function openLogoModal() {

  logoModal.hidden = false;

  logoPreview.hidden = true;

  scanLogoFileInput.value = '';

}



function closeLogoModal() {

  logoModal.hidden = true;

}



function handleLogoFileSelect(e) {

  const file = e.target.files[0];

  if (file) {

    const reader = new FileReader();

    reader.onload = (event) => {

      logoPreviewImg.src = event.target.result;

      logoPreview.hidden = false;

    };

    reader.readAsDataURL(file);

  }

}



function saveLogo() {

  const file = scanLogoFileInput.files[0];

  if (!file) {

    alert('Veuillez sélectionner une image pour le logo');

    return;

  }



  const reader = new FileReader();

  reader.onload = (event) => {

    const img = new Image();

    img.onload = () => {

      // Resize image to max 200x200 to reduce storage size

      const canvas = document.createElement('canvas');

      const maxSize = 200;

      let width = img.width;

      let height = img.height;



      if (width > height) {

        if (width > maxSize) {

          height *= maxSize / width;

          width = maxSize;

        }

      } else {

        if (height > maxSize) {

          width *= maxSize / height;

          height = maxSize;

        }

      }



      canvas.width = width;

      canvas.height = height;

      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0, width, height);



      const logoData = canvas.toDataURL('image/jpeg', 0.8);

      const data = AurestoStore.load();

      data.branding.logo = logoData;

      AurestoStore.save(data);

      closeLogoModal();

      showToast('Logo enregistré avec succès');

    };

    img.src = event.target.result;

  };

  reader.readAsDataURL(file);

}



// Category modal event listeners

if (addCategoryBtn) {

  addCategoryBtn.addEventListener('click', openCategoryModal);

}

if (closeCategoryModalBtn) {

  closeCategoryModalBtn.addEventListener('click', closeCategoryModal);

}
if (cancelCategoryModalBtn) {

  cancelCategoryModalBtn.addEventListener('click', closeCategoryModal);

}
if (saveCategoryModalBtn) {

  saveCategoryModalBtn.addEventListener('click', saveCategory);

}



// Initial render of category chips

setTimeout(renderCategoryChips, 600);



// Menu scanning functionality

const scanMenuBtn = document.getElementById('scanMenuBtn');

const scanMenuModal = document.getElementById('scanMenuModal');

const closeScanModalBtn = document.getElementById('closeScanModalBtn');

const cancelScanModalBtn = document.getElementById('cancelScanModalBtn');

const startScanBtn = document.getElementById('startScanBtn');

const importScanBtn = document.getElementById('importScanBtn');

const scanMenuFileInput = document.getElementById('scanMenuFileInput');

const scanPreview = document.getElementById('scanPreview');

const scanPreviewList = document.getElementById('scanPreviewList');

const scanProgress = document.getElementById('scanProgress');

const scanProgressText = document.getElementById('scanProgressText');

const scanProgressBar = document.getElementById('scanProgressBar');

const scanResults = document.getElementById('scanResults');

const scanResultsList = document.getElementById('scanResultsList');



let scannedItems = [];
let scanFiles = [];

function setScanProgress(message, percent = null) {
  if (scanProgressText) scanProgressText.textContent = message;
  if (scanProgressBar && percent !== null) {
    scanProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
}



function openScanModal() {

  scanMenuModal.hidden = false;

  scanMenuFileInput.value = '';

  scanPreview.style.display = 'none';
  if (scanPreviewList) scanPreviewList.replaceChildren();

  scanProgress.style.display = 'none';

  setScanProgress('Prêt à analyser', 0);

  scanResults.style.display = 'none';

  startScanBtn.style.display = 'inline-flex';

  importScanBtn.style.display = 'none';

  startScanBtn.disabled = true;

  scannedItems = [];
  scanFiles = [];

  window.setTimeout(() => scanMenuFileInput?.focus(), 50);

}



function closeScanModal() {

  scanMenuModal.hidden = true;

}



function handleScanFileSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const validFiles = files.filter(file => file.type.startsWith('image/') && file.size <= 12 * 1024 * 1024);
  const invalidCount = files.length - validFiles.length;

  if (invalidCount) {
    alert(`${invalidCount} image(s) ignorée(s) : choisissez des fichiers image de 12 Mo maximum.`);
  }

  scanFiles = validFiles;
  e.target.value = '';
  scannedItems = [];
  scanResults.style.display = 'none';
  importScanBtn.style.display = 'none';
  startScanBtn.style.display = 'inline-flex';

  renderScanPreviews();
  startScanBtn.disabled = scanFiles.length === 0;
  startScanBtn.textContent = scanFiles.length > 1
    ? `Scanner les ${scanFiles.length} images`
    : 'Scanner le menu';

}


function renderScanPreviews() {
  if (!scanPreviewList) return;
  scanPreviewList.replaceChildren();

  scanFiles.forEach((file, index) => {
    const card = document.createElement('div');
    card.className = 'scan-preview-card';

    const image = document.createElement('img');
    const previewUrl = URL.createObjectURL(file);
    image.src = previewUrl;
    image.alt = `Aperçu de la page ${index + 1} du menu`;
    image.onload = () => URL.revokeObjectURL(previewUrl);

    const label = document.createElement('span');
    label.textContent = `${index + 1}. ${file.name}`;

    card.append(image, label);
    scanPreviewList.append(card);
  });

  scanPreview.style.display = scanFiles.length ? 'block' : 'none';
}



async function startScan() {
  if (!scanFiles.length) return;

  scanProgress.style.display = 'block';
  scanResults.style.display = 'none';
  startScanBtn.disabled = true;
  startScanBtn.textContent = 'Analyse en cours…';
  setScanProgress('Préparation des images…', 0);

  try {
    if (!window.MenuAI?.scanMenuImage) {
      throw new Error('Le scanner n’est pas prêt. Actualisez la page puis réessayez.');
    }
    const detectedItems = [];
    const failedFiles = [];

    for (const [index, file] of scanFiles.entries()) {
      const pageNumber = index + 1;
      try {
        const result = await MenuAI.scanMenuImage(file, (msg) => {
          const localProgress = Number(msg.match(/(\d{1,3})%/)?.[1]);
          const overallProgress = Number.isFinite(localProgress)
            ? Math.round(((index + (localProgress / 100)) / scanFiles.length) * 100)
            : Math.round((index / scanFiles.length) * 100);
          setScanProgress(`Image ${pageNumber}/${scanFiles.length} — ${msg}`, overallProgress);
        });
        detectedItems.push(...(result.items || []));
      } catch (error) {
        console.error(`Scan failed for ${file.name}:`, error);
        failedFiles.push(file.name);
      }
    }

    scannedItems = mergeScannedItems(detectedItems);
    console.log('AI Menu Scan items:', scannedItems);

    if (scannedItems.length > 0) {
      displayScanResults();
      startScanBtn.style.display = 'none';
      importScanBtn.style.display = 'inline-flex';
      const failureNote = failedFiles.length ? ` · ${failedFiles.length} image(s) non lue(s)` : '';
      setScanProgress(`${scannedItems.length} plat(s) détecté(s)${failureNote}`, 100);
    } else {
      const failureNote = failedFiles.length ? ` (${failedFiles.join(', ')})` : '';
      alert(`Aucun plat détecté. Essayez avec des images plus claires.${failureNote}`);
      scanProgress.style.display = 'none';
      startScanBtn.disabled = false;
      startScanBtn.textContent = scanFiles.length > 1
        ? `Scanner les ${scanFiles.length} images`
        : 'Scanner le menu';
    }
  } catch (err) {
    console.error('Scan error:', err);
    alert('Erreur lors de l’analyse du menu: ' + (err.message || err));
    scanProgress.style.display = 'none';
    startScanBtn.disabled = false;
    startScanBtn.textContent = 'Réessayer le scan';
  }
}

function mergeScannedItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${String(item.name || '').trim().toLocaleLowerCase('fr-FR')}|${Number(item.price) || 0}`;
    if (!item.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function displayScanResults() {
  scanResults.style.display = 'block';
  scanResultsList.innerHTML = scannedItems.map((item, idx) => `
    <div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;">
      <div>
        <strong style="color:#f8fafc;font-size:13px">${item.name}</strong>
        <div style="font-size:11.5px;color:#94a3b8">${item.category || 'Plats'} • ${Number(item.price).toLocaleString('fr-FR')} FCFA</div>
      </div>
      <button type="button" class="btn btn-sm" data-remove-scan="${idx}" style="padding:3px 8px;font-size:12px;color:#ef4444;background:rgba(239,68,68,0.12);border:none;border-radius:4px;">×</button>
    </div>
  `).join('');

  scanResultsList.querySelectorAll('[data-remove-scan]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.removeScan);
      scannedItems.splice(idx, 1);
      displayScanResults();
      if (scannedItems.length === 0) {
        scanResults.style.display = 'none';
        startScanBtn.style.display = 'inline-flex';
        importScanBtn.style.display = 'none';
      }
    });
  });
}

function importScannedItems() {
  if (scannedItems.length === 0) return;

  const data = AurestoStore.load();
  data.menu = data.menu || { categories: [], items: [] };
  data.menu.categories = data.menu.categories || [];
  data.menu.items = data.menu.items || [];

  const existingCategories = new Set(data.menu.categories);
  let addedCount = 0;

  scannedItems.forEach(item => {
    if (!item.name) return;
    const cat = item.category || 'Plats';
    if (!existingCategories.has(cat)) {
      data.menu.categories.push(cat);
      existingCategories.add(cat);
    }
    const photo = item.photo || generateNanoBananaImage(item.name);
    const newItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: item.name,
      category: cat,
      price: Number(item.price) || 0,
      description: item.description || '',
      photo: photo,
      image_url: photo,
      available: true
    };
    data.menu.items.push(newItem);
    addedCount++;
  });

  // Save the state with all newly scanned items included
  AurestoStore.save(data);

  closeScanModal();

  if (typeof render === 'function') render();
  if (typeof renderMenuEditor === 'function') renderMenuEditor();
  if (typeof renderCategoryChips === 'function') renderCategoryChips();

  showToast(`${addedCount} plat(s) importé(s) dans votre carte !`);
}



// Scan modal event listeners

if (scanMenuBtn) {

  scanMenuBtn.addEventListener('click', openScanModal);

}

if (scanLogoBtn) {

  scanLogoBtn.addEventListener('click', openLogoModal);

}

if (closeLogoModalBtn) {

  closeLogoModalBtn.addEventListener('click', closeLogoModal);

}

if (cancelLogoModalBtn) {

  cancelLogoModalBtn.addEventListener('click', closeLogoModal);

}

if (scanLogoFileInput) {

  scanLogoFileInput.addEventListener('change', handleLogoFileSelect);

}

if (saveLogoBtn) {

  saveLogoBtn.addEventListener('click', saveLogo);

}

if (closeScanModalBtn) {

  closeScanModalBtn.addEventListener('click', closeScanModal);

}
if (cancelScanModalBtn) {

  cancelScanModalBtn.addEventListener('click', closeScanModal);

}
if (scanMenuFileInput) {

  scanMenuFileInput.addEventListener('change', handleScanFileSelect);

}
if (startScanBtn) {

  startScanBtn.addEventListener('click', startScan);

}
if (importScanBtn) {

  importScanBtn.addEventListener('click', importScannedItems);

}


// Options event listeners
if (addOptBtn) {

  addOptBtn.addEventListener('click', () => {

    const name = newOptName.value.trim();

    const price = newOptPrice.value;

    if (name) {

      addOption(name, price);

      newOptName.value = '';

      newOptPrice.value = '';

    }

  });

}


// Preset chips event listeners
document.querySelectorAll('.preset-chip').forEach(chip => {

  chip.addEventListener('click', () => {

    const name = chip.dataset.presetName;

    const price = parseInt(chip.dataset.presetPrice) || 0;

    addPresetOption(name, price);

  });

});

// Socket.io Real-Time Listener for Dashboard
if (typeof io !== 'undefined') {
  try {
    const apiBase = window.AURESTO_API_BASE || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:4000' : window.location.origin);
    const socket = io(apiBase);
    const rid = window.AurestoStore?.load?.()?.restaurant?.id;
    if (rid) socket.emit('join_restaurant', rid);

    socket.on('order:new', (order) => {
      if (typeof renderOrders === 'function') renderOrders();
      if (typeof updateStats === 'function') updateStats();
      // Notification audio + visuelle pour les nouvelles commandes
      playNotificationSound();
      showNewOrderNotification({
        id: order?.id || `socket_${Date.now()}`,
        tableName: order?.tableNumber ? `Table ${order.tableNumber}` : 'Salle',
        items: order?.items || [],
        total: order?.total || 0
      });
    });

    socket.on('order:status_updated', () => {
      if (typeof renderOrders === 'function') renderOrders();
      if (typeof updateStats === 'function') updateStats();
    });
  } catch (e) {
    console.warn('Dashboard socket error:', e);
  }
}
