// Owner Dashboard Logic for Auresto Platform

const API_BASE = window.AURESTO_API_BASE || 'http://localhost:4000';
const OWNER_TOKEN_KEY = 'auresto_owner_token';

let currentOwnerToken = null;
let currentFilter = 'ALL';
let currentQuery = '';
let currentSort = 'created_desc';
let allRestaurants = [];

// DOM Elements
const authOverlay = document.getElementById('ownerAuthOverlay');
const authForm = document.getElementById('ownerLoginForm');
const authError = document.getElementById('authError');
const mainContent = document.getElementById('ownerMainContent');
const searchInput = document.getElementById('ownerSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const sortSelect = document.getElementById('sortSelect');
const filterTabs = document.getElementById('filterTabs');
const restaurantsTbody = document.getElementById('restaurantsTbody');
const tableEmpty = document.getElementById('tableEmpty');

// Edit Modal Elements
const editModalOverlay = document.getElementById('editModalOverlay');
const modalRestName = document.getElementById('modalRestName');
const editRestId = document.getElementById('editRestId');
const editPlan = document.getElementById('editPlan');
const editStatus = document.getElementById('editStatus');
const editExpiresAt = document.getElementById('editExpiresAt');
const editGraceDays = document.getElementById('editGraceDays');
const editOwnerEmail = document.getElementById('editOwnerEmail');
const editOwnerPhone = document.getElementById('editOwnerPhone');
const toggleSuspendBtn = document.getElementById('toggleSuspendBtn');

function showToast(msg, duration = 3000) {
  const toast = document.getElementById('ownerToast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function getOwnerToken() {
  return currentOwnerToken || sessionStorage.getItem(OWNER_TOKEN_KEY);
}

function setOwnerToken(token) {
  currentOwnerToken = token;
  if (token) {
    sessionStorage.setItem(OWNER_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(OWNER_TOKEN_KEY);
    localStorage.removeItem(OWNER_TOKEN_KEY);
  }
}

async function ownerFetch(endpoint, options = {}) {
  const token = getOwnerToken();
  const headers = {
    'Content-Type': 'application/json',
    'x-owner-token': token || '',
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    setOwnerToken(null);
    showAuthModal('Session expirée ou clé invalide.');
    throw new Error('UNAUTHORIZED');
  }

  return response;
}

function showAuthModal(errMsg = '') {
  authOverlay.hidden = false;
  mainContent.hidden = true;
  if (errMsg) {
    authError.textContent = errMsg;
    authError.hidden = false;
  } else {
    authError.hidden = true;
  }
}

function hideAuthModal() {
  authOverlay.hidden = true;
  mainContent.hidden = false;
}

// Format numbers to FCFA
function formatFcfa(amount) {
  return `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;
}

// Format Dates
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Load Stats & Data
async function loadDashboardData() {
  try {
    await Promise.all([loadStats(), loadRestaurants()]);
  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

async function loadStats() {
  try {
    const res = await ownerFetch('/api/owner/stats');
    if (!res.ok) return;
    const data = await res.json();
    const stats = data.stats;

    document.getElementById('kpiTotal').textContent = stats.totalRestaurants;
    document.getElementById('kpiNewMonth').textContent = `+${stats.newRestaurantsThisMonth} ce mois-ci`;
    document.getElementById('kpiActive').textContent = stats.activeRestaurants;
    document.getElementById('kpiTrial').textContent = `${stats.trialRestaurants} en période d'essai`;
    document.getElementById('kpiExpiringSoon').textContent = stats.expiringSoonRestaurants;
    document.getElementById('kpiExpired').textContent = `${stats.expiredRestaurants} expirés / grâce`;
    document.getElementById('kpiSuspended').textContent = stats.suspendedRestaurants;
    document.getElementById('kpiPaidPlans').textContent = stats.silverCount + stats.goldCount;
    document.getElementById('kpiPlanBreakdown').textContent = `${stats.silverCount} Silver • ${stats.goldCount} Gold • ${stats.freeCount} Free`;
    document.getElementById('kpiRevenue').textContent = formatFcfa(stats.monthlyRevenue);
    document.getElementById('kpiPendingPay').textContent = `${stats.pendingPayments} paiement(s) en attente`;
  } catch (e) {}
}

async function loadRestaurants() {
  try {
    const url = `/api/owner/restaurants?filter=${encodeURIComponent(currentFilter)}&query=${encodeURIComponent(currentQuery)}&sortBy=${encodeURIComponent(currentSort)}`;
    const res = await ownerFetch(url);
    if (!res.ok) return;
    const data = await res.json();
    allRestaurants = data.restaurants || [];
    updateTabCounts(allRestaurants);
    renderRestaurantsTable(allRestaurants);
  } catch (e) {}
}

function updateTabCounts(list) {
  // Compute counts from overall list
  document.getElementById('countAll').textContent = list.length;
  document.getElementById('countActive').textContent = list.filter(r => ['ACTIVE', 'EXPIRING_SOON', 'TRIAL'].includes(r.status)).length;
  document.getElementById('countFree').textContent = list.filter(r => r.plan === 'FREE').length;
  document.getElementById('countSilver').textContent = list.filter(r => r.plan === 'SILVER').length;
  document.getElementById('countGold').textContent = list.filter(r => r.plan === 'GOLD').length;
  document.getElementById('countExpiring').textContent = list.filter(r => r.status === 'EXPIRING_SOON').length;
  document.getElementById('countExpired').textContent = list.filter(r => ['EXPIRED', 'GRACE_PERIOD'].includes(r.status)).length;
  document.getElementById('countSuspended').textContent = list.filter(r => r.status === 'SUSPENDED').length;
}

function renderRestaurantsTable(list) {
  restaurantsTbody.innerHTML = '';

  if (!list.length) {
    tableEmpty.hidden = false;
    return;
  }
  tableEmpty.hidden = true;

  list.forEach(r => {
    const tr = document.createElement('tr');

    // Status label mapping
    const statusLabels = {
      ACTIVE: 'ACTIF',
      TRIAL: 'ESSAI',
      EXPIRING_SOON: 'EXPIRE BIENTÔT',
      EXPIRED: 'EXPIRÉ',
      GRACE_PERIOD: 'GRÂCE',
      SUSPENDED: 'SUSPENDU'
    };

    const statusClass = r.status || 'ACTIVE';
    const planClass = r.plan || 'FREE';

    // Date calculations display
    let dateDisplay = `Début : ${formatDate(r.started_at)}<br>`;
    if (r.plan === 'FREE') {
      dateDisplay += `<span style="color:#94a3b8">Pas d'expiration</span>`;
    } else {
      dateDisplay += `Expiration : <strong>${formatDate(r.expires_at)}</strong>`;
      if (r.days_remaining !== null) {
        if (r.days_remaining > 0) {
          dateDisplay += ` <small style="color:#3ecf8e">(${r.days_remaining}j restants)</small>`;
        } else {
          dateDisplay += ` <small style="color:#e86b6b">(${Math.abs(r.days_remaining)}j de retard)</small>`;
        }
      }
    }

    // Payment display
    let payDisplay = 'Aucun paiement';
    if (r.last_payment_amount > 0) {
      payDisplay = `<strong>${formatFcfa(r.last_payment_amount)}</strong><br><small style="color:#94a3b8">${r.last_payment_provider || 'WAVE'} • ${formatDate(r.last_payment_date)}</small>`;
    }

    tr.innerHTML = `
      <td class="rest-name-cell">
        <strong>${r.name || 'Restaurant sans nom'}</strong>
        <span>ID #${r.id} • ${r.city || 'Dakar'}</span>
      </td>
      <td>
        <strong style="color:#e2e8f0;font-size:12px">${r.owner_email}</strong><br>
        <span style="color:#94a3b8;font-size:11px">${r.owner_phone || r.phone || ''}</span>
      </td>
      <td>
        <span class="plan-tag ${planClass}">${r.plan}</span>
      </td>
      <td>
        <span class="status-badge ${statusClass}">${statusLabels[r.status] || r.status}</span>
      </td>
      <td style="font-size:12px">
        ${dateDisplay}
      </td>
      <td style="font-size:12px">
        ${payDisplay}
      </td>
      <td style="font-size:12px;color:#94a3b8">
        ${formatDate(r.created_at)}
      </td>
      <td>
        <button type="button" class="btn btn-ghost btn-sm edit-rest-btn" data-id="${r.id}" style="display:inline-flex;align-items:center;gap:6px">
          ${typeof AurestoIcons !== 'undefined' ? AurestoIcons.get('settings', { size: 14 }) : ''} Gérer
        </button>
      </td>
    `;

    restaurantsTbody.appendChild(tr);
  });

  // Attach action listeners
  document.querySelectorAll('.edit-rest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const restId = btn.getAttribute('data-id');
      const restaurant = allRestaurants.find(item => String(item.id) === String(restId));
      if (restaurant) openEditModal(restaurant);
    });
  });
}

