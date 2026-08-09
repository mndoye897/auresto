// Owner Dashboard Logic for Auresto Platform

const API_BASE = window.AURESTO_API_BASE || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname
    ? 'http://localhost:4000'
    : window.location.origin
);
const OWNER_TOKEN_KEY = 'auresto_owner_token';

let currentOwnerToken = null;
let currentFilter = 'ALL';
let currentQuery = '';
let currentSort = 'created_desc';
let allRestaurants = [];
let currentSection = 'overview';

// DOM Elements
const authOverlay = document.getElementById('ownerAuthOverlay');
const authForm = document.getElementById('ownerLoginForm');
const authError = document.getElementById('authError');
const mainContent = document.getElementById('ownerMainContent');
const ownerNav = document.getElementById('ownerNav');

// Drawer Elements
const drawerOverlay = document.getElementById('drawerOverlay');
const drawer = document.getElementById('restaurantDrawer');
const drawerRestaurantName = document.getElementById('drawerRestaurantName');
const drawerContent = document.getElementById('drawerContent');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');

// Restaurant Table Elements
const searchInput = document.getElementById('ownerSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const sortSelect = document.getElementById('sortSelect');
const filterTabs = document.getElementById('filterTabs');
const restaurantsTbody = document.getElementById('restaurantsTbody');
const tableEmpty = document.getElementById('tableEmpty');
const restaurantsLoading = document.getElementById('restaurantsLoading');

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

// Navigation
function switchSection(sectionId) {
  currentSection = sectionId;
  
  // Update nav items
  document.querySelectorAll('.owner-nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-section') === sectionId) {
      item.classList.add('active');
    }
  });
  
  // Show/hide sections
  document.querySelectorAll('.owner-section').forEach(section => {
    section.hidden = true;
  });
  
  const targetSection = document.getElementById(`section-${sectionId}`);
  if (targetSection) {
    targetSection.hidden = false;
  }
  
  // Load section data
  loadSectionData(sectionId);
}

async function loadSectionData(sectionId) {
  switch (sectionId) {
    case 'overview':
      await loadOverviewData();
      break;
    case 'restaurants':
      await loadRestaurants();
      break;
    case 'subscriptions':
      await loadSubscriptions();
      break;
    case 'payments':
      await loadPayments();
      break;
    case 'deadlines':
      await loadDeadlines();
      break;
    case 'audit':
      await loadAuditLogs();
      break;
  }
}

// Overview Data
async function loadOverviewData() {
  try {
    const [statsRes, deadlinesRes, revenueRes] = await Promise.all([
      ownerFetch('/api/owner/stats'),
      ownerFetch('/api/owner/deadlines'),
      ownerFetch('/api/owner/revenue')
    ]);
    
    if (statsRes.ok) {
      const stats = (await statsRes.json()).stats;
      updateOverviewStats(stats);
    } else {
      console.error('Stats API error:', statsRes.status);
    }
    
    if (deadlinesRes.ok) {
      const { deadlines } = await deadlinesRes.json();
      updateAlerts(deadlines);
      updateRiskList(deadlines);
    } else {
      console.error('Deadlines API error:', deadlinesRes.status);
      const riskList = document.getElementById('riskList');
      if (riskList) {
        riskList.innerHTML = '<div class="error-state">Impossible de charger les échéances</div>';
      }
    }
    
    if (revenueRes.ok) {
      const revenue = await revenueRes.json();
      updateRevenueCards(revenue);
    } else {
      console.error('Revenue API error:', revenueRes.status);
    }
  } catch (err) {
    console.error('Failed to load overview data:', err);
    const riskList = document.getElementById('riskList');
    if (riskList) {
      riskList.innerHTML = '<div class="error-state">Impossible de charger les échéances</div>';
    }
  }
}

