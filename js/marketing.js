// ============================================================
// Auresto — Marketing AI (frontend)
//
// Les données proviennent du backend, qui identifie le restaurant à
// partir du jeton d'accès. Aucun identifiant de restaurant n'est
// utilisé comme preuve d'autorisation côté client.
// ============================================================

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const state = {
  aiConfigured: false,
  insights: null,
  history: [],
  sending: false
};

// getRestaurantId() et apiHeaders() proviennent de store.js, chargé avant
// ce script : on les réutilise plutôt que de redéclarer les mêmes clés.
function apiBase() {
  return window.AURESTO_API_BASE || 'http://localhost:4000';
}
function currentRestaurantId() {
  return typeof getRestaurantId === 'function' ? getRestaurantId() : null;
}
function authHeaders() {
  return typeof apiHeaders === 'function'
    ? apiHeaders()
    : { 'Content-Type': 'application/json' };
}

function formatMoney(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function showToast(message) {
  const el = $('#mkToast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
// Rendu Markdown minimal — le texte est échappé AVANT toute mise en
// forme, donc aucune balise du modèle ne peut être injectée.
// ============================================================
function renderMarkdown(raw) {
  const lines = escapeHtml(raw).split('\n');
  let html = '';
  let listType = null;
  let tableRows = [];

  const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
  const flushTable = () => {
    if (!tableRows.length) return;
    const cells = row => row.split('|').slice(1, -1).map(c => c.trim());
    const header = cells(tableRows[0]);
    const body = tableRows.slice(2).map(cells).filter(r => r.length);
    html += '<div class="mk-table-wrap"><table><thead><tr>' +
      header.map(h => `<th>${inline(h)}</th>`).join('') +
      '</tr></thead><tbody>' +
      body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
      '</tbody></table></div>';
    tableRows = [];
  };
  const inline = t => t
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^\|.*\|$/.test(trimmed)) { closeList(); tableRows.push(trimmed); continue; }
    flushTable();

    if (!trimmed) { closeList(); continue; }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      html += `<h${level}>${inline(heading[2])}</h${level}>`;
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    if (ordered || bullet) {
      const wanted = ordered ? 'ol' : 'ul';
      if (listType !== wanted) { closeList(); html += `<${wanted}>`; listType = wanted; }
      html += `<li>${inline((ordered || bullet)[1])}</li>`;
      continue;
    }

    closeList();
    html += `<p>${inline(trimmed)}</p>`;
  }
  flushTable();
  closeList();
  return html;
}

// ============================================================
// Abonnement — la page est réservée au plan Gold
// ============================================================
function isGoldPlan() {
  try {
    const data = AurestoStore.load();
    return String(data?.plan || '').toLowerCase() === 'gold';
  } catch { return false; }
}

function renderSidebarIdentity() {
  try {
    const data = AurestoStore.load();
    const name = data?.restaurant?.name || 'Mon restaurant';
    $('#mkRestaurantName').textContent = name;
    $('#mkAvatar').textContent = (name.trim()[0] || 'A').toUpperCase();
    const plan = data?.plan || 'Free';
    $('#mkAccountPlan').textContent = `Compte ${plan}`;
    $('#mkPlanBadge').textContent = String(plan).toLowerCase() === 'gold' ? '👑 Gold' : plan;
    const goldNav = $('#customizeMenuNav');
    if (goldNav) goldNav.hidden = String(plan).toLowerCase() !== 'gold';
  } catch { /* identité non critique */ }
}

// ============================================================
// Insights
// ============================================================
function trendMarkup(value) {
  if (value === null || value === undefined) return '';
  const cls = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const arrow = value > 0 ? '↗' : value < 0 ? '↘' : '→';
  return `<span class="mk-trend ${cls}">${arrow} ${value > 0 ? '+' : ''}${value} %</span>`;
}

function insightCard({ icon, label, value, trend, sub }) {
  return `
    <div class="kpi-card glass-card">
      <div class="kpi-card-header">
        <div class="kpi-icon ${icon.cls}">${icon.svg}</div>
        <div class="kpi-label-wrap"><span class="kpi-label">${escapeHtml(label)}</span></div>
      </div>
      <div class="kpi-card-body">
        <div class="kpi-value-row">
          <span class="kpi-value">${escapeHtml(value)}</span>
          ${trend !== undefined ? trendMarkup(trend) : ''}
        </div>
        <div class="kpi-subtext">${escapeHtml(sub)}</div>
      </div>
    </div>`;
}

const ICONS = {
  revenue: { cls: 'icon-green', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
  orders: { cls: 'icon-blue', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' },
  basket: { cls: 'icon-amber', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>' },
  dish: { cls: 'icon-purple', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V2"/><path d="M12 2v20"/></svg>' },
  trend: { cls: 'icon-orange', svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>' }
};

function renderInsights(data) {
  const grid = $('#mkInsights');
  const p = data.periods;
  const t = data.trends;
  const bestDish = data.dishes.bestSellers[0];

  grid.innerHTML = [
    insightCard({ icon: ICONS.revenue, label: "CHIFFRE D'AFFAIRES", value: formatMoney(p.today.revenue), trend: t.revenueTodayVsYesterday, sub: 'Aujourd’hui vs hier' }),
    insightCard({ icon: ICONS.orders, label: 'COMMANDES', value: String(p.thisWeek.ordersCount), trend: t.ordersWeekVsPrevious, sub: 'Cette semaine' }),
    insightCard({ icon: ICONS.basket, label: 'PANIER MOYEN', value: formatMoney(p.thisWeek.avgBasket), trend: t.avgBasketWeekVsPrevious, sub: 'Cette semaine' }),
    insightCard({ icon: ICONS.dish, label: 'PLAT LE PLUS VENDU', value: bestDish ? bestDish.name : '—', sub: bestDish ? `${bestDish.qty} vendus sur 30 jours` : 'Aucune vente enregistrée' }),
    insightCard({ icon: ICONS.trend, label: 'ÉVOLUTION DES VENTES', value: `${t.revenueWeekVsPrevious > 0 ? '+' : ''}${t.revenueWeekVsPrevious} %`, trend: t.revenueWeekVsPrevious, sub: 'Semaine vs précédente' })
  ].join('');

  renderNoticed(data);
}

// Observations proactives — déduites uniquement des données reçues.
function renderNoticed(data) {
  const items = [];
  const t = data.trends;
  const { byHour, byWeekday } = data.timing;

  if (!data.dataCoverage.hasEnoughData) {
    items.push({ type: 'warn', text: `Seulement <strong>${data.dataCoverage.totalOrdersAllTime} commande(s)</strong> enregistrée(s). Les analyses gagneront en fiabilité dès que votre historique s’étoffera.` });
  } else {
    if (t.revenueWeekVsPrevious <= -10) {
      items.push({ type: 'down', text: `Votre chiffre d’affaires est en baisse de <strong>${Math.abs(t.revenueWeekVsPrevious)} %</strong> par rapport à la semaine dernière.` });
    } else if (t.revenueWeekVsPrevious >= 10) {
      items.push({ type: 'up', text: `Votre chiffre d’affaires progresse de <strong>+${t.revenueWeekVsPrevious} %</strong> cette semaine.` });
    }

    const bestHour = [...byHour].sort((a, b) => b.revenue - a.revenue)[0];
    if (bestHour) {
      items.push({ type: 'up', text: `Votre créneau le plus rentable est <strong>${bestHour.hour}h–${bestHour.hour + 1}h</strong> (${formatMoney(bestHour.revenue)} sur 30 jours).` });
    }

    const weak = [...byWeekday].sort((a, b) => a.revenue - b.revenue)[0];
    if (weak && byWeekday.length > 2) {
      items.push({ type: 'warn', text: `Le <strong>${weak.label}</strong> est votre jour le plus faible. Une offre ciblée pourrait y créer du trafic.` });
    }

    const worst = data.dishes.worstSellers[0];
    if (worst) {
      items.push({ type: 'warn', text: `<strong>${escapeHtml(worst.name)}</strong> ne s’est vendu que ${worst.qty} fois en 30 jours.` });
    }
  }

  const section = $('#mkNoticed');
  if (!items.length) { section.hidden = true; return; }
  section.hidden = false;
  $('#mkNoticedList').innerHTML = items.slice(0, 4).map(i => `
    <div class="mk-noticed-item">
      <span class="mk-noticed-dot ${i.type === 'down' ? 'down' : i.type === 'warn' ? 'warn' : ''}"></span>
      <div class="mk-noticed-text">${i.text}</div>
    </div>`).join('');
}

async function loadInsights() {
  const rid = currentRestaurantId();
  const grid = $('#mkInsights');
  if (!rid) {
    grid.innerHTML = `<div class="mk-state" style="grid-column:1/-1"><strong>Restaurant non synchronisé</strong>Terminez votre configuration pour activer les analyses.</div>`;
    return;
  }
  grid.innerHTML = '<div class="mk-skeleton" style="grid-column:1/-1;height:110px"></div>';
  try {
    const res = await fetch(`${apiBase()}/api/restaurants/${rid}/marketing/insights`, { headers: authHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    state.insights = data.insights;
    renderInsights(data.insights);
  } catch (err) {
    grid.innerHTML = `<div class="mk-state" style="grid-column:1/-1">
        <strong>Analyses indisponibles</strong>Impossible de récupérer vos statistiques pour le moment.
        <button type="button" class="mk-retry" id="mkInsightsRetry">Réessayer</button>
      </div>`;
    $('#mkInsightsRetry')?.addEventListener('click', loadInsights);
  }
}

// ============================================================
// Recommandations
// ============================================================
async function loadRecommendations() {
  const list = $('#mkRecoList');
  const btn = $('#mkRecoRefresh');
  const rid = currentRestaurantId();

  if (!state.aiConfigured) {
    list.innerHTML = `<div class="mk-state"><strong>Assistant IA non activé</strong>Les recommandations automatiques nécessitent une clé IA configurée côté serveur.</div>`;
    btn.disabled = true;
    return;
  }
  if (!rid) { list.innerHTML = `<div class="mk-state">Restaurant non synchronisé.</div>`; return; }

  btn.disabled = true;
  list.innerHTML = '<div class="mk-skeleton"></div><div class="mk-skeleton"></div><div class="mk-skeleton"></div>';

  try {
    const res = await fetch(`${apiBase()}/api/restaurants/${rid}/marketing/recommendations`, { headers: authHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const recos = data.recommendations || [];

    if (!recos.length) {
      list.innerHTML = `<div class="mk-state"><strong>Pas encore de recommandation</strong>Vos données ne permettent pas encore d’en générer.</div>`;
      return;
    }

    list.innerHTML = recos.map((r, i) => {
      const priority = String(r.priority || 'moyenne').toLowerCase();
      const cls = ['haute', 'moyenne', 'basse'].includes(priority) ? priority : 'moyenne';
      return `
        <article class="mk-reco" style="animation-delay:${i * 60}ms">
          <div class="mk-reco-head">
            <span class="mk-reco-title">${escapeHtml(r.title || 'Recommandation')}</span>
            <span class="mk-priority ${cls}">${escapeHtml(cls)}</span>
          </div>
          ${r.finding ? `<div class="mk-reco-block"><span class="mk-reco-label">Constat</span>${escapeHtml(r.finding)}</div>` : ''}
          ${r.recommendation ? `<div class="mk-reco-block"><span class="mk-reco-label">Recommandation</span>${escapeHtml(r.recommendation)}</div>` : ''}
          ${r.impact ? `<div class="mk-reco-block"><span class="mk-reco-label">Impact potentiel</span>${escapeHtml(r.impact)}</div>` : ''}
        </article>`;
    }).join('');
  } catch (err) {
    list.innerHTML = `<div class="mk-state">
        <strong>Génération impossible</strong>L’assistant n’a pas pu produire de recommandations.
        <button type="button" class="mk-retry" id="mkRecoRetry">Réessayer</button>
      </div>`;
    $('#mkRecoRetry')?.addEventListener('click', loadRecommendations);
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// Chat
// ============================================================
function appendMessage(role, content, { isError = false, allowCopy = false } = {}) {
  $('#mkEmptyState')?.remove();
  const box = $('#mkMessages');
  const div = document.createElement('div');
  div.className = `mk-msg mk-msg-${role === 'user' ? 'user' : 'ai'}${isError ? ' mk-msg-error' : ''}`;
  div.innerHTML = role === 'user' ? escapeHtml(content) : renderMarkdown(content);

  if (allowCopy) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mk-copy-btn';
    btn.textContent = 'Copier';
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(
        () => showToast('Copié dans le presse-papiers'),
        () => showToast('Copie impossible')
      );
    });
    div.appendChild(btn);
  }

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function setSending(sending) {
  state.sending = sending;
  $('#mkSendBtn').disabled = sending;
  $$('.mk-chip').forEach(c => { c.disabled = sending; });
}

async function sendQuestion(question) {
  const text = String(question || '').trim();
  if (!text || state.sending) return;

  if (!state.aiConfigured) {
    showToast('Assistant IA non activé');
    return;
  }
  const rid = currentRestaurantId();
  if (!rid) { showToast('Restaurant non synchronisé'); return; }

  appendMessage('user', text);
  $('#mkInput').value = '';
  $('#mkInput').style.height = 'auto';
  setSending(true);

  const typing = document.createElement('div');
  typing.className = 'mk-msg mk-msg-ai mk-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  $('#mkMessages').appendChild(typing);
  $('#mkMessages').scrollTop = $('#mkMessages').scrollHeight;

  try {
    const res = await fetch(`${apiBase()}/api/restaurants/${rid}/marketing/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ question: text, history: state.history.slice(-8) })
    });
    typing.remove();

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const messages = {
        AI_NOT_CONFIGURED: "L’assistant IA n’est pas encore activé sur ce serveur.",
        AI_QUOTA_EXCEEDED: "Le quota de l’API Gemini est épuisé. Vérifiez la facturation de votre projet Google AI pour réactiver l’assistant.",
        AI_INVALID_KEY: "La clé de l’API Gemini est refusée. Vérifiez la valeur de GEMINI_API_KEY côté serveur.",
        AI_MODEL_UNAVAILABLE: "Le modèle IA configuré n’est plus disponible chez Google. Mettez à jour AI_MODEL côté serveur.",
        AI_EMPTY_RESPONSE: "L’assistant n’a rien renvoyé. Reformulez votre question.",
        AI_TIMEOUT: 'Le service IA met trop de temps à répondre. Réessayez.',
        EMPTY_QUESTION: 'Votre question semble vide.'
      };
      appendMessage('ai', messages[payload.error] || "Une erreur est survenue. Réessayez dans un instant.", { isError: true });
      return;
    }

    const data = await res.json();
    state.history.push({ role: 'user', content: text });
    state.history.push({ role: 'assistant', content: data.answer });
    // Les campagnes rédigées sont longues : on propose alors la copie.
    appendMessage('ai', data.answer, { allowCopy: data.answer.length > 220 });
  } catch (err) {
    typing.remove();
    appendMessage('ai', 'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.', { isError: true });
  } finally {
    setSending(false);
  }
}

// ============================================================
// Initialisation
// ============================================================
async function checkAiStatus() {
  try {
    const res = await fetch(`${apiBase()}/api/marketing/status`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    state.aiConfigured = Boolean(data.aiConfigured);
  } catch {
    state.aiConfigured = false;
  }

  const badge = $('#mkAiState');
  if (state.aiConfigured) {
    badge.textContent = 'Connecté à vos données';
    badge.classList.remove('offline');
  } else {
    badge.textContent = 'IA non configurée';
    badge.classList.add('offline');
    $('#mkInput').placeholder = "Assistant indisponible — clé IA non configurée";
    $('#mkInput').disabled = true;
    $('#mkSendBtn').disabled = true;
    $$('.mk-chip').forEach(c => { c.disabled = true; });
    $$('.mk-example').forEach(c => { c.disabled = true; });
  }
}

function bindEvents() {
  $('#mkForm').addEventListener('submit', e => {
    e.preventDefault();
    sendQuestion($('#mkInput').value);
  });

  const input = $('#mkInput');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input.value);
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  document.addEventListener('click', e => {
    const trigger = e.target.closest('.mk-chip, .mk-example');
    if (trigger && trigger.dataset.q) sendQuestion(trigger.dataset.q);
  });

  $('#mkRecoRefresh').addEventListener('click', loadRecommendations);
  $('#mkRefreshBtn').addEventListener('click', () => {
    loadInsights();
    if (state.aiConfigured) loadRecommendations();
    showToast('Analyses actualisées');
  });
}

async function init() {
  renderSidebarIdentity();

  if (!isGoldPlan()) {
    $('#mkGoldGate').hidden = false;
    return;
  }

  $('#mkContent').hidden = false;
  bindEvents();
  await checkAiStatus();
  await loadInsights();
  loadRecommendations();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
