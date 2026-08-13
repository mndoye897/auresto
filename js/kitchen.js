const NEXT_STATUS = { new: 'preparing', preparing: 'ready', ready: 'served' };
const NEXT_LABEL = { new: 'Commencer', preparing: 'Prêt', ready: 'Servi' };

function render() {
  const data = AurestoStore.load();
  const hasData = Boolean(data.restaurant?.name || (data.menu?.items && data.menu.items.length > 0) || (data.orders && data.orders.length > 0));
  if (!data.onboardingComplete && !hasData) { location.href = 'onboarding.html'; return; }
  if (!data.onboardingComplete && hasData) {
    data.onboardingComplete = true;
    AurestoStore.update({ onboardingComplete: true });
  }

  const cols = { new: [], preparing: [], ready: [], served: [] };
  data.orders.forEach(o => {
    if (cols[o.status]) cols[o.status].push(o);
  });

  renderCol('colNew', cols.new, 'new');
  renderCol('colPrep', cols.preparing, 'preparing');
  renderCol('colReady', cols.ready, 'ready');
  renderCol('colServed', cols.served.slice(0, 5), 'served');
}

function renderCol(elId, orders, status) {
  const el = document.getElementById(elId);
  el.innerHTML = orders.length
    ? orders.map(o => cardHtml(o, status)).join('')
    : '<p style="color:rgba(255,255,255,.4);font-size:11px">—</p>';

  el.querySelectorAll('[data-advance]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.advance;
      const order = AurestoStore.load().orders.find(o => o.id === id);
      if (order && NEXT_STATUS[order.status]) {
        AurestoStore.updateOrderStatus(id, NEXT_STATUS[order.status]);
        render();
      }
    });
  });
}

function cardHtml(order, status) {
  const items = (order.items || []).map(i => `
    <li>
      <strong>${i.qty}× ${i.name}</strong>
      ${i.optionsSummary ? `<small style="display:block;color:#f59e0b;font-size:11px">★ ${i.optionsSummary}</small>` : ''}
      ${i.note ? `<small style="display:block;color:#cbd5e1;font-size:11px">Note: ${i.note}</small>` : ''}
    </li>
  `).join('');
  const btn = status !== 'served'
    ? `<button type="button" class="btn-next" data-advance="${order.id}">${NEXT_LABEL[status]}</button>`
    : '';
  return `
    <div class="kitchen-card">
      <strong>${order.tableName || 'Table'}</strong>
      <small>${new Date(order.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small>
      <ul>${items}</ul>
      <div class="actions">${btn}</div>
    </div>
  `;
}

AurestoStore.init().then(() => {
  render();
  setInterval(render, 3000);

  if (typeof io !== 'undefined') {
    try {
      const apiBase = window.AURESTO_API_BASE || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:4000' : window.location.origin);
      const socket = io(apiBase);
      const rid = AurestoStore.load().restaurant?.id;
      if (rid) socket.emit('join_restaurant', rid);

      socket.on('order:new', () => {
        render();
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(() => {});
        } catch (e) {}
      });

      socket.on('order:status_updated', () => render());
    } catch (e) {
      console.warn('Socket.io connection warning:', e);
    }
  }
});
