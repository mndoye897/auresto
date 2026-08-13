// Réglages du restaurant. La page ne gère plus ni le design du menu client
// (voir menu-customization.html) ni les QR codes (voir table-editor.html) :
// tout ce qui touchait aux couleurs, au logo, à l'aperçu client et aux
// exports QR a été retiré avec les sections correspondantes.
// La clé Gemini n'est plus saisie ici non plus : l'IA passe par le backend,
// qui garde sa propre clé côté serveur (backend/services/ai.js).
// L'abonnement se gère depuis dashboard.html#subscriptionPanel.

const $ = selector => document.querySelector(selector);

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function initials(value) {
  return (value || 'A').trim().slice(0, 1).toUpperCase();
}

function populateHeader(data) {
  const restaurantName = data.restaurant.name || 'Mon restaurant';
  const plan = data.plan || 'Free';
  $('#sidebarPlan').textContent = plan;
  $('#sidebarPlanDetail').textContent = plan.toLowerCase() === 'gold' ? 'Design du menu inclus' : 'Découvrez les fonctions avancées';
  $('#accountName').textContent = restaurantName;
  $('#accountPlan').textContent = `Compte ${plan}`;
  $('#accountInitial').textContent = initials(restaurantName);
  $('#topbarInitial').textContent = initials(data.account?.name || restaurantName);
}

function load() {
  const data = AurestoStore.load();
  const restaurant = data.restaurant || {};

  $('#sName').value = restaurant.name || '';
  $('#sCuisine').value = restaurant.cuisine || '';
  $('#sAddress').value = restaurant.address || '';
  $('#sPhone').value = restaurant.phone || '';
  $('#sEmail').value = data.account?.email || restaurant.email || '';
  $('#sDesc').value = restaurant.description || '';
  $('#sCity').value = restaurant.city || '';
  $('#sContactPhone').value = restaurant.phone || '';
  $('#sContactEmail').value = restaurant.email || data.account?.email || '';

  populateHeader(data);

  HoursPicker.init('settingsHoursGrid', 'settingsHoursSummary');
  if (restaurant.hoursSchedule && Object.keys(restaurant.hoursSchedule).length) {
    HoursPicker.load(restaurant.hoursSchedule);
  }
}

function saveSettings() {
  const data = AurestoStore.load();
  const hoursData = HoursPicker.getData();

  data.restaurant = {
    ...data.restaurant,
    name: $('#sName').value.trim(),
    cuisine: $('#sCuisine').value.trim(),
    address: $('#sAddress').value.trim(),
    phone: $('#sPhone').value.trim() || $('#sContactPhone').value.trim(),
    email: $('#sContactEmail').value.trim() || $('#sEmail').value.trim(),
    city: $('#sCity').value.trim(),
    description: $('#sDesc').value.trim(),
    hours: hoursData.summary,
    hoursSchedule: hoursData.schedule
  };
  data.account = { ...data.account, email: $('#sEmail').value.trim() || data.account?.email || '' };

  AurestoStore.save(data);
  populateHeader(data);
  showToast('Paramètres enregistrés !');
  return data;
}

function bindActions() {
  $('#saveBtn').addEventListener('click', () => saveSettings());
  document.querySelectorAll('[data-scroll-target="saveBtn"]').forEach(button =>
    button.addEventListener('click', () => $('#saveBtn').focus())
  );
}

bindActions();
AurestoStore.init().then(load).catch(() => load());
