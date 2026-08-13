// ============================================================
// Auresto — Historique des commandes
// ============================================================

const STATUS_META = {
  new: { label: 'En attente', emoji: '🟡', cls: 'status-new' },
  preparing: { label: 'En préparation', emoji: '🔵', cls: 'status-preparing' },
  ready: { label: 'Prête', emoji: '🟣', cls: 'status-ready' },
  served: { label: 'Terminée', emoji: '🟢', cls: 'status-served' },
  cancelled: { label: 'Annulée', emoji: '🔴', cls: 'status-cancelled' }
};

const PAYMENT_LABELS = {
  CASH: 'Espèces',
  cash: 'Espèces',
  WAVE: 'Wave',
  wave: 'Wave',
  OM: 'Orange Money',
  om: 'Orange Money',
  CARD: 'Carte'
};

let currentFilter = 'all';
let searchQuery = '';
let activeOrderId = null;
let searchDebounceTimer = null;

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function formatMoney(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`;
}

function formatOrderNumber(order) {
  const raw = String(order.id || '').replace(/[^0-9]/g, '');
  return '#' + (raw ? raw.slice(-4) : '0000');
}

function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { time: '—', date: '—', full: '—' };
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const full = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) + ' à ' + time;
  return { time, date, full };
}

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

function isSameWeek(d, ref) {
  const start = new Date(ref);
  const day = (start.getDay() + 6) % 7; // lundi = 0
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}

function isSameMonth(d, ref) {
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

// ============================================================
// Données
// ============================================================
function getAllOrders() {
  const data = AurestoStore.load();
  return (data.orders || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function computeStats(orders) {
  const now = new Date();
  const today = orders.filter(o => isSameDay(new Date(o.createdAt), now));
  const completedToday = today.filter(o => o.status === 'served');
  const activeToday = today.filter(o => ['new', 'preparing', 'ready'].includes(o.status));
  const revenueToday = today
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.total || 0), 0);

  return {
    todayCount: today.length,
    completedCount: completedToday.length,
    activeCount: activeToday.length,
    revenueToday
  };
}

function matchesFilter(order, filter) {
  const created = new Date(order.createdAt);
  const now = new Date();
  switch (filter) {
    case 'today': return isSameDay(created, now);
    case 'week': return isSameWeek(created, now);
    case 'month': return isSameMonth(created, now);
    case 'active': return ['new', 'preparing', 'ready'].includes(order.status);
    case 'completed': return order.status === 'served';
    case 'cancelled': return order.status === 'cancelled';
    default: return true;
  }
}

function matchesSearch(order, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const num = formatOrderNumber(order).toLowerCase();
  const customer = (order.customerName || order.tableName || '').toLowerCase();
  const products = (order.items || []).map(i => (i.name || '').toLowerCase()).join(' ');
  return num.includes(q) || customer.includes(q) || products.includes(q);
}

// ============================================================
// Rendu
// ============================================================
function renderStats(orders) {
  const s = computeStats(orders);
  $('#statTodayCount').textContent = s.todayCount;
  $('#statCompletedCount').textContent = s.completedCount;
  $('#statActiveCount').textContent = s.activeCount;
  $('#statRevenueToday').textContent = formatMoney(s.revenueToday);
}

function orderSummary(order) {
  const items = order.items || [];
  if (!items.length) return 'Aucun article';
  return items.map(i => `${i.qty || 1}× ${i.name}`).join(', ');
}

function renderList() {
  const all = getAllOrders();
  const filtered = all.filter(o => matchesFilter(o, currentFilter) && matchesSearch(o, searchQuery));

  const list = $('#ordersList');
  const empty = $('#ordersEmptyState');
  $('#ordersResultCount').textContent = `${filtered.length} commande${filtered.length > 1 ? 's' : ''}`;

  if (!filtered.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = filtered.map((order, idx) => {
    const meta = STATUS_META[order.status] || STATUS_META.new;
    const dt = formatDateTime(order.createdAt);
    const payment = PAYMENT_LABELS[order.payment] || order.payment || '—';
    const customer = order.customerName || null;
    return `
      <article class="order-card glass-card" data-order-id="${order.id}" style="animation-delay:${Math.min(idx, 12) * 35}ms">
        <div class="order-card-id">
          <strong>${formatOrderNumber(order)}</strong>
          <span>${dt.date}</span>
        </div>
        <div class="order-card-main">
          <div class="order-card-customer">
            ${customer ? escapeHtml(customer) : (order.tableName ? escapeHtml(order.tableName) : 'Client')}
            ${order.tableName ? `<span class="order-card-table-tag">${escapeHtml(order.tableName)}</span>` : ''}
            <span class="order-type-tag${order.orderType === 'takeaway' ? ' takeaway' : ''}">${order.orderType === 'takeaway' ? 'À emporter' : 'Sur place'}</span>
          </div>
          <div class="order-card-items">${escapeHtml(orderSummary(order))}</div>
        </div>
        <div class="order-card-time">${dt.time}</div>
        <div class="order-card-payment">${escapeHtml(payment)}</div>
        <span class="order-status-badge ${meta.cls}">${meta.label}</span>
        <div class="order-card-total">${formatMoney(order.total)}</div>
      </article>
    `;
  }).join('');

  $$('.order-card').forEach(card => {
    card.addEventListener('click', () => openOrderModal(card.dataset.orderId));
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderAll() {
  const all = getAllOrders();
  renderStats(all);
  renderList();
}

// ============================================================
// Modal détail
// ============================================================
const STATUS_FLOW = ['new', 'preparing', 'ready', 'served'];
const STATUS_NEXT_LABEL = {
  new: 'Passer en préparation',
  preparing: 'Marquer prête',
  ready: 'Marquer terminée'
};

function openOrderModal(orderId) {
  const order = getAllOrders().find(o => o.id === orderId);
  if (!order) return;
  activeOrderId = orderId;

  const meta = STATUS_META[order.status] || STATUS_META.new;
  const dt = formatDateTime(order.createdAt);
  const payment = PAYMENT_LABELS[order.payment] || order.payment || '—';

  $('#orderModalTitle').textContent = `Commande ${formatOrderNumber(order)}`;
  $('#orderModalMeta').textContent = dt.full;

  const badge = $('#orderModalStatusBadge');
  badge.className = `order-status-badge ${meta.cls}`;
  badge.textContent = meta.label;

  const chips = [];
  if (order.customerName) chips.push(order.customerName);
  if (order.tableName) chips.push(order.tableName);
  chips.push(order.orderType === 'takeaway' ? 'À emporter' : 'Sur place');
  chips.push(payment);
  $('#orderModalChips').innerHTML = chips.map(c => `<span class="order-info-chip">${escapeHtml(c)}</span>`).join('');

  const items = order.items || [];
  $('#orderModalItems').innerHTML = items.length ? items.map(i => `
    <tr>
      <td class="order-item-name">${escapeHtml(i.name || '')}${i.note ? `<small>Note : ${escapeHtml(i.note)}</small>` : ''}</td>
      <td>${i.qty || 1}</td>
      <td>${formatMoney((i.price || 0) * (i.qty || 1))}</td>
    </tr>
  `).join('') : '<tr><td colspan="3" style="color:#8b98ab;text-align:center;padding:16px 0;">Aucun article</td></tr>';

  const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
  const discount = Math.max(0, subtotal - (order.total || subtotal));
  $('#orderModalSubtotal').textContent = formatMoney(subtotal);
  const discountRow = $('#orderModalDiscountRow');
  if (discount > 0) {
    discountRow.hidden = false;
    $('#orderModalDiscount').textContent = '-' + formatMoney(discount);
  } else {
    discountRow.hidden = true;
  }
  $('#orderModalTotal').textContent = formatMoney(order.total);

  renderModalActions(order);

  $('#orderModalBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}

function renderModalActions(order) {
  const container = $('#orderModalActions');
  const buttons = [];

  if (order.status !== 'served' && order.status !== 'cancelled') {
    const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];
    if (nextStatus) {
      buttons.push(`<button type="button" class="order-action-btn primary" data-action="advance">${STATUS_NEXT_LABEL[order.status]}</button>`);
    }
    buttons.push(`<button type="button" class="order-action-btn danger" data-action="cancel">Annuler la commande</button>`);
  } else {
    buttons.push(`<button type="button" class="order-action-btn" data-action="close">Fermer</button>`);
  }

  container.innerHTML = buttons.join('');

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'advance') {
        const next = STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1];
        if (next) changeOrderStatus(order.id, next);
      } else if (action === 'cancel') {
        changeOrderStatus(order.id, 'cancelled');
      } else {
        closeOrderModal();
      }
    });
  });
}

function changeOrderStatus(orderId, status) {
  AurestoStore.updateOrderStatus(orderId, status);
  showToast(`Commande ${formatOrderNumber({ id: orderId })} → ${STATUS_META[status].label}`);
  renderAll();
  closeOrderModal();
}

function closeOrderModal() {
  $('#orderModalBackdrop').hidden = true;
  document.body.style.overflow = '';
  activeOrderId = null;
}

// ============================================================
// Toast
// ============================================================
let toastTimer = null;
function showToast(message) {
  const el = $('#ordersToast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
// Événements
// ============================================================
function bindEvents() {
  $$('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderList();
    });
  });

  $('#orderSearchInput').addEventListener('input', e => {
    clearTimeout(searchDebounceTimer);
    const value = e.target.value;
    searchDebounceTimer = setTimeout(() => {
      searchQuery = value.trim();
      renderList();
    }, 180);
  });

  $('#orderModalCloseBtn').addEventListener('click', closeOrderModal);
  $('#orderModalBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeOrderModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#orderModalBackdrop').hidden) closeOrderModal();
  });

  $('#refreshOrdersBtn').addEventListener('click', () => {
    renderAll();
    showToast('Commandes actualisées');
  });
}

// ============================================================
// Initialisation
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  AurestoStore.init().then(data => {
    const hasData = Boolean(data.restaurant?.name || (data.menu?.items && data.menu.items.length > 0) || (data.orders && data.orders.length > 0));
    if (!data.onboardingComplete && !hasData) { location.href = 'onboarding.html'; return; }
    if (!data.onboardingComplete && hasData) {
      data.onboardingComplete = true;
      AurestoStore.update({ onboardingComplete: true });
    }

    // Widget profil : même rendu que sur les autres pages (initiale en
    // majuscule, « Compte <plan> »). #planBadge recevait le nom du restaurant,
    // ce qui faisait apparaître une identité différente à chaque navigation.
    const displayName = data.restaurant?.name || 'Mon restaurant';
    $('#restaurantName').textContent = displayName;
    $('#restTagName').textContent = data.restaurant?.name || 'votre restaurant';
    const currentPlanName = data.plan || data.restaurant?.subscription_plan || data.restaurant?.plan || 'Free';
    $('#planBadge').textContent = `Compte ${currentPlanName}`;
    $('#userAvatar').textContent = displayName.trim().charAt(0).toUpperCase() || 'A';
    $('#subPlanTitle').textContent = `👑 ${currentPlanName}`;
    const isGold = String(currentPlanName).toLowerCase() === 'gold';
    const customizeNav = document.getElementById('customizeMenuNav');
    if (customizeNav) customizeNav.hidden = !isGold;

    bindEvents();
    renderAll();

    // Rafraîchissement périodique (nouvelles commandes, changements de statut)
    setInterval(renderAll, 5000);

    if (typeof io !== 'undefined') {
      try {
        const apiBase = window.AURESTO_API_BASE || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:4000' : window.location.origin);
        const socket = io(apiBase);
        const rid = data.restaurant?.id;
        if (rid) socket.emit('join_restaurant', rid);
        socket.on('order:new', renderAll);
        socket.on('order:status_updated', renderAll);
      } catch (e) {
        console.warn('Socket.io connection warning:', e);
      }
    }
  });
});
