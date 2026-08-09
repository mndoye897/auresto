const SETTINGS_PREVIEW_MESSAGE = 'auresto-preview:update';
const SETTINGS_CONTENT_MESSAGE = 'auresto-preview:content';
const settingsDesignChannel = 'BroadcastChannel' in window ? new BroadcastChannel('auresto-menu-design') : null;

let logoSelection;

const $ = selector => document.querySelector(selector);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function getColors(data) {
  return {
    primary: data.menuCustomization?.colors?.primary || data.branding?.colors?.primary || '#e33c3f',
    secondary: data.menuCustomization?.colors?.secondary || data.branding?.colors?.secondary || '#0a566c',
    accent: data.menuCustomization?.colors?.accent || data.branding?.colors?.accent || '#e8a878'
  };
}

function setColorValue(input, output) {
  const value = input.value.toUpperCase();
  output.textContent = value;
}

function updateColorOutputs() {
  setColorValue($('#sColorPrimary'), $('#colorValuePrimary'));
  setColorValue($('#sColorSecondary'), $('#colorValueSecondary'));
  setColorValue($('#sColorAccent'), $('#colorValueAccent'));
}

function getSelectedLogo(data) {
  return logoSelection !== undefined ? logoSelection : data.branding?.logo || '';
}

function renderAssetPreviews(data) {
  $('#settingsLogoPreview').src = getSelectedLogo(data) || 'favicon.svg';
}

function getPreviewCustomization(data) {
  const saved = clone(data.menuCustomization || {});
  return {
    ...saved,
    colors: {
      ...(saved.colors || {}),
      primary: $('#sColorPrimary').value,
      secondary: $('#sColorSecondary').value,
      accent: $('#sColorAccent').value
    }
  };
}

function getPreviewContent(data) {
  return {
    restaurant: {
      ...data.restaurant,
      name: $('#sName').value.trim() || data.restaurant.name,
      description: $('#sDesc').value.trim() || data.restaurant.description,
      phone: $('#sPhone').value.trim(),
      city: $('#sCity').value.trim()
    },
    branding: {
      ...data.branding,
      logo: getSelectedLogo(data)
    }
  };
}

function syncMobilePreview() {
  const data = AurestoStore.load();
  const preview = $('#settingsClientPreview');
  const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  const customization = getPreviewCustomization(data);

  preview?.contentWindow?.postMessage({ type: SETTINGS_PREVIEW_MESSAGE, customization }, targetOrigin);
  preview?.contentWindow?.postMessage({ type: SETTINGS_CONTENT_MESSAGE, content: getPreviewContent(data) }, targetOrigin);
  settingsDesignChannel?.postMessage({ type: 'menu-design-update', customization });
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
  const colors = getColors(data);

  $('#sName').value = restaurant.name || '';
  $('#sCuisine').value = restaurant.cuisine || '';
  $('#sAddress').value = restaurant.address || '';
  $('#sPhone').value = restaurant.phone || '';
  $('#sEmail').value = data.account?.email || restaurant.email || '';
  $('#sDesc').value = restaurant.description || '';
  $('#sCity').value = restaurant.city || '';
  $('#sContactPhone').value = restaurant.phone || '';
  $('#sContactEmail').value = restaurant.email || data.account?.email || '';
  $('#sColorPrimary').value = colors.primary;
  $('#sColorSecondary').value = colors.secondary;
  $('#sColorAccent').value = colors.accent;
  $('#sFont').value = data.branding?.font || 'DM Sans';
  $('#sStyle').value = data.branding?.style || 'Moderne';
  $('#sQrHeader').value = data.qrConfig?.headerTemplate || 'Table {name}';
  $('#sQrFooter').value = data.qrConfig?.footerText || 'Scannez pour commander';
  $('#sQrLayout').value = data.qrConfig?.printLayout || 'chevalet';
  $('#currentPlan').textContent = data.plan || 'Free';
  $('#tableCount').textContent = `${data.tables?.length || 0} table${(data.tables?.length || 0) > 1 ? 's' : ''} configurée${(data.tables?.length || 0) > 1 ? 's' : ''}`;

  const sub = data.subInfo;
  $('#settingsSubDetails').textContent = sub?.expiresAt
    ? `Statut ${sub.status || 'actif'} · expire le ${new Date(sub.expiresAt).toLocaleDateString('fr-FR')}`
    : 'Gérez votre formule et les fonctionnalités de votre restaurant.';

  populateHeader(data);
  renderAssetPreviews(data);
  updateColorOutputs();

  HoursPicker.init('settingsHoursGrid', 'settingsHoursSummary', syncMobilePreview);
  if (restaurant.hoursSchedule && Object.keys(restaurant.hoursSchedule).length) {
    HoursPicker.load(restaurant.hoursSchedule);
  }

  $('#settingsClientPreview').src = `client.html?preview=1&v=${Date.now()}`;
}

function getQrConfig() {
  return {
    headerTemplate: $('#sQrHeader').value.trim() || 'Table {name}',
    footerText: $('#sQrFooter').value.trim() || 'Scannez pour commander',
    printLayout: $('#sQrLayout').value || 'chevalet'
  };
}

function saveQrSettings() {
  const data = AurestoStore.load();
  data.qrConfig = { ...data.qrConfig, ...getQrConfig() };
  AurestoStore.save(data);
  return data;
}