function updateOverviewStats(stats) {
  document.getElementById('kpiActiveRestaurants').textContent = stats.activeRestaurants || 0;
  document.getElementById('kpiSuspendedRestaurants').textContent = stats.suspendedRestaurants || 0;
  document.getElementById('kpiRevenue').textContent = formatFcfa(stats.monthlyRevenue || 0);
  document.getElementById('kpiExpiringSoon').textContent = stats.expiringSoonRestaurants || 0;
  
  // Plan counts (would need to be calculated from restaurants list)
  document.getElementById('kpiSilverCount').textContent = stats.silverCount || 0;
  document.getElementById('kpiGoldCount').textContent = stats.goldCount || 0;
  document.getElementById('kpiFreeCount').textContent = stats.freeCount || 0;
  
  // Update plans distribution
  const total = stats.totalRestaurants || 1;
  const freePercent = Math.round((stats.freeCount || 0) / total * 100);
  const silverPercent = Math.round((stats.silverCount || 0) / total * 100);
  const goldPercent = Math.round((stats.goldCount || 0) / total * 100);
  
  document.getElementById('freeCount').textContent = stats.freeCount || 0;
  document.getElementById('freePercent').textContent = `${freePercent}%`;
  document.getElementById('freeFill').style.width = `${freePercent}%`;
  
  document.getElementById('silverCount').textContent = stats.silverCount || 0;
  document.getElementById('silverPercent').textContent = `${silverPercent}%`;
  document.getElementById('silverFill').style.width = `${silverPercent}%`;
  
  document.getElementById('goldCount').textContent = stats.goldCount || 0;
  document.getElementById('goldPercent').textContent = `${goldPercent}%`;
  document.getElementById('goldFill').style.width = `${goldPercent}%`;
}

function updateRevenueCards(revenue) {
  document.getElementById('revenueToday').textContent = formatFcfa(revenue.today || 0);
  document.getElementById('revenueWeek').textContent = formatFcfa(revenue.week || 0);
  document.getElementById('revenueMonth').textContent = formatFcfa(revenue.month || 0);
  document.getElementById('revenueTotal').textContent = formatFcfa(revenue.total || 0);
}

function updateAlerts(deadlines) {
  const alerts = document.getElementById('ownerAlerts');
  const expiringCount = deadlines.today?.length + deadlines.tomorrow?.length + deadlines.threeDays?.length + deadlines.sevenDays?.length || 0;
  const graceCount = deadlines.gracePeriod?.length || 0;
  const suspendedCount = deadlines.suspended?.length || 0;
  
  if (expiringCount > 0 || graceCount > 0 || suspendedCount > 0) {
    alerts.hidden = false;
    
    if (expiringCount > 0) {
      document.getElementById('alertExpiring').hidden = false;
      document.getElementById('alertExpiringText').textContent = `${expiringCount} restaurants expirent dans les 7 prochains jours`;
    } else {
      document.getElementById('alertExpiring').hidden = true;
    }
    
    if (graceCount > 0) {
      document.getElementById('alertGrace').hidden = false;
      document.getElementById('alertGraceText').textContent = `${graceCount} restaurants en période de grâce`;
    } else {
      document.getElementById('alertGrace').hidden = true;
    }
    
    if (suspendedCount > 0) {
      document.getElementById('alertSuspended').hidden = false;
      document.getElementById('alertSuspendedText').textContent = `${suspendedCount} restaurants suspendus`;
    } else {
      document.getElementById('alertSuspended').hidden = true;
    }
  } else {
    alerts.hidden = true;
  }
}

