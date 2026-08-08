const STEP_LABELS = ['Offre', 'Compte', 'Restaurant', 'Identité', 'Scan menu', 'Vérification', 'Tables', 'QR'];

const AI_STEPS = ['Détection du logo…', 'Suppression du fond…', 'Amélioration de la qualité…', 'Création des formats…', 'Extraction des couleurs…', 'Application au menu…'];



let currentStep = 1;

let selectedPlan = 'Free';

let selectedCategory = '';

let printFormat = 'chevalet';

let brandingReady = false;

let menuScanned = false;

let menuScanInProgress = false;

let restaurantLocation = null;



const $ = id => document.getElementById(id);

const toast = $('toast');



function showToast(msg) {

  toast.textContent = msg;

  toast.classList.add('show');

  setTimeout(() => toast.classList.remove('show'), 3000);

}



function loadState() {

  // Initialize API state first (async), then load

  AurestoStore.init().then(() => {

    const data = AurestoStore.load();

    const params = new URLSearchParams(location.search);

    if (params.get('plan')) {

      selectedPlan = params.get('plan');

      data.plan = selectedPlan;

      AurestoStore.save(data);

    } else {

      selectedPlan = data.plan || 'Free';

    }

    currentStep = data.onboardingStep || 1;

    if (data.onboardingComplete) {

      location.href = 'dashboard.html';

      return;

    }

    menuScanned = data.menu?.items?.length > 0;

    populateForms(data);

    HoursPicker.init('hoursGrid', 'hoursSummary');

    if (data.restaurant?.hoursSchedule && Object.keys(data.restaurant.hoursSchedule).length) {

      HoursPicker.load(data.restaurant.hoursSchedule);

    }

  });

}



function populateForms(data) {

  $('accName').value = data.account?.name || '';

  $('accEmail').value = data.account?.email || '';

  $('accPhone').value = data.account?.phone || '';

  $('restName').value = data.restaurant?.name || '';

  $('restAddress').value = data.restaurant?.address || '';

  $('restCity').value = data.restaurant?.city || 'Dakar';

  $('restPhone').value = data.restaurant?.phone || '';

  $('restDesc').value = data.restaurant?.description || '';

  restaurantLocation = data.restaurant?.location || null;

  updateGeoStatus();

  if (data.branding?.logo) {

    brandingReady = true;

    showBrandingResult(data.branding);

  }

  if (data.menu?.menuScanImage) {

    $('menuScanPreview').hidden = false;

    $('menuScanImage').src = data.menu.menuScanImage;

    menuScanned = true;

    const count = data.menu.items?.length || 0;

    $('menuScanCount').textContent = count

      ? `${count} plats détectés`

      : 'Image enregistrée · relancez l\'analyse si besoin';

  }

  renderCategories(data.menu?.categories || []);

  renderDishes();

  renderTables();

}



function buildProgress() {

  const bar = $('progressBar');

  const labels = $('stepLabels');

  bar.innerHTML = '';

  labels.innerHTML = '';

  STEP_LABELS.forEach((label, i) => {

    const step = i + 1;

    const barEl = document.createElement('div');

    barEl.className = 'progress-step' + (step < currentStep ? ' done' : step === currentStep ? ' active' : '');

    bar.appendChild(barEl);

    const labelEl = document.createElement('span');

    labelEl.textContent = label;

    if (step === currentStep) labelEl.className = 'active';

    labels.appendChild(labelEl);

  });

}



function goToStep(step) {

  currentStep = step;

  document.querySelectorAll('.step-panel').forEach(p => {

    p.classList.toggle('active', Number(p.dataset.step) === step);

  });

  $('stepSubtitle').textContent = `Étape ${step} sur 8 — ${STEP_LABELS[step - 1]}`;

  $('prevBtn').disabled = step === 1;

  $('nextBtn').textContent = step === 8 ? 'Accéder au dashboard →' : 'Continuer →';

  $('mainActions').style.display = step === 8 ? 'none' : 'flex';

  buildProgress();

  AurestoStore.update({ onboardingStep: step });

  setNextButtonState();

  if (step === 6) {

    const data = AurestoStore.load();

    renderCategories(data.menu.categories);

    renderDishes();

  }

  if (step === 7) renderTables();

  if (step === 8) { renderQrConfigForm(); renderQrPrint(); }

  window.scrollTo({ top: 0, behavior: 'smooth' });

}