// Open Edit Modal
function openEditModal(r) {
  editRestId.value = r.id;
  modalRestName.textContent = `Gérer — ${r.name}`;
  editPlan.value = r.plan;
  editStatus.value = r.status;
  
  if (r.expires_at) {
    const d = new Date(r.expires_at);
    editExpiresAt.value = d.toISOString().split('T')[0];
  } else {
    editExpiresAt.value = '';
  }

  editGraceDays.value = r.grace_period_days || 3;
  editOwnerEmail.value = r.owner_email === 'Non renseigné' ? '' : r.owner_email;
  editOwnerPhone.value = r.owner_phone === 'Non renseigné' ? '' : r.owner_phone;

  if (r.status === 'SUSPENDED') {
    toggleSuspendBtn.innerHTML = `${typeof AurestoIcons !== 'undefined' ? AurestoIcons.get('unlock', { size: 14 }) : ''} Réactiver le restaurant`;
    toggleSuspendBtn.className = 'btn btn-primary';
  } else {
    toggleSuspendBtn.innerHTML = `${typeof AurestoIcons !== 'undefined' ? AurestoIcons.get('lock', { size: 14 }) : ''} Suspendre le restaurant`;
    toggleSuspendBtn.className = 'btn btn-danger';
  }

  editModalOverlay.hidden = false;
}