function updateRiskList(deadlines) {
  const riskList = document.getElementById('riskList');
  console.log('updateRiskList called, riskList:', riskList, 'deadlines:', deadlines);
  
  if (!riskList) {
    console.error('riskList element not found');
    return;
  }
  
  const riskItems = [];
  
  // Collect all at-risk restaurants
  [...(deadlines.today || []), ...(deadlines.tomorrow || []), ...(deadlines.threeDays || []), ...(deadlines.gracePeriod || [])].forEach(item => {
    const daysText = item.days_remaining < 0 
      ? `Expire depuis ${Math.abs(item.days_remaining)} jours`
      : `Expire dans ${item.days_remaining} jours`;
    
    riskItems.push({
      name: item.name,
      details: `${item.plan} • ${daysText}`,
      id: item.id,
      urgency: item.days_remaining < 0 ? 'danger' : 'warning'
    });
  });
  
  console.log('riskItems:', riskItems);
  
  if (riskItems.length === 0) {
    riskList.innerHTML = '<div class="empty-state">Aucun restaurant à risque</div>';
    return;
  }
  
  riskList.innerHTML = riskItems.map(item => `
    <div class="risk-item ${item.urgency}">
      <div class="risk-info">
        <div class="risk-name">${item.name}</div>
        <div class="risk-details">${item.details}</div>
      </div>
      <button type="button" class="risk-action" onclick="openRestaurantDrawer(${item.id})">Voir</button>
    </div>
  `).join('');
}

// Restaurants
async function loadRestaurants() {
  restaurantsLoading.hidden = false;
  tableEmpty.hidden = true;
  restaurantsTbody.innerHTML = '';
  
  try {
    const url = `/api/owner/restaurants?filter=${encodeURIComponent(currentFilter)}&search=${encodeURIComponent(currentQuery)}`;
    const res = await ownerFetch(url);
    
    if (!res.ok) throw new Error('Failed to load restaurants');
    
    const data = await res.json();
    allRestaurants = data.restaurants || [];
    
    renderRestaurantsTable(allRestaurants);
  } catch (err) {
    console.error('Failed to load restaurants:', err);
    restaurantsLoading.innerHTML = '<div class="loading-state">Erreur lors du chargement</div>';
  } finally {
    restaurantsLoading.hidden = true;
  }
}

function renderRestaurantsTable(list) {
  restaurantsTbody.innerHTML = '';
  
  if (!list.length) {
    tableEmpty.hidden = false;
    return;
  }
  
  tableEmpty.hidden = true;
  
  const statusLabels = {
    ACTIVE: 'ACTIF',
    EXPIRING_SOON: 'EXPIRANT',
    EXPIRED: 'EXPIRÉ',
    GRACE_PERIOD: 'GRÂCE',
    SUSPENDED: 'SUSPENDU'
  };
  
  list.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${r.name || 'Restaurant sans nom'}</strong>
      </td>
      <td>
        <span style="color:#94a3b8;font-size:12px">AUR-${String(r.id).padStart(5, '0')}</span>
      </td>
      <td>
        <span class="plan-tag ${r.plan || 'FREE'}">${r.plan || 'FREE'}</span>
      </td>
      <td>
        <span class="status-badge ${r.status || 'ACTIVE'}">${statusLabels[r.status] || r.status}</span>
      </td>
      <td style="font-size:12px;color:#94a3b8">
        ${formatDate(r.expires_at)}
      </td>
      <td style="font-size:12px;color:#94a3b8">
        ${formatDate(r.created_at)}
      </td>
      <td>
        <button type="button" class="btn btn-ghost btn-sm" onclick="openRestaurantDrawer(${r.id})">
          Voir
        </button>
      </td>
    `;
    restaurantsTbody.appendChild(tr);
  });
}

// Subscriptions
async function loadSubscriptions() {
  const subscriptionsList = document.getElementById('subscriptionsList');
  subscriptionsList.innerHTML = '<div class="loading-state">Chargement des abonnements...</div>';
  
  try {
    const res = await ownerFetch('/api/owner/subscriptions');
    if (!res.ok) throw new Error('Failed to load subscriptions');
    
    const { subscriptions } = await res.json();
    
    if (!subscriptions.length) {
      subscriptionsList.innerHTML = '<div class="empty-state">Aucun abonnement</div>';
      return;
    }
    
    subscriptionsList.innerHTML = subscriptions.map(sub => `
      <div class="subscription-item">
        <div>
          <div class="subscription-name">${sub.restaurant_name}</div>
          <div class="subscription-details">${sub.plan} • ${formatDate(sub.expires_at)}</div>
        </div>
        <span class="status-badge ${sub.status}">${sub.status}</span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load subscriptions:', err);
    subscriptionsList.innerHTML = '<div class="loading-state">Erreur lors du chargement</div>';
  }
}