function saveRestaurant() {

  const hoursData = HoursPicker.getData();

  const existing = AurestoStore.load().restaurant;

  AurestoStore.update({

    restaurant: {

      ...existing,

      name: $('restName').value.trim(),

      address: $('restAddress').value.trim(),

      city: $('restCity').value.trim(),

      phone: $('restPhone').value.trim(),

      hours: hoursData.summary,

      hoursSchedule: hoursData.schedule,

      description: $('restDesc').value.trim(),

      location: restaurantLocation || existing.location

    }

  });

}



function validateStep(step) {

  if (step === 1) return true;

  if (step === 2) {

    const existingAccount = AurestoStore.load().account || {};

    const isGoogleUser = existingAccount.provider === 'google';

    const hasPassword = $('accPassword').value.length >= 6;

    const hasPhone = $('accPhone').value.trim().length > 0;



    if (!$('accName').value || !$('accEmail').value || (!isGoogleUser && (!hasPhone || !hasPassword))) {

      showToast('Remplissez les champs requis pour la création du compte.');

      return false;

    }



    AurestoStore.update({

      account: {

        ...existingAccount,

        name: $('accName').value.trim(),

        email: $('accEmail').value.trim(),

        phone: $('accPhone').value.trim(),

        password: isGoogleUser ? existingAccount.password || '' : $('accPassword').value

      }

    });

    return true;

  }

  if (step === 3) {

    if (!$('restName').value.trim()) {

      showToast('Le nom du restaurant est requis.');

      return false;

    }

    const hoursData = HoursPicker.getData();

    const hasOpenDay = Object.values(hoursData.schedule).some(d => d.open);

    if (!hasOpenDay) {

      showToast('Sélectionnez au moins un jour d\'ouverture.');

      return false;

    }

    saveRestaurant();

    return true;

  }

  if (step === 4) {

    if (!brandingReady) {

      showToast('Importez une image pour générer votre identité visuelle.');

      return false;

    }

    return true;

  }

  if (step === 5) {

    const data = AurestoStore.load();

    if (!data.menu?.menuScanImage && !data.menu?.items?.length) {

      showToast('Importez une photo de votre menu pour continuer.');

      return false;

    }

    ensureMenuItems();

    return true;

  }

  if (step === 6) {

    const data = AurestoStore.load();

    if (!data.menu.items.length) {

      showToast('Aucun plat détecté. Rescannez votre menu.');

      return false;

    }

    return true;

  }

  if (step === 7) {

    const data = AurestoStore.load();

    if (!data.tables.length) {

      showToast('Créez au moins une table.');

      return false;

    }

    return true;

  }

  return true;

}



function extractColors(img) {

  const canvas = document.createElement('canvas');

  const ctx = canvas.getContext('2d');

  const size = 64;

  canvas.width = size;

  canvas.height = size;

  ctx.drawImage(img, 0, 0, size, size);

  const pixels = ctx.getImageData(0, 0, size, size).data;

  const buckets = {};

  for (let i = 0; i < pixels.length; i += 16) {

    const r = Math.round(pixels[i] / 32) * 32;

    const g = Math.round(pixels[i + 1] / 32) * 32;

    const b = Math.round(pixels[i + 2] / 32) * 32;

    const key = `${r},${g},${b}`;

    buckets[key] = (buckets[key] || 0) + 1;

  }

  const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const toHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

  const colors = sorted.map(([k]) => {

    const [r, g, b] = k.split(',').map(Number);

    return toHex(r, g, b);

  });

  return {

    primary: colors[0] || '#124d58',

    secondary: colors[1] || '#0a566c',

    accent: colors[2] || '#e8a878'

  };

}



async function processImage(file) {

  const processing = $('aiProcessing');

  const status = $('aiStatus');

  processing.classList.add('show');

  for (const msg of AI_STEPS) {

    status.textContent = msg;

    await new Promise(r => setTimeout(r, 600));

  }

  const dataUrl = await new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = e => resolve(e.target.result);

    reader.onerror = reject;

    reader.readAsDataURL(file);

  });

  const img = new Image();

  await new Promise((resolve, reject) => {

    img.onload = resolve;

    img.onerror = reject;

    img.src = dataUrl;

  });

  const colors = extractColors(img);

  const branding = { logo: dataUrl, colors };

  AurestoStore.update({ branding });

  processing.classList.remove('show');

  brandingReady = true;

  showBrandingResult(branding);

  showToast('Identité visuelle générée avec succès !');

}