function saveSettings({ toast = true } = {}) {
  const data = AurestoStore.load();
  const hoursData = HoursPicker.getData();
  const colors = {
    ...(data.branding?.colors || {}),
    primary: $('#sColorPrimary').value,
    secondary: $('#sColorSecondary').value,
    accent: $('#sColorAccent').value
  };

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
  data.branding = {
    ...data.branding,
    colors,
    font: $('#sFont').value,
    style: $('#sStyle').value
  };
  if (logoSelection !== undefined) data.branding.logo = logoSelection;

  const customization = clone(data.menuCustomization || {});
  data.menuCustomization = {
    ...customization,
    colors: { ...(customization.colors || {}), ...colors }
  };
  data.qrConfig = { ...data.qrConfig, ...getQrConfig() };
  AurestoStore.save(data);
  populateHeader(data);
  renderAssetPreviews(data);
  syncMobilePreview();
  if (toast) showToast('Paramètres enregistrés !');
  return data;
}

function readImage(input, onLoad) {
  const [file] = input.files;
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    input.value = '';
    showToast('Choisis une image de 2 Mo maximum.');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => onLoad(reader.result));
  reader.readAsDataURL(file);
}

function bindPreviewControls() {
  $('#settingsClientPreview').addEventListener('load', syncMobilePreview);
  document.querySelectorAll('[data-settings-device]').forEach(button => {
    button.addEventListener('click', () => {
      const card = $('.mobile-preview-card');
      card.dataset.previewDevice = button.dataset.settingsDevice;
      document.querySelectorAll('[data-settings-device]').forEach(item => item.classList.toggle('active', item === button));
    });
  });

  ['sName', 'sDesc', 'sPhone', 'sCity', 'sColorPrimary', 'sColorSecondary', 'sColorAccent'].forEach(id => {
    $(`#${id}`).addEventListener('input', () => {
      if (id.startsWith('sColor')) updateColorOutputs();
      syncMobilePreview();
    });
  });

  document.querySelectorAll('[data-palette]').forEach(button => {
    button.addEventListener('click', () => {
      const [primary, secondary, accent] = button.dataset.palette.split(',');
      $('#sColorPrimary').value = primary;
      $('#sColorSecondary').value = secondary;
      $('#sColorAccent').value = accent;
      updateColorOutputs();
      syncMobilePreview();
    });
  });
}

async function generateQrCanvas(url, size = 160) {
  const canvas = document.createElement('canvas');
  if (typeof QRCode !== 'undefined') {
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
    document.body.appendChild(tempDiv);
    try {
      new QRCode(tempDiv, { text: url, width: size, height: size, colorDark: '#111111', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
      await new Promise(resolve => window.setTimeout(resolve, 100));
      const source = tempDiv.querySelector('canvas');
      if (source) {
        canvas.width = size;
        canvas.height = size;
        canvas.getContext('2d').drawImage(source, 0, 0, size, size);
        return canvas;
      }
    } finally {
      tempDiv.remove();
    }
  }
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#111111';
  context.font = '700 14px sans-serif';
  context.textAlign = 'center';
  context.fillText('QR Code', size / 2, size / 2);
  return canvas;
}

async function downloadSettingsPdf() {
  const data = saveSettings({ toast: false });
  if (!window.jspdf) return showToast('Le générateur PDF est indisponible.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(17);
  doc.text(data.restaurant.name || 'Auresto', 105, 18, { align: 'center' });
  let y = 32;
  for (const table of data.tables || []) {
    if (y > 250) { doc.addPage(); y = 20; }
    const canvas = await generateQrCanvas(AurestoStore.getTableUrl(table.id));
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 20, y, 45, 45);
    doc.setFontSize(12);
    doc.text(data.qrConfig.headerTemplate.replace('{name}', table.name), 74, y + 16);
    doc.setFontSize(9);
    doc.text(data.qrConfig.footerText, 74, y + 25);
    y += 58;
  }
  doc.save(`auresto-qr-${data.restaurant.name || 'restaurant'}.pdf`);
}

async function downloadSettingsWord() {
  const data = saveSettings({ toast: false });
  const cards = await Promise.all((data.tables || []).map(async table => {
    const canvas = await generateQrCanvas(AurestoStore.getTableUrl(table.id), 200);
    return `<section style="margin:20px;padding:16px;border:1px solid #ddd"><h2>${data.qrConfig.headerTemplate.replace('{name}', table.name)}</h2><img src="${canvas.toDataURL('image/png')}" width="200" height="200"><p>${data.qrConfig.footerText}</p></section>`;
  }));
  const blob = new Blob([`<!doctype html><html><meta charset="utf-8"><body>${cards.join('')}</body></html>`], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `auresto-qr-${data.restaurant.name || 'restaurant'}.doc`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindActions() {
  $('#saveBtn').addEventListener('click', () => saveSettings());
  document.querySelectorAll('[data-scroll-target="saveBtn"]').forEach(button => button.addEventListener('click', () => $('#saveBtn').focus()));
  $('#settingsLogoInput').addEventListener('change', event => readImage(event.target, image => {
    logoSelection = image;
    renderAssetPreviews(AurestoStore.load());
    syncMobilePreview();
  }));
  $('#removeLogoBtn').addEventListener('click', () => {
    logoSelection = '';
    $('#settingsLogoInput').value = '';
    renderAssetPreviews(AurestoStore.load());
    syncMobilePreview();
  });
  $('#downloadQrPdfBtn').addEventListener('click', downloadSettingsPdf);
  $('#downloadQrWordBtn').addEventListener('click', downloadSettingsWord);
  $('#settingsRenewBtn').addEventListener('click', () => showToast('Le renouvellement Wave sera disponible dès sa configuration.'));
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Réinitialiser toutes les données ? Cette action est irréversible.')) return;
    AurestoStore.reset();
    location.href = 'onboarding.html';
  });
}

bindPreviewControls();
bindActions();
AurestoStore.init().then(load).catch(() => load());