// Payments
async function loadPayments() {
  const paymentsList = document.getElementById('paymentsList');
  
  try {
    const res = await ownerFetch('/api/owner/payments');
    if (!res.ok) throw new Error('Failed to load payments');
    
    const data = await res.json();
    
    if (data.message) {
      paymentsList.innerHTML = `<div class="empty-state">${data.message}</div>`;
      return;
    }
    
    const { payments } = data;
    
    if (!payments.length) {
      paymentsList.innerHTML = '<div class="empty-state">Aucun paiement</div>';
      return;
    }
    
    paymentsList.innerHTML = payments.map(pay => `
      <div class="payment-item">
        <div>
          <div class="payment-restaurant">${pay.restaurant}</div>
          <div class="payment-details">${pay.type} • ${formatDate(pay.date)}</div>
        </div>
        <div class="payment-amount">${formatFcfa(pay.amount)}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load payments:', err);
    paymentsList.innerHTML = '<div class="loading-state">Erreur lors du chargement</div>';
  }
}

// Deadlines
async function loadDeadlines() {
  const deadlinesContainer = document.getElementById('deadlinesContainer');
  deadlinesContainer.innerHTML = '<div class="loading-state">Chargement des échéances...</div>';
  
  try {
    const res = await ownerFetch('/api/owner/deadlines');
    if (!res.ok) throw new Error('Failed to load deadlines');
    
    const { deadlines } = await res.json();
    
    let html = '';
    
    const groups = [
      { key: 'today', title: "AUJOURD'HUI" },
      { key: 'tomorrow', title: 'DEMAIN' },
      { key: 'threeDays', title: 'DANS 3 JOURS' },
      { key: 'sevenDays', title: 'DANS 7 JOURS' },
      { key: 'gracePeriod', title: 'PÉRIODE DE GRÂCE' },
      { key: 'suspended', title: 'SUSPENDUS' }
    ];
    
    groups.forEach(group => {
      const items = deadlines[group.key] || [];
      if (items.length === 0) return;
      
      html += `
        <div class="deadline-group">
          <div class="deadline-group-title">${group.title} (${items.length})</div>
          ${items.map(item => `
            <div class="deadline-item ${group.key === 'gracePeriod' || group.key === 'suspended' ? 'urgent' : ''}">
              <div>
                <div style="font-weight:600;color:#fff">${item.name}</div>
                <div style="font-size:12px;color:#94a3b8">${item.plan} • ${formatDate(item.expires_at)}</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" onclick="openRestaurantDrawer(${item.id})">Voir</button>
            </div>
          `).join('')}
        </div>
      `;
    });
    
    if (!html) {
      html = '<div class="empty-state">Aucune échéance à venir</div>';
    }
    
    deadlinesContainer.innerHTML = html;
  } catch (err) {
    console.error('Failed to load deadlines:', err);
    deadlinesContainer.innerHTML = '<div class="loading-state">Erreur lors du chargement</div>';
  }
}

// Audit Logs
async function loadAuditLogs() {
  const auditLogs = document.getElementById('auditLogs');
  
  try {
    const res = await ownerFetch('/api/owner/audit-logs');
    if (!res.ok) throw new Error('Failed to load audit logs');
    
    const data = await res.json();
    
    if (data.message) {
      auditLogs.innerHTML = `<div class="empty-state">${data.message}</div>`;
      return;
    }
    
    const { logs } = data;
    
    if (!logs.length) {
      auditLogs.innerHTML = '<div class="empty-state">Aucun log d\'audit</div>';
      return;
    }
    
    auditLogs.innerHTML = logs.map(log => `
      <div class="audit-log-item">
        <div class="audit-log-date">${formatDate(log.date)}</div>
        <div class="audit-log-action">${log.action}</div>
        <div class="audit-log-details">${log.details}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load audit logs:', err);
    auditLogs.innerHTML = '<div class="loading-state">Erreur lors du chargement</div>';
  }
}

// Restaurant Drawer
async function openRestaurantDrawer(restaurantId) {
  drawerRestaurantName.textContent = 'Chargement...';
  drawerContent.innerHTML = '<div class="loading-state">Chargement des détails...</div>';
  drawerOverlay.hidden = false;
  
  try {
    // First try to find in loaded restaurants
    let restaurant = allRestaurants.find(r => String(r.id) === String(restaurantId));
    
    // If not found, load from API
    if (!restaurant) {
      const res = await ownerFetch('/api/owner/restaurants');
      if (res.ok) {
        const data = await res.json();
        allRestaurants = data.restaurants || [];
        restaurant = allRestaurants.find(r => String(r.id) === String(restaurantId));
      }
    }
    
    if (!restaurant) {
      drawerContent.innerHTML = '<div class="empty-state">Restaurant non trouvé</div>';
      return;
    }
    
    drawerRestaurantName.textContent = restaurant.name;
    
    // Calculate days remaining
    let daysRemaining = null;
    if (restaurant.expires_at) {
      const expiresAt = new Date(restaurant.expires_at);
      const today = new Date();
      daysRemaining = Math.ceil((expiresAt - today) / (1000 * 60 * 60 * 24));
    }
    
    const isSuspended = restaurant.status === 'SUSPENDED';
    
    drawerContent.innerHTML = `
      <div class="drawer-section">
        <div class="drawer-section-title">Informations générales</div>
        <div class="drawer-field">
          <span class="drawer-field-label">Code</span>
          <span class="drawer-field-value">AUR-${String(restaurant.id).padStart(5, '0')}</span>
        </div>
        <div class="drawer-field">
          <span class="drawer-field-label">Email propriétaire</span>
          <span class="drawer-field-value">${restaurant.owner_email || 'Non renseigné'}</span>
        </div>
        <div class="drawer-field">
          <span class="drawer-field-label">Téléphone</span>
          <span class="drawer-field-value">${restaurant.owner_phone || 'Non renseigné'}</span>
        </div>
        <div class="drawer-field">
          <span class="drawer-field-label">Ville</span>
          <span class="drawer-field-value">${restaurant.city || 'Non renseigné'}</span>
        </div>
      </div>
      
      <div class="drawer-section">
        <div class="drawer-section-title">Abonnement</div>
        <div class="drawer-field">
          <span class="drawer-field-label">Plan</span>
          <span class="drawer-field-value">${restaurant.subscription_plan || restaurant.plan || 'FREE'}</span>
        </div>
        <div class="drawer-field">
          <span class="drawer-field-label">Statut</span>
          <span class="drawer-field-value">${restaurant.status || 'ACTIVE'}</span>
        </div>
        <div class="drawer-field">
          <span class="drawer-field-label">Date d'expiration</span>
          <span class="drawer-field-value">${formatDate(restaurant.expires_at)}</span>
        </div>
        <div class="drawer-field">
          <span class="drawer-field-label">Jours restants</span>
          <span class="drawer-field-value">${daysRemaining !== null ? (daysRemaining >= 0 ? `${daysRemaining} jours` : `Expiré depuis ${Math.abs(daysRemaining)} jours`) : '—'}</span>
        </div>
        <div class="drawer-field">
          <span class="drawer-field-label">Date de création</span>
          <span class="drawer-field-value">${formatDate(restaurant.created_at)}</span>
        </div>
      </div>
      
      <div class="drawer-section">
        <div class="drawer-section-title">Actions</div>
        <div class="drawer-actions">
          <button type="button" class="btn btn-primary" onclick="openSubscriptionModal(${restaurant.id})">
            Modifier l'abonnement
          </button>
          <button type="button" class="btn ${isSuspended ? 'btn-primary' : 'btn-danger'}" onclick="${isSuspended ? `confirmReactivate(${restaurant.id})` : `confirmSuspend(${restaurant.id})`}">
            ${isSuspended ? 'Réactiver le restaurant' : 'Suspendre le restaurant'}
          </button>
          <button type="button" class="btn btn-ghost" onclick="closeDrawer()">Fermer</button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load restaurant details:', err);
    drawerContent.innerHTML = '<div class="loading-state">Erreur lors du chargement</div>';
  }
}

function closeDrawer() {
  drawerOverlay.hidden = true;
}

// Suspend/Reactivate Restaurant
async function confirmSuspend(restaurantId) {
  const restaurant = allRestaurants.find(r => String(r.id) === String(restaurantId));
  if (!restaurant) return;
  
  const confirmed = confirm(`Suspendre le restaurant "${restaurant.name}" ?\n\nLe restaurant ne pourra plus utiliser les fonctionnalités réservées aux comptes actifs.`);
  if (!confirmed) return;
  
  try {
    const res = await ownerFetch(`/api/owner/restaurants/${restaurantId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ suspend: true })
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Suspend error:', errorData);
      throw new Error(errorData.error || 'Failed to suspend restaurant');
    }
    
    showToast(`Restaurant ${restaurant.name} suspendu.`);
    closeDrawer();
    await refreshAllData();
  } catch (err) {
    console.error('Failed to suspend restaurant:', err);
    showToast(`Erreur: ${err.message}`);
  }
}