function ensureMenuItems() {

  const data = AurestoStore.load();

  if (data.menu.items.length) return;

  const fallback = MenuAI.mergeWithFallback([]).map(item => ({

    ...item,

    photo: MenuAI.generateFoodPlaceholder(item.name),

    available: true

  }));

  const categories = [...new Set(fallback.map(i => i.category))];

  AurestoStore.setMenu(fallback, categories);

  if (data.menu.menuScanImage) {

    const d = AurestoStore.load();

    d.menu.menuScanImage = data.menu.menuScanImage;

    AurestoStore.save(d);

  }

  menuScanned = true;

}



function updateGeoStatus(message, style = 'default') {

  const status = $('geoStatus');

  const statusText = $('geoStatusText');

  const statusDot = $('geoStatusDot');

  if (!status || !statusText || !statusDot) return;



  if (!message) {

    if (restaurantLocation) {

      statusText.textContent = 'Position détectée avec succès';

      statusDot.className = 'geo-status-dot success';

      status.hidden = false;

      return;

    }

    statusText.textContent = 'Autorisez l\'accès à la position GPS pour enregistrer la localisation précise.';

    statusDot.className = 'geo-status-dot';

    status.hidden = true;

    return;

  }



  status.hidden = false;

  statusText.textContent = message;

  if (style === 'error') {

    statusDot.className = 'geo-status-dot error';

  } else {

    statusDot.className = 'geo-status-dot pulse';

  }

}