function closeEditModal() {
  editModalOverlay.hidden = true;
}

// Save Edit Modal
async function saveRestaurantSubscription() {
  const restId = editRestId.value;
  const payload = {
    plan: editPlan.value,
    status: editStatus.value,
    expiresAt: editExpiresAt.value ? new Date(editExpiresAt.value).toISOString() : null,
    gracePeriodDays: parseInt(editGraceDays.value, 10) || 3,
    ownerEmail: editOwnerEmail.value.trim(),
    ownerPhone: editOwnerPhone.value.trim()
  };

  try {
    const res = await ownerFetch(`/api/owner/restaurants/${restId}/subscription`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Erreur lors de la mise à jour');
    showToast('Modifications enregistrées avec succès !');
    closeEditModal();
    loadDashboardData();
  } catch (err) {
    showToast('Erreur lors de la sauvegarde : ' + err.message);
  }
}

// Toggle Suspend
async function toggleSuspendRestaurant() {
  const restId = editRestId.value;
  const restaurant = allRestaurants.find(r => String(r.id) === String(restId));
  if (!restaurant) return;

  const isSuspended = restaurant.status === 'SUSPENDED';
  const actionText = isSuspended ? 'réactiver' : 'suspendre';

  if (!confirm(`Êtes-vous sûr de vouloir ${actionText} le restaurant "${restaurant.name}" ?`)) return;

  try {
    const res = await ownerFetch(`/api/owner/restaurants/${restId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ suspend: !isSuspended })
    });
    if (!res.ok) throw new Error('Erreur');
    showToast(`Restaurant ${isSuspended ? 'réactivé' : 'suspendu'} avec succès !`);
    closeEditModal();
    loadDashboardData();
  } catch (err) {
    showToast('Erreur lors du changement de statut');
  }
}

// Event Listeners
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const secretKey = document.getElementById('ownerSecretKey').value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/owner/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secretKey })
    });

    const data = await res.json();
    if (res.ok && data.token) {
      setOwnerToken(data.token);
      hideAuthModal();
      loadDashboardData();
      showToast('Bienvenue sur le Owner Dashboard Auresto !');
    } else {
      authError.textContent = data.message || 'Clé d\'accès invalide.';
      authError.hidden = false;
    }
  } catch (err) {
    authError.textContent = 'Impossible de contacter le serveur backend.';
    authError.hidden = false;
  }
});

document.getElementById('ownerLogoutBtn').addEventListener('click', () => {
  setOwnerToken(null);
  showAuthModal();
  showToast('Déconnecté du Owner Dashboard.');
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  loadDashboardData();
  showToast('Données rafraîchies !');
});

// Search & Filters
searchInput.addEventListener('input', (e) => {
  currentQuery = e.target.value;
  clearSearchBtn.hidden = !currentQuery;
  loadRestaurants();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  currentQuery = '';
  clearSearchBtn.hidden = true;
  loadRestaurants();
});

filterTabs.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    filterTabs.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    loadRestaurants();
  });
});

sortSelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  loadRestaurants();
});

// Edit Modal buttons
document.getElementById('closeEditModalBtn').addEventListener('click', closeEditModal);
document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
document.getElementById('saveEditBtn').addEventListener('click', saveRestaurantSubscription);
toggleSuspendBtn.addEventListener('click', toggleSuspendRestaurant);

// Quick extend buttons
document.getElementById('quickExtend30Btn').addEventListener('click', () => {
  const curr = editExpiresAt.value ? new Date(editExpiresAt.value) : new Date();
  curr.setDate(curr.getDate() + 30);
  editExpiresAt.value = curr.toISOString().split('T')[0];
  editStatus.value = 'ACTIVE';
  showToast('+ 30 jours ajoutés à la date d\'expiration');
});

document.getElementById('quickExtend7Btn').addEventListener('click', () => {
  const curr = editExpiresAt.value ? new Date(editExpiresAt.value) : new Date();
  curr.setDate(curr.getDate() + 7);
  editExpiresAt.value = curr.toISOString().split('T')[0];
  editStatus.value = 'ACTIVE';
  showToast('+ 7 jours ajoutés à la date d\'expiration');
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const authIconEl = document.getElementById('ownerAuthIcon');
  if (authIconEl && typeof AurestoIcons !== 'undefined') {
    authIconEl.innerHTML = AurestoIcons.get('lock', { size: 36 });
  }

  const token = getOwnerToken();
  if (token) {
    hideAuthModal();
    loadDashboardData();
  } else {
    showAuthModal();
  }
});