async function confirmReactivate(restaurantId) {
  const restaurant = allRestaurants.find(r => String(r.id) === String(restaurantId));
  if (!restaurant) return;
  
  const confirmed = confirm(`Réactiver le restaurant "${restaurant.name}" ?`);
  if (!confirmed) return;
  
  try {
    const res = await ownerFetch(`/api/owner/restaurants/${restaurantId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ suspend: false })
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Reactivate error:', errorData);
      throw new Error(errorData.error || 'Failed to reactivate restaurant');
    }
    
    showToast(`Restaurant ${restaurant.name} réactivé.`);
    closeDrawer();
    await refreshAllData();
  } catch (err) {
    console.error('Failed to reactivate restaurant:', err);
    showToast(`Erreur: ${err.message}`);
  }
}

// Subscription Modal
let currentSubscriptionRestaurant = null;

function openSubscriptionModal(restaurantId) {
  const restaurant = allRestaurants.find(r => String(r.id) === String(restaurantId));
  if (!restaurant) return;
  
  currentSubscriptionRestaurant = restaurant;
  
  const modal = document.getElementById('subscriptionModal');
  if (!modal) {
    // Create modal if it doesn't exist
    const modalHTML = `
      <div class="modal-overlay" id="subscriptionModal" hidden>
        <div class="modal">
          <div class="modal-header">
            <h3>Modifier l'abonnement</h3>
            <button type="button" class="modal-close" onclick="closeSubscriptionModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="subscription-preview">
              <div class="preview-restaurant">${restaurant.name}</div>
              <div class="preview-change">
                <span class="current-plan">${restaurant.subscription_plan || restaurant.plan || 'FREE'}</span>
                <span class="arrow">→</span>
                <span class="new-plan" id="newPlanPreview">FREE</span>
              </div>
              <div class="preview-expiration">
                Nouvelle expiration : <span id="newExpirationPreview">${formatDate(restaurant.expires_at)}</span>
              </div>
            </div>
            
            <div class="form-group">
              <label for="subscriptionPlan">Plan</label>
              <select id="subscriptionPlan">
                <option value="FREE">FREE - 0 FCFA / mois</option>
                <option value="SILVER">SILVER - 25 000 FCFA / mois</option>
                <option value="GOLD">GOLD - 40 000 FCFA / mois</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="subscriptionStatus">Statut</label>
              <select id="subscriptionStatus">
                <option value="ACTIVE">ACTIF</option>
                <option value="EXPIRING_SOON">EXPIRANT</option>
                <option value="EXPIRED">EXPIRÉ</option>
                <option value="GRACE_PERIOD">GRÂCE</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="subscriptionExpiration">Date d'expiration</label>
              <input type="date" id="subscriptionExpiration" value="${restaurant.expires_at ? new Date(restaurant.expires_at).toISOString().split('T')[0] : ''}">
            </div>
            
            <div class="form-group">
              <label for="subscriptionGraceDays">Période de grâce (jours)</label>
              <input type="number" id="subscriptionGraceDays" value="${restaurant.grace_period_days || 3}" min="0" max="30">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" onclick="closeSubscriptionModal()">Annuler</button>
            <button type="button" class="btn btn-primary" onclick="confirmSubscriptionChange()">Confirmer</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  } else {
    // Update existing modal
    document.getElementById('subscriptionPlan').value = restaurant.subscription_plan || restaurant.plan || 'FREE';
    document.getElementById('subscriptionStatus').value = restaurant.status || 'ACTIVE';
    document.getElementById('subscriptionExpiration').value = restaurant.expires_at ? new Date(restaurant.expires_at).toISOString().split('T')[0] : '';
    document.getElementById('subscriptionGraceDays').value = restaurant.grace_period_days || 3;
    updateSubscriptionPreview();
  }
  
  // Add event listener for plan change
  document.getElementById('subscriptionPlan').addEventListener('change', updateSubscriptionPreview);
  document.getElementById('subscriptionExpiration').addEventListener('change', updateSubscriptionPreview);
  
  document.getElementById('subscriptionModal').hidden = false;
}

function updateSubscriptionPreview() {
  const newPlan = document.getElementById('subscriptionPlan').value;
  const newExpiration = document.getElementById('subscriptionExpiration').value;
  
  document.getElementById('newPlanPreview').textContent = newPlan;
  document.getElementById('newExpirationPreview').textContent = formatDate(newExpiration);
}

function closeSubscriptionModal() {
  const modal = document.getElementById('subscriptionModal');
  if (modal) modal.hidden = true;
  currentSubscriptionRestaurant = null;
}

async function confirmSubscriptionChange() {
  if (!currentSubscriptionRestaurant) return;
  
  const restaurantId = currentSubscriptionRestaurant.id;
  const plan = document.getElementById('subscriptionPlan').value;
  const status = document.getElementById('subscriptionStatus').value;
  const expiresAt = document.getElementById('subscriptionExpiration').value;
  const gracePeriodDays = parseInt(document.getElementById('subscriptionGraceDays').value, 10) || 3;
  
  const confirmed = confirm(
    `Restaurant ${currentSubscriptionRestaurant.name}\n\n` +
    `${currentSubscriptionRestaurant.subscription_plan || currentSubscriptionRestaurant.plan || 'FREE'} → ${plan}\n\n` +
    `Nouvelle expiration : ${formatDate(expiresAt)}\n\n` +
    `Confirmer la modification ?`
  );
  
  if (!confirmed) return;
  
  try {
    const res = await ownerFetch(`/api/owner/restaurants/${restaurantId}/subscription`, {
      method: 'PUT',
      body: JSON.stringify({
        plan,
        status,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        gracePeriodDays,
        ownerEmail: currentSubscriptionRestaurant.owner_email,
        ownerPhone: currentSubscriptionRestaurant.owner_phone
      })
    });
    
    if (!res.ok) throw new Error('Failed to update subscription');
    
    showToast(`Abonnement du restaurant ${currentSubscriptionRestaurant.name} modifié.`);
    closeSubscriptionModal();
    closeDrawer();
    await refreshAllData();
  } catch (err) {
    console.error('Failed to update subscription:', err);
    showToast('Erreur lors de la modification de l\'abonnement');
  }
}

// Refresh all data after actions
async function refreshAllData() {
  await loadOverviewData();
  await loadRestaurants();
  await loadSubscriptions();
  await loadDeadlines();
}

// Make functions globally accessible for onclick handlers
window.openRestaurantDrawer = openRestaurantDrawer;
window.closeDrawer = closeDrawer;
window.confirmSuspend = confirmSuspend;
window.confirmReactivate = confirmReactivate;
window.openSubscriptionModal = openSubscriptionModal;
window.closeSubscriptionModal = closeSubscriptionModal;
window.confirmSubscriptionChange = confirmSubscriptionChange;

// Initialize Icons
function initializeIcons() {
  const iconMap = {
    'sessionIcon': 'shield-check',
    'logoutIcon': 'log-out',
    'navOverviewIcon': 'layout-dashboard',
    'navRestaurantsIcon': 'store',
    'navSubscriptionsIcon': 'credit-card',
    'navPaymentsIcon': 'wallet',
    'navDeadlinesIcon': 'calendar-clock',
    'navAuditIcon': 'scroll-text',
    'refreshOverviewIcon': 'refresh',
    'refreshRestaurantsIcon': 'refresh',
    'refreshSubscriptionsIcon': 'refresh',
    'refreshPaymentsIcon': 'refresh',
    'refreshDeadlinesIcon': 'refresh',
    'refreshAuditIcon': 'refresh',
    'searchIcon': 'search',
    'kpiActiveIcon': 'check-circle',
    'kpiSuspendedIcon': 'lock',
    'kpiRevenueIcon': 'wallet',
    'kpiExpiringIcon': 'alert-triangle',
    'kpiSilverIcon': 'sparkles',
    'kpiGoldIcon': 'sparkles',
    'kpiFreeIcon': 'sparkles',
    'alertExpiringIcon': 'alert-triangle',
    'alertGraceIcon': 'alert-triangle',
    'alertSuspendedIcon': 'lock',
    'drawerCloseIcon': 'x'
  };
  
  Object.entries(iconMap).forEach(([elementId, iconName]) => {
    const element = document.getElementById(elementId);
    if (element && typeof AurestoIcons !== 'undefined') {
      element.innerHTML = AurestoIcons.get(iconName, { size: 16 });
    }
  });
  
  // Auth icon
  const authIconEl = document.getElementById('ownerAuthIcon');
  if (authIconEl && typeof AurestoIcons !== 'undefined') {
    authIconEl.innerHTML = AurestoIcons.get('lock', { size: 36 });
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
      initializeIcons();
      switchSection('overview');
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

// Navigation
ownerNav.addEventListener('click', (e) => {
  const navItem = e.target.closest('.owner-nav-item');
  if (navItem) {
    const sectionId = navItem.getAttribute('data-section');
    switchSection(sectionId);
  }
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

filterTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (btn) {
    filterTabs.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    loadRestaurants();
  }
});

sortSelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  loadRestaurants();
});

// Refresh buttons
document.getElementById('refreshOverviewBtn')?.addEventListener('click', () => {
  loadOverviewData();
  showToast('Données rafraîchies !');
});

document.getElementById('refreshRestaurantsBtn')?.addEventListener('click', () => {
  loadRestaurants();
  showToast('Données rafraîchies !');
});

document.getElementById('refreshSubscriptionsBtn')?.addEventListener('click', () => {
  loadSubscriptions();
  showToast('Données rafraîchies !');
});

document.getElementById('refreshPaymentsBtn')?.addEventListener('click', () => {
  loadPayments();
  showToast('Données rafraîchies !');
});

document.getElementById('refreshDeadlinesBtn')?.addEventListener('click', () => {
  loadDeadlines();
  showToast('Données rafraîchies !');
});

document.getElementById('refreshAuditBtn')?.addEventListener('click', () => {
  loadAuditLogs();
  showToast('Données rafraîchies !');
});

document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);

drawerOverlay.addEventListener('click', (e) => {
  if (e.target === drawerOverlay) {
    closeDrawer();
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeIcons();
  
  const token = getOwnerToken();
  if (token) {
    hideAuthModal();
    switchSection('overview');
  } else {
    showAuthModal();
  }
});
