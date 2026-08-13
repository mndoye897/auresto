// ============================================================
// Auresto — Avis clients (espace restaurateur)
//
// Les avis sont lus via une route authentifiée : seul le restaurant
// propriétaire du jeton peut consulter ses propres avis.
// ============================================================

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const state = { reviews: [], stats: null, filter: 'all' };

function apiBase() {
  return window.AURESTO_API_BASE || 'http://localhost:4000';
}
function currentRestaurantId() {
  return typeof getRestaurantId === 'function' ? getRestaurantId() : null;
}
function authHeaders() {
  return typeof apiHeaders === 'function' ? apiHeaders() : { 'Content-Type': 'application/json' };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function starString(rating) {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function renderSidebarIdentity() {
  try {
    const data = AurestoStore.load();
    const name = data?.restaurant?.name || 'Mon restaurant';
    $('#avRestaurantName').textContent = name;
    $('#avAvatar').textContent = (name.trim()[0] || 'A').toUpperCase();
    const plan = data?.plan || 'Free';
    $('#avAccountPlan').textContent = `Compte ${plan}`;
    $('#avPlanBadge').textContent = String(plan).toLowerCase() === 'gold' ? '👑 Gold' : plan;
    const goldNav = $('#customizeMenuNav');
    if (goldNav) goldNav.hidden = String(plan).toLowerCase() !== 'gold';
  } catch { /* non critique */ }
}

function renderSummary(stats) {
  $('#avAverage').textContent = stats.total ? stats.average.toFixed(1) : '—';
  $('#avAverageStars').textContent = stats.total ? starString(stats.average) : '☆☆☆☆☆';
  $('#avTotal').textContent = stats.total
    ? `${stats.total} avis · ${stats.last30Days} ce mois-ci`
    : 'Aucun avis';

  const max = Math.max(1, ...Object.values(stats.distribution));
  $('#avDistribution').innerHTML = [5, 4, 3, 2, 1].map(n => {
    const count = stats.distribution[n] || 0;
    return `
      <div class="av-dist-row">
        <span class="av-dist-label">${n} ★</span>
        <div class="av-dist-track"><div class="av-dist-fill" style="width:${(count / max) * 100}%"></div></div>
        <span class="av-dist-count">${count}</span>
      </div>`;
  }).join('');
}

function renderList() {
  const list = $('#avList');
  const empty = $('#avEmpty');
  const filtered = state.filter === 'all'
    ? state.reviews
    : state.reviews.filter(r => r.rating === Number(state.filter));

  $('#avResultCount').textContent = `${filtered.length} avis`;

  if (!filtered.length) {
    list.innerHTML = '';
    empty.hidden = false;
    $('#avEmptyText').textContent = state.reviews.length
      ? 'Aucun avis ne correspond à ce filtre.'
      : 'Aucun avis pour le moment. Vos clients pourront en laisser depuis le menu.';
    return;
  }
  empty.hidden = true;

  list.innerHTML = filtered.map((r, i) => `
    <article class="av-card glass-card ${r.status === 'hidden' ? 'hidden-review' : ''}" style="animation-delay:${Math.min(i, 12) * 35}ms">
      <div class="av-card-head">
        <div class="av-card-who">
          <span class="av-card-name">${escapeHtml(r.customerName || 'Client')}</span>
          ${r.tableName ? `<span class="av-card-table">${escapeHtml(r.tableName)}</span>` : ''}
        </div>
        <div>
          <div class="av-card-rating">${starString(r.rating)}</div>
          <div class="av-card-date">${formatDate(r.createdAt)}</div>
        </div>
      </div>
      ${r.comment ? `<p class="av-card-comment">${escapeHtml(r.comment)}</p>` : ''}
    </article>`).join('');
}

async function toggleStatus(reviewId, nextStatus) {
  const rid = currentRestaurantId();
  if (!rid) return;
  try {
    const res = await fetch(`${apiBase()}/api/restaurants/${rid}/reviews/${reviewId}`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: nextStatus })
    });
    if (!res.ok) return;
    const review = state.reviews.find(r => String(r.id) === String(reviewId));
    if (review) review.status = nextStatus;
    renderList();
  } catch { /* silencieux : l'état reste inchangé */ }
}

async function loadReviews() {
  const rid = currentRestaurantId();
  const list = $('#avList');

  if (!rid) {
    $('#avEmpty').hidden = true;
    list.innerHTML = `<div class="av-error"><strong>Restaurant non synchronisé</strong>Terminez votre configuration pour recevoir des avis.</div>`;
    return;
  }

  list.innerHTML = '<div class="av-skeleton"></div><div class="av-skeleton"></div><div class="av-skeleton"></div>';
  $('#avEmpty').hidden = true;

  try {
    const res = await fetch(`${apiBase()}/api/restaurants/${rid}/reviews`, { headers: authHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    state.reviews = data.reviews || [];
    state.stats = data.stats;
    renderSummary(data.stats);
    renderList();
  } catch {
    list.innerHTML = `<div class="av-error">
        <strong>Avis indisponibles</strong>Impossible de récupérer vos avis pour le moment.
        <button type="button" class="av-retry" id="avRetry">Réessayer</button>
      </div>`;
    $('#avRetry')?.addEventListener('click', loadReviews);
  }
}

function bindEvents() {
  $$('.av-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.av-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.rating;
      renderList();
    });
  });
  $('#avRefreshBtn')?.addEventListener('click', loadReviews);
}

function init() {
  renderSidebarIdentity();
  bindEvents();
  loadReviews();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