async function reverseGeocode(coords) {

  try {

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&zoom=18&addressdetails=1`;

    const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } });

    if (!res.ok) throw new Error('Reverse geocoding failed');

    const data = await res.json();

    return data.display_name || '';

  } catch (err) {

    console.warn('Reverse geocoding error:', err);

    return '';

  }

}



async function requestRestaurantLocation() {

  const gpsButton = $('geoLocateBtn');

  if (!navigator.geolocation) {

    updateGeoStatus('Géolocalisation non supportée par votre navigateur.', 'error');

    return;

  }



  gpsButton?.classList.add('loading');

  updateGeoStatus('Recherche de votre position…');



  navigator.geolocation.getCurrentPosition(async position => {

    restaurantLocation = {

      latitude: position.coords.latitude,

      longitude: position.coords.longitude

    };

    const address = await reverseGeocode(restaurantLocation);

    if (address) {

      $('restAddress').value = address;

    }

    updateGeoStatus();

    gpsButton?.classList.remove('loading');

  }, error => {

    updateGeoStatus('Impossible de récupérer votre position', 'error');

    gpsButton?.classList.remove('loading');

  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });

}



function bindAddressField() {

  const addressGroup = $('addressInputGroup');

  const addressInput = $('restAddress');

  if (!addressGroup || !addressInput) return;



  addressInput.addEventListener('focus', () => addressGroup.classList.add('focused'));

  addressInput.addEventListener('blur', () => addressGroup.classList.remove('focused'));

}



window.addEventListener('DOMContentLoaded', bindAddressField);



function setNextButtonState() {

  const btn = $('nextBtn');

  if (currentStep !== 5) {

    btn.disabled = false;

    btn.textContent = currentStep === 8 ? 'Accéder au dashboard →' : 'Continuer →';

    return;

  }

  const data = AurestoStore.load();

  if (menuScanInProgress && data.menu?.menuScanImage) {

    btn.disabled = false;

    btn.textContent = 'Continuer →';

  } else if (menuScanInProgress) {

    btn.disabled = true;

    btn.textContent = 'Analyse en cours…';

  } else if (data.menu?.menuScanImage || data.menu?.items?.length) {

    btn.disabled = false;

    btn.textContent = 'Continuer →';

  } else {

    btn.disabled = false;

    btn.textContent = 'Continuer →';

  }

}



async function processMenuScan(file) {

  const processing = $('menuAiProcessing');

  const status = $('menuAiStatus');

  menuScanInProgress = true;

  setNextButtonState();



  const previewUrl = await MenuAI.readFile(file);

  $('menuScanPreview').hidden = false;

  $('menuScanImage').src = previewUrl;



  const data = AurestoStore.load();

  data.menu.menuScanImage = previewUrl;

  AurestoStore.save(data);

  menuScanned = true;

  $('menuScanCount').textContent = 'Image enregistrée · analyse IA en cours…';



  processing.classList.add('show');

  status.textContent = 'Analyse en cours…';

  $('menuScanZone').style.pointerEvents = 'none';

  $('menuScanZone').style.opacity = '0.5';



  try {

    const result = await MenuAI.scanMenuImage(file, msg => { status.textContent = msg; });

    AurestoStore.setMenu(result.items, result.categories);

    const saved = AurestoStore.load();

    saved.menu.menuScanImage = result.sourceImage;

    AurestoStore.save(saved);



    menuScanned = true;

    $('menuScanCount').textContent = `${result.items.length} plats détectés automatiquement`;

    showToast(`${result.items.length} plats ajoutés — vous pouvez continuer !`);

    // If items were detected, mark onboarding complete and go to dashboard

    if (result.items && result.items.length > 0) {

      const state = AurestoStore.load();

      state.onboardingComplete = true;

      AurestoStore.save(state);

      showToast('Onboarding terminé — redirection vers le dashboard...');

      setTimeout(() => { location.href = 'dashboard.html'; }, 900);

      return;

    }

  } catch (err) {

    console.error('Erreur scan menu:', err);

    ensureMenuItems();

    const count = AurestoStore.load().menu.items.length;

    $('menuScanCount').textContent = `${count} plats prêts · OCR partiel`;

    showToast('Menu prêt. Ajustez les plats à l\'étape suivante si besoin.');

  } finally {

    menuScanInProgress = false;

    processing.classList.remove('show');

    $('menuScanZone').style.pointerEvents = '';

    $('menuScanZone').style.opacity = '';

    $('menuScanInput').value = '';

    setNextButtonState();

  }

}



function showBrandingResult(branding) {

  $('brandingResult').classList.add('show');

  $('logoRound').src = branding.logo;

  $('logoSquare').src = branding.logo;

  $('previewLogo').src = branding.logo;

  $('previewName').textContent = AurestoStore.load().restaurant?.name || 'Mon restaurant';

  $('colorPrimary').value = branding.colors.primary;

  $('colorSecondary').value = branding.colors.secondary;

  $('colorAccent').value = branding.colors.accent;

  $('swatchPrimary').style.background = branding.colors.primary;

  $('swatchSecondary').style.background = branding.colors.secondary;

  $('swatchAccent').style.background = branding.colors.accent;

  updateMenuPreview();

}



function updateMenuPreview() {

  const data = AurestoStore.load();

  const c = data.branding?.colors || {};

  const preview = $('menuPreview');

  preview.style.borderColor = c.accent || '#e8a878';

  preview.querySelector('.menu-preview-header').style.borderBottomColor = c.primary || '#124d58';

  preview.querySelectorAll('.menu-preview-item span:last-child').forEach(el => {

    el.style.color = c.accent || '#e8a878';

  });

}



function saveBrandingColors() {

  const data = AurestoStore.load();

  data.branding.colors = {

    primary: $('colorPrimary').value,

    secondary: $('colorSecondary').value,

    accent: $('colorAccent').value

  };

  AurestoStore.save(data);

  $('swatchPrimary').style.background = data.branding.colors.primary;

  $('swatchSecondary').style.background = data.branding.colors.secondary;

  $('swatchAccent').style.background = data.branding.colors.accent;

  updateMenuPreview();

}



function renderCategories(categories) {

  const container = $('categoryTags');

  if (!container) return;

  container.innerHTML = categories.length

    ? categories.map(cat => `<span class="category-tag">${cat}</span>`).join('')

    : '';

}



function renderDishes() {

  const data = AurestoStore.load();

  const list = $('dishList');

  if (!list) return;

  list.innerHTML = data.menu.items.length

    ? data.menu.items.map(item => `

      <div class="dish-item">

        <img src="${item.photo}" alt="" />

        <div><strong>${item.name}</strong><small>${item.category} · ${item.available ? 'Disponible' : 'Indisponible'}${item.description ? ' · ' + item.description : ''}</small></div>

        <span class="price">${Number(item.price).toLocaleString('fr-FR')} FCFA</span>

        <button type="button" data-remove="${item.id}">✕</button>

      </div>

    `).join('')

    : '<p style="color:rgba(255,255,255,.5);font-size:12px">Aucun plat. Scannez votre menu à l\'étape précédente.</p>';



  list.querySelectorAll('[data-remove]').forEach(btn => {

    btn.addEventListener('click', () => {

      AurestoStore.removeMenuItem(btn.dataset.remove);

      const d = AurestoStore.load();

      if (!d.menu.items.length) menuScanned = false;

      d.menu.categories = [...new Set(d.menu.items.map(i => i.category))];

      AurestoStore.save(d);

      renderCategories(d.menu.categories);

      renderDishes();

    });

  });

}



function renderTables() {

  const data = AurestoStore.load();

  const list = $('tableList');

  list.innerHTML = data.tables.map(t => `

    <div class="table-row" data-id="${t.id}">

      <input type="text" value="${t.name}" data-table-name="${t.id}" placeholder="Table 1" />

      <div class="qr-preview" data-qr="${t.id}"></div>

      <button type="button" class="btn btn-ghost" data-remove-table="${t.id}" style="padding:8px">✕</button>

    </div>

  `).join('') || '<p style="color:rgba(255,255,255,.5);font-size:12px">Aucune table. Ajoutez-en une ci-dessus.</p>';



  data.tables.forEach(t => {

    const el = list.querySelector(`[data-qr="${t.id}"]`);

    if (el) {

      QRCode.toCanvas(document.createElement('canvas'), AurestoStore.getTableUrl(t.id), { width: 72, margin: 1 }, (err, canvas) => {

        if (!err) { el.innerHTML = ''; el.appendChild(canvas); }

      });

    }

  });



  list.querySelectorAll('[data-remove-table]').forEach(btn => {

    btn.addEventListener('click', () => {

      AurestoStore.removeTable(btn.dataset.removeTable);

      renderTables();

      renderQrPrint();

    });

  });

  list.querySelectorAll('[data-table-name]').forEach(input => {

    input.addEventListener('change', () => {

      const d = AurestoStore.load();

      const table = d.tables.find(t => t.id === input.dataset.tableName);

      if (table) { table.name = input.value; AurestoStore.save(d); renderQrPrint(); }

    });

  });

}



function addTable(name) {

  AurestoStore.addTable(name);

  renderTables();

}



function renderQrConfigForm() {

  const data = AurestoStore.load();

  $('qrHeaderTemplate').value = data.qrConfig.headerTemplate || 'Table {name}';

  $('qrFooterText').value = data.qrConfig.footerText || 'Scannez pour commander';

  document.querySelectorAll('.print-option').forEach(el => {

    el.classList.toggle('selected', el.dataset.format === data.qrConfig.printLayout);

  });

}



function applyQrConfig() {

  const header = $('qrHeaderTemplate').value.trim() || 'Table {name}';

  const footer = $('qrFooterText').value.trim() || 'Scannez pour commander';

  AurestoStore.updateQrConfig({ headerTemplate: header, footerText: footer, printLayout: printFormat });

}



function setPrintLayout(layout) {

  printFormat = layout;

  AurestoStore.updateQrConfig({ printLayout: layout });

}



function formatHeader(template, table) {

  return template.replace('{name}', table.name || 'Table');

}



function renderQrPrint() {

  const data = AurestoStore.load();

  const grid = $('qrPrintGrid');

  grid.innerHTML = '';

  data.tables.forEach(t => {

    const card = document.createElement('div');

    card.className = 'qr-print-card';

    card.innerHTML = `<strong>${formatHeader(data.qrConfig.headerTemplate, t)}</strong><small>${data.restaurant.name}</small><div class="qr-card-qr"></div><p>${data.qrConfig.footerText}</p>`;

    const canvasWrap = card.querySelector('.qr-card-qr');

    grid.appendChild(card);

    QRCode.toCanvas(canvasWrap, AurestoStore.getTableUrl(t.id), { width: 100, margin: 1 });

  });

}



async function downloadPdf() {

  applyQrConfig();

  const { jsPDF } = window.jspdf;

  const data = AurestoStore.load();

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const formatLabels = { chevalet: 'Chevalet de table', autocollant: 'Autocollant', affiche: 'Affiche' };

  doc.setFontSize(16);

  doc.text(data.restaurant.name || 'Auresto', 105, 20, { align: 'center' });

  doc.setFontSize(10);

  doc.text(`${formatLabels[data.qrConfig.printLayout] || 'QR Codes'}`, 105, 28, { align: 'center' });

  let y = 38;

  for (const table of data.tables) {

    const canvas = document.createElement('canvas');

    await new Promise(resolve => {

      QRCode.toCanvas(canvas, AurestoStore.getTableUrl(table.id), { width: 120, margin: 1 }, resolve);

    });

    const imgData = canvas.toDataURL('image/png');

    if (y > 250) { doc.addPage(); y = 20; }

    doc.addImage(imgData, 'PNG', 20, y, 45, 45);

    doc.setFontSize(12);

    doc.text(formatHeader(data.qrConfig.headerTemplate, table), 70, y + 12);

    doc.setFontSize(9);

    doc.text(data.qrConfig.footerText, 70, y + 22);

    y += 60;

  }

  doc.save(`auresto-qr-${data.restaurant.name || 'restaurant'}.pdf`);

  showToast('PDF téléchargé !');

}



async function downloadWord() {

  applyQrConfig();

  const data = AurestoStore.load();

  const rows = await Promise.all(data.tables.map(async table => {

    const canvas = document.createElement('canvas');

    await new Promise(resolve => {

      QRCode.toCanvas(canvas, AurestoStore.getTableUrl(table.id), { width: 200, margin: 1 }, resolve);

    });

    const imgData = canvas.toDataURL('image/png');

    return `

      <div style="margin-bottom:30px;padding:16px;border:1px solid #ddd;border-radius:14px;max-width:480px;">

        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${formatHeader(data.qrConfig.headerTemplate, table)}</div>

        <div style="font-size:13px;color:#555;margin-bottom:10px;">${data.restaurant.name}</div>

        <img src="${imgData}" style="width:200px;height:200px;object-fit:contain;margin-bottom:10px;" />

        <div style="font-size:12px;color:#444;">${data.qrConfig.footerText}</div>

      </div>

    `;

  }));



  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>QR Codes Auresto</title></head><body>${rows.join('')}</body></html>`;

  const blob = new Blob([html], { type: 'application/msword' });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;

  a.download = `auresto-qr-${data.restaurant.name || 'restaurant'}.doc`;

  document.body.appendChild(a);

  a.click();

  a.remove();

  URL.revokeObjectURL(url);

  showToast('Fichier Word téléchargé !');

}



function finishOnboarding() {

  AurestoStore.update({

    onboardingComplete: true,

    onboardingStep: 8,

    createdAt: new Date().toISOString()

  });

  showToast('Bienvenue sur Auresto !');

  setTimeout(() => { location.href = 'dashboard.html'; }, 800);

}



document.querySelectorAll('.plan-option').forEach(el => {

  el.addEventListener('click', () => {

    document.querySelectorAll('.plan-option').forEach(p => p.classList.remove('selected'));

    el.classList.add('selected');

    selectedPlan = el.dataset.plan;

    AurestoStore.update({ plan: selectedPlan });

  });

});



document.querySelectorAll('[data-upload]').forEach(input => {

  input.addEventListener('change', e => {

    const file = e.target.files[0];

    if (file) processImage(file);

  });

});



['colorPrimary', 'colorSecondary', 'colorAccent'].forEach(id => {

  $(id).addEventListener('input', saveBrandingColors);

});



$('menuScanInput').addEventListener('change', e => {

  const file = e.target.files[0];

  if (file) processMenuScan(file);

});



$('geoLocateBtn')?.addEventListener('click', requestRestaurantLocation);

$('rescanMenuBtn').addEventListener('click', () => goToStep(5));



$('addTableBtn').addEventListener('click', () => {

  const data = AurestoStore.load();

  addTable(`Table ${data.tables.length + 1}`);

});

$('addBulkTablesBtn').addEventListener('click', () => {

  const data = AurestoStore.load();

  const start = data.tables.length + 1;

  for (let i = 0; i < 5; i++) addTable(`Table ${start + i}`);

});



document.querySelectorAll('.print-option').forEach(el => {

  el.addEventListener('click', () => {

    document.querySelectorAll('.print-option').forEach(p => p.classList.remove('selected'));

    el.classList.add('selected');

    setPrintLayout(el.dataset.format);

    renderQrPrint();

  });

});



$('downloadPdfBtn').addEventListener('click', downloadPdf);

$('downloadWordBtn').addEventListener('click', downloadWord);

$('finishBtn').addEventListener('click', finishOnboarding);



$('qrHeaderTemplate').addEventListener('change', applyQrConfig);

$('qrFooterText').addEventListener('change', applyQrConfig);



$('prevBtn').addEventListener('click', () => {

  if (currentStep > 1) goToStep(currentStep - 1);

});



$('nextBtn').addEventListener('click', () => {

  if (!validateStep(currentStep)) return;

  if (currentStep === 1) AurestoStore.update({ plan: selectedPlan });

  if (currentStep < 8) goToStep(currentStep + 1);

  else finishOnboarding();

});



loadState();

document.querySelector(`.plan-option[data-plan="${selectedPlan}"]`)?.classList.add('selected');

goToStep(currentStep);

