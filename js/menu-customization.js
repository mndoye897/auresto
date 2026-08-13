const MENU_CUSTOMIZATION_PREVIEW_KEY = 'auresto_menu_customization_preview';

let currentData;
let draft;
let draggedCategory = null;
let previewTimer = null;
let livePersistTimer = null;
let liveSyncTimer = null;
let previewStarted = false;
const liveDesignChannel = 'BroadcastChannel' in window ? new BroadcastChannel('auresto-menu-design') : null;

const $ = selector => document.querySelector(selector);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isGoldPlan(data) {
  const plan = data?.plan || data?.restaurant?.subscription_plan || data?.restaurant?.plan || '';
  return String(plan).toLowerCase() === 'gold';
}

function renderSidebarPlan(data) {
  const isGold = isGoldPlan(data);
  const rawPlan = data?.plan || data?.restaurant?.subscription_plan || data?.restaurant?.plan || 'Free';
  const planName = isGold ? 'Gold' : rawPlan;

  const logoBadge = document.querySelector('.mc-sidebar-header .mc-gold-badge');
  if (logoBadge) {
    logoBadge.textContent = planName;
    logoBadge.style.display = isGold ? 'inline-block' : 'none';
  }

  const badgeLg = $('#mcSidebarPlanBadge');
  if (badgeLg) {
    badgeLg.textContent = isGold ? '👑 Gold' : `👑 ${planName}`;
    badgeLg.className = isGold ? 'mc-gold-badge-lg' : 'mc-free-badge-lg';
  }

  const statusEl = $('#mcSidebarPlanStatus');
  if (statusEl) {
    statusEl.textContent = isGold ? 'Actif' : 'Gratuit';
    statusEl.className = isGold ? 'mc-status-active' : 'mc-status-inactive';
  }

  const subEl = $('#mcSidebarPlanSub');
  if (subEl) {
    subEl.textContent = isGold ? 'Design du menu client inclus' : 'Réservé aux membres Gold';
  }

  const btnEl = $('#mcSidebarPlanBtn');
  if (btnEl) {
    btnEl.textContent = isGold ? 'Gérer mon abonnement' : 'Passer au plan Gold';
    btnEl.href = isGold ? 'dashboard.html#subscriptionPanel' : 'onboarding.html?plan=Gold&redirect=menu-customization.html';
  }

  const accountPlanEl = $('#mcSidebarAccountPlan');
  if (accountPlanEl) {
    accountPlanEl.textContent = `Compte ${planName}`;
  }
}

function normalizedDraft(source) {
  const defaults = {
    template: 'midnight',
    background: 'gradient', backgroundImage: '', overlay: 60,
    gradient: { colors: ['#071820', '#124d58'], from: '#071820', to: '#124d58', angle: 135 },
    colors: { primary: '#124d58', secondary: '#0a566c', accent: '#e8a878', text: '#f3ede4', muted: '#b8b2aa', surface: '#17140f' },
    layout: 'cards', radius: 18, spacing: 16,
    logo: { shape: 'circle', position: 'center', size: 44 },
    display: { images: true, descriptions: true, prices: true, badges: true, favorites: true },
    tapEffect: 'elevate', categoryOrder: []
  };
  const sourceData = source || {};
  const sourceGradient = sourceData.gradient || {};
  // Migrate old format (from/to) to new colors array format
  let gradientColors = Array.isArray(sourceGradient.colors) && sourceGradient.colors.length >= 2
    ? sourceGradient.colors
    : [sourceGradient.from || '#071820', sourceGradient.to || '#124d58'];
  return {
    ...defaults,
    ...sourceData,
    colors: { ...defaults.colors, ...(sourceData.colors || {}) },
    gradient: {
      ...defaults.gradient,
      ...sourceGradient,
      colors: gradientColors,
      from: gradientColors[0],
      to: gradientColors[gradientColors.length - 1]
    },
    display: { ...defaults.display, ...(sourceData.display || {}) },
    logo: { ...defaults.logo, ...(sourceData.logo || {}) },
    categoryOrder: Array.isArray(sourceData.categoryOrder) ? sourceData.categoryOrder : []
  };
}

const BACKGROUND_PRESETS = {
  gradient: ['#071820', '#124d58'],
  solid: ['#17140f'],
  wood: ['#4d2511', '#7c4321'],
  marble: ['#08090b', '#66706c', '#15171a'],
  dark: ['#0a0a0a', '#1a1a1a', '#2d2d2d'],
  light: ['#f8fafc', '#e2e8f0', '#cbd5e1'],
  tropical: ['#0f766e', '#14b8a6', '#84cc16'],
  ocean: ['#0c4a6e', '#0369a1', '#38bdf8'],
  sunset: ['#7c2d12', '#ea580c', '#fbbf24'],
  forest: ['#14532d', '#166534', '#4d7c0f'],
  royal: ['#1e1b4b', '#4338ca', '#7c3aed'],
  rose: ['#881337', '#be123c', '#fb7185']
};

const TEMPLATE_PRESETS = {
  midnight: {
    background: 'gradient', gradient: { from: '#071820', to: '#241115', angle: 135 },
    colors: { primary: '#e33c3f', secondary: '#8d272c', accent: '#f4bf3b', text: '#f8f1ec', muted: '#b9aaa2', surface: '#171415' },
    layout: 'cards', radius: 18
  },
  classic: {
    background: 'solid', gradient: { from: '#f7f1e8', to: '#e8d7c2', angle: 135 },
    colors: { primary: '#b74335', secondary: '#d6805c', accent: '#c99a48', text: '#2e2724', muted: '#786c64', surface: '#fffaf4' },
    layout: 'cards', radius: 14
  },
  elegant: {
    background: 'gradient', gradient: { from: '#0c181b', to: '#26383b', angle: 140 },
    colors: { primary: '#c38a3c', secondary: '#7c6956', accent: '#e9bd68', text: '#f4eee4', muted: '#a9aaa2', surface: '#172224' },
    layout: 'cards', radius: 12
  },
  minimal: {
    background: 'solid', gradient: { from: '#ede9e2', to: '#d8d3cc', angle: 135 },
    colors: { primary: '#3a3936', secondary: '#6f6a63', accent: '#a87c52', text: '#252321', muted: '#74716b', surface: '#fffdf8' },
    layout: 'separated', radius: 8
  },
  vibrant: {
    background: 'gradient', gradient: { from: '#ef639f', to: '#f6b343', angle: 135 },
    colors: { primary: '#8c2875', secondary: '#e3688f', accent: '#fff1a8', text: '#fff7ef', muted: '#ffe0d8', surface: '#8f386d' },
    layout: 'vertical', radius: 20
  },
  premium: {
    background: 'gradient', gradient: { from: '#090d0e', to: '#393016', angle: 145 },
    colors: { primary: '#d3ab48', secondary: '#806a35', accent: '#f0d374', text: '#fff7dc', muted: '#c2b895', surface: '#171816' },
    layout: 'cards', radius: 16
  }
};

function applyTemplate(template) {
  const preset = TEMPLATE_PRESETS[template];
  if (!preset) return;
  draft.template = template;
  draft.background = preset.background;
  const presetGradient = preset.gradient || {};
  const presetColors = Array.isArray(presetGradient.colors) && presetGradient.colors.length >= 2
    ? presetGradient.colors
    : [presetGradient.from || '#071820', presetGradient.to || '#124d58'];
  draft.gradient = {
    ...draft.gradient,
    ...presetGradient,
    colors: presetColors,
    from: presetColors[0],
    to: presetColors[presetColors.length - 1]
  };
  draft.colors = { ...draft.colors, ...preset.colors };
  draft.layout = preset.layout;
  draft.radius = preset.radius;
}

function getOrderedCategories() {
  const categories = Array.isArray(currentData?.menu?.categories) ? currentData.menu.categories : [];
  const saved = draft.categoryOrder.filter(category => categories.includes(category));
  return [...saved, ...categories.filter(category => !saved.includes(category))];
}

function showToast(message) {
  const toast = $('#customizerToast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function setLiveSaveStatus(message, state = '') {
  const status = $('#liveSaveStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function persistLiveCustomization() {
  const state = AurestoStore.load();
  state.menuCustomization = clone(draft);
  AurestoStore.save(state, { sync: false });
  currentData = state;
  liveDesignChannel?.postMessage({ type: 'menu-design-update', customization: clone(draft) });
  setLiveSaveStatus('Modifications enregistrées automatiquement', 'saved');
}

function scheduleLiveSave() {
  window.clearTimeout(livePersistTimer);
  window.clearTimeout(liveSyncTimer);
  setLiveSaveStatus('Enregistrement…', 'saving');

  livePersistTimer = window.setTimeout(persistLiveCustomization, 140);
  liveSyncTimer = window.setTimeout(async () => {
    persistLiveCustomization();
    const result = await AurestoStore.syncToServer();
    setLiveSaveStatus(
      result.success ? 'Synchronisé avec le menu client' : 'Enregistré sur cet appareil',
      result.success ? 'synced' : 'saved'
    );
  }, 1100);
}

function renderGradientColors() {
  const list = $('#gradientColorsList');
  if (!list) return;
  list.replaceChildren();
  const colors = Array.isArray(draft.gradient.colors) && draft.gradient.colors.length >= 1 ? draft.gradient.colors : ['#071820', '#124d58'];
  draft.gradient.colors = colors;
  draft.gradient.from = colors[0];
  draft.gradient.to = colors[colors.length - 1];

  colors.forEach((color, index) => {
    const row = document.createElement('div');
    row.className = 'gradient-color-row';
    row.innerHTML = `
      <span class="gradient-color-index">${index + 1}</span>
      <input type="color" class="gradient-color-input" data-gradient-index="${index}" value="${color}" />
      <output class="gradient-color-value" data-gradient-color-value="${index}">${color}</output>
      ${colors.length > 1 ? `<button type="button" class="remove-color-btn" data-remove-gradient="${index}" aria-label="Supprimer cette couleur">×</button>` : ''}
    `;
    list.append(row);
  });

  list.querySelectorAll('.gradient-color-input').forEach(input => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.gradientIndex);
      draft.gradient.colors[index] = input.value;
      draft.gradient.from = draft.gradient.colors[0];
      draft.gradient.to = draft.gradient.colors[draft.gradient.colors.length - 1];
      document.querySelector(`[data-gradient-color-value="${index}"]`).textContent = input.value;
      updatePreview();
    });
  });

  list.querySelectorAll('.remove-color-btn').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.removeGradient);
      draft.gradient.colors.splice(index, 1);
      if (draft.gradient.colors.length < 1) draft.gradient.colors.push('#124d58');
      draft.gradient.from = draft.gradient.colors[0];
      draft.gradient.to = draft.gradient.colors[draft.gradient.colors.length - 1];
      renderGradientColors();
      updatePreview();
    });
  });
}

function renderControls() {
  document.querySelectorAll('[data-template]').forEach(button => button.classList.toggle('active', button.dataset.template === draft.template));
  document.querySelectorAll('[data-background]').forEach(button => button.classList.toggle('active', button.dataset.background === draft.background));
  document.querySelectorAll('[data-layout]').forEach(button => button.classList.toggle('active', button.dataset.layout === draft.layout));
  document.querySelectorAll('[data-effect]').forEach(button => button.classList.toggle('active', button.dataset.effect === draft.tapEffect));

  document.querySelectorAll('[data-color]').forEach(input => {
    const value = draft.colors[input.dataset.color] || '#000000';
    input.value = value;
    const target = document.querySelector(`[data-color-value="${input.dataset.color}"]`);
    if (target) target.textContent = value;
  });
  document.querySelectorAll('[data-display]').forEach(input => {
    input.checked = draft.display[input.dataset.display] !== false;
  });

  const overlayInput = $('#overlayInput');
  if (overlayInput) overlayInput.value = draft.overlay;
  const overlayValue = $('#overlayValue');
  if (overlayValue) overlayValue.value = `${draft.overlay}%`;

  const radiusInput = $('#radiusInput');
  if (radiusInput) radiusInput.value = draft.radius;
  const radiusValue = $('#radiusValue');
  if (radiusValue) radiusValue.value = `${draft.radius}px`;

  const menuSpacingInput = $('#menuSpacingInput');
  if (menuSpacingInput) menuSpacingInput.value = draft.spacing;
  const overlayValueMirror = $('#overlayValueMirror');
  if (overlayValueMirror) overlayValueMirror.value = `${draft.spacing}px`;

  const gradientAngleInput = $('#gradientAngleInput');
  if (gradientAngleInput) gradientAngleInput.value = draft.gradient.angle;
  const gradientAngleValue = $('#gradientAngleValue');
  if (gradientAngleValue) gradientAngleValue.value = `${draft.gradient.angle}°`;

  const logoSizeInput = $('#logoSizeInput');
  if (logoSizeInput) logoSizeInput.value = draft.logo.size;
  const logoSizeValue = $('#logoSizeValue');
  if (logoSizeValue) logoSizeValue.value = `${draft.logo.size}px`;

  document.querySelectorAll('[data-logo-shape]').forEach(button => button.classList.toggle('active', button.dataset.logoShape === draft.logo.shape));
  document.querySelectorAll('[data-logo-position]').forEach(button => button.classList.toggle('active', button.dataset.logoPosition === draft.logo.position));

  const removeBgBtn = $('#removeBackgroundImageBtn');
  if (removeBgBtn) removeBgBtn.hidden = !draft.backgroundImage;

  renderGradientColors();
  renderCategoryOrder();
}

function renderCategoryOrder() {
  const list = $('#categoryOrderList');
  if (!list) return;
  list.replaceChildren();
  const categories = getOrderedCategories();
  draft.categoryOrder = categories;

  if (!categories.length) {
    const empty = document.createElement('p');
    empty.className = 'category-order-empty';
    empty.textContent = 'Ajoutez des catégories dans le dashboard pour les organiser ici.';
    list.append(empty);
    return;
  }

  categories.forEach(category => {
    const item = document.createElement('div');
    item.className = 'category-order-item';
    item.draggable = true;
    item.dataset.category = category;
    item.innerHTML = '<span class="drag-handle" aria-hidden="true">⠿</span>';
    const name = document.createElement('span');
    name.textContent = category;
    item.append(name);
    item.addEventListener('dragstart', () => {
      draggedCategory = category;
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      draggedCategory = null;
      item.classList.remove('dragging');
      document.querySelectorAll('.category-order-item').forEach(el => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', event => {
      event.preventDefault();
      if (draggedCategory && draggedCategory !== category) item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', event => {
      event.preventDefault();
      item.classList.remove('drag-over');
      moveCategory(draggedCategory, category);
    });
    list.append(item);
  });
}

function moveCategory(source, target) {
  if (!source || source === target) return;
  const categories = getOrderedCategories();
  const sourceIndex = categories.indexOf(source);
  const targetIndex = categories.indexOf(target);
  categories.splice(sourceIndex, 1);
  categories.splice(targetIndex, 0, source);
  draft.categoryOrder = categories;
  renderCategoryOrder();
  updatePreview();
}

function sendPreviewUpdate() {
  const preview = $('#clientPreview');
  if (!preview?.contentWindow || !draft) return;

  preview.contentWindow.postMessage({
    type: 'auresto-preview:update',
    customization: clone(draft)
  }, window.location.origin === 'null' ? '*' : window.location.origin);
}

function updatePreview({ persist = true } = {}) {
  sessionStorage.setItem(MENU_CUSTOMIZATION_PREVIEW_KEY, JSON.stringify(draft));
  liveDesignChannel?.postMessage({ type: 'menu-design-update', customization: clone(draft) });
  sendPreviewUpdate();
  if (persist) scheduleLiveSave();

  if (!previewStarted) {
    previewStarted = true;
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      const previewEl = $('#clientPreview');
      if (previewEl) previewEl.src = `client.html?preview=1&v=${Date.now()}`;
    }, 80);
  }
}

function compressImage(file, maxDim = 1920, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

let controlsBound = false;

function bindControls() {
  if (controlsBound) return;
  controlsBound = true;

  $('#clientPreview')?.addEventListener('load', sendPreviewUpdate);

  document.querySelectorAll('.device-switch [data-preview-device]').forEach(button => button.addEventListener('click', () => {
    const device = button.dataset.previewDevice;
    const panel = $('.preview-panel');
    if (panel) panel.dataset.previewDevice = device;
    document.querySelectorAll('.device-switch [data-preview-device]').forEach(item => {
      const isActive = item === button;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    });
  }));

  document.querySelectorAll('[data-template]').forEach(button => button.addEventListener('click', () => {
    applyTemplate(button.dataset.template);
    renderControls();
    updatePreview();
    showToast(`Modèle « ${button.textContent.trim().replace(/Modèle actuel/, '').trim()} » appliqué.`);
  }));

  document.querySelectorAll('[data-background]').forEach(button => button.addEventListener('click', () => {
    const backgroundKey = button.dataset.background;
    draft.background = backgroundKey;
    const presetColors = BACKGROUND_PRESETS[backgroundKey];
    if (presetColors && Array.isArray(presetColors)) {
      draft.gradient.colors = [...presetColors];
      draft.gradient.from = presetColors[0];
      draft.gradient.to = presetColors[presetColors.length - 1];
    }
    renderControls();
    updatePreview();
  }));

  document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => {
    draft.layout = button.dataset.layout;
    renderControls();
    updatePreview();
  }));

  document.querySelectorAll('[data-effect]').forEach(button => button.addEventListener('click', () => {
    draft.tapEffect = button.dataset.effect;
    renderControls();
    updatePreview();
  }));

  document.querySelectorAll('[data-color]').forEach(input => input.addEventListener('input', () => {
    draft.colors[input.dataset.color] = input.value;
    const target = document.querySelector(`[data-color-value="${input.dataset.color}"]`);
    if (target) target.textContent = input.value;
    updatePreview();
  }));

  document.querySelectorAll('[data-gradient]').forEach(input => input.addEventListener('input', () => {
    draft.gradient[input.dataset.gradient] = input.value;
    const target = document.querySelector(`[data-gradient-value="${input.dataset.gradient}"]`);
    if (target) target.textContent = input.value;
    updatePreview();
  }));

  document.querySelectorAll('[data-display]').forEach(input => input.addEventListener('change', () => {
    draft.display[input.dataset.display] = input.checked;
    updatePreview();
  }));

  $('#overlayInput')?.addEventListener('input', event => {
    draft.overlay = Number(event.target.value);
    const el = $('#overlayValue');
    if (el) el.value = `${draft.overlay}%`;
    updatePreview();
  });

  $('#radiusInput')?.addEventListener('input', event => {
    draft.radius = Number(event.target.value);
    const el = $('#radiusValue');
    if (el) el.value = `${draft.radius}px`;
    updatePreview();
  });

  $('#menuSpacingInput')?.addEventListener('input', event => {
    draft.spacing = Number(event.target.value);
    const el = $('#overlayValueMirror');
    if (el) el.value = `${draft.spacing}px`;
    updatePreview();
  });

  $('#gradientAngleInput')?.addEventListener('input', event => {
    draft.gradient.angle = Number(event.target.value);
    const el = $('#gradientAngleValue');
    if (el) el.value = `${draft.gradient.angle}°`;
    updatePreview();
  });

  $('#addGradientColorBtn')?.addEventListener('click', () => {
    if (draft.gradient.colors.length >= 8) {
      showToast('Maximum 8 couleurs pour le dégradé.');
      return;
    }
    const lastColor = draft.gradient.colors[draft.gradient.colors.length - 1] || '#124d58';
    draft.gradient.colors.push(lastColor);
    draft.gradient.to = lastColor;
    renderGradientColors();
    updatePreview();
  });

  document.querySelectorAll('[data-logo-shape]').forEach(button => button.addEventListener('click', () => {
    draft.logo.shape = button.dataset.logoShape;
    renderControls();
    updatePreview();
  }));

  document.querySelectorAll('[data-logo-position]').forEach(button => button.addEventListener('click', () => {
    draft.logo.position = button.dataset.logoPosition;
    renderControls();
    updatePreview();
  }));

  $('#logoSizeInput')?.addEventListener('input', event => {
    draft.logo.size = Number(event.target.value);
    const el = $('#logoSizeValue');
    if (el) el.value = `${draft.logo.size}px`;
    updatePreview();
  });

  $('#backgroundImageInput')?.addEventListener('change', async event => {
    const [file] = event.target.files;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      event.target.value = '';
      showToast('Choisis une image de 5 Mo maximum pour conserver un aperçu rapide.');
      return;
    }
    try {
      showToast('Optimisation de l’image en cours…');
      const compressedDataUrl = await compressImage(file, 1920, 0.85);
      draft.backgroundImage = compressedDataUrl;
      const removeBtn = $('#removeBackgroundImageBtn');
      if (removeBtn) removeBtn.hidden = false;
      renderControls();
      updatePreview();
      showToast('Image de fond ajoutée à l’aperçu.');
    } catch (err) {
      console.error('Erreur compression image:', err);
      const reader = new FileReader();
      reader.onload = () => {
        draft.backgroundImage = reader.result;
        const removeBtn = $('#removeBackgroundImageBtn');
        if (removeBtn) removeBtn.hidden = false;
        renderControls();
        updatePreview();
        showToast('Image de fond ajoutée à l’aperçu.');
      };
      reader.readAsDataURL(file);
    }
  });

  $('#removeBackgroundImageBtn')?.addEventListener('click', () => {
    draft.backgroundImage = '';
    const input = $('#backgroundImageInput');
    if (input) input.value = '';
    const removeBtn = $('#removeBackgroundImageBtn');
    if (removeBtn) removeBtn.hidden = true;
    renderControls();
    updatePreview();
  });

  $('#saveCustomizationBtn')?.addEventListener('click', () => {
    window.clearTimeout(livePersistTimer);
    window.clearTimeout(liveSyncTimer);
    persistLiveCustomization();
    AurestoStore.syncToServer().then(result => {
      setLiveSaveStatus(
        result.success ? 'Synchronisé avec le menu client' : 'Enregistré sur cet appareil',
        result.success ? 'synced' : 'saved'
      );
    });
    sessionStorage.removeItem(MENU_CUSTOMIZATION_PREVIEW_KEY);
    showToast('Personnalisation Gold enregistrée.');
  });

  $('#openPreviewBtn')?.addEventListener('click', () => window.open('client.html?preview=1', '_blank', 'noopener'));
}

async function init() {
  try {
    await AurestoStore.init();
  } catch (e) {
    console.warn('AurestoStore.init warning:', e);
  }
  currentData = AurestoStore.load();
  renderSidebarPlan(currentData);

  const activateBtn = $('#activateGoldPlanBtn');
  if (activateBtn) {
    activateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      currentData.plan = 'Gold';
      AurestoStore.update({ plan: 'Gold' });
      renderSidebarPlan(currentData);
      const gate = $('#goldGate');
      if (gate) gate.hidden = true;
      const customizer = $('#customizer');
      if (customizer) customizer.hidden = false;
      draft = normalizedDraft(currentData.menuCustomization);
      renderControls();
      bindControls();
      updatePreview({ persist: false });
      showToast('Plan Gold activé ! Bienvenue dans la personnalisation.');
    });
  }

  const customizer = $('#customizer');
  const gate = $('#goldGate');

  // En cas de compte non Gold, afficher le gate
  if (!isGoldPlan(currentData)) {
    if (gate) gate.hidden = false;
    if (customizer) customizer.hidden = true;
    return;
  }

  if (gate) gate.hidden = true;
  if (customizer) customizer.hidden = false;

  draft = normalizedDraft(currentData.menuCustomization);
  renderControls();
  bindControls();
  updatePreview({ persist: false });
}

init().catch(error => {
  console.error('Menu customization initialization failed', error);
  const customizer = $('#customizer');
  const gate = $('#goldGate');
  if (customizer) customizer.hidden = false;
  if (gate) gate.hidden = true;
});

// ============================================================
// Accordéons du panneau + identité du restaurant dans la barre
// latérale (aligné sur l'éditeur de table / QR codes).
// ============================================================
(function initPanelChrome() {
  const ACC_KEY = 'auresto_menu_customization_accordions';

  function setup() {
    let state = {};
    try { state = JSON.parse(localStorage.getItem(ACC_KEY)) || {}; } catch { state = {}; }

    document.querySelectorAll('.mc-accordion').forEach(accordion => {
      const key = accordion.dataset.accordion;
      if (state && key && Object.prototype.hasOwnProperty.call(state, key)) {
        accordion.classList.toggle('open', Boolean(state[key]));
      } else {
        accordion.classList.add('open');
      }
      const trigger = accordion.querySelector('.mc-accordion-trigger');
      if (!trigger) return;
      trigger.addEventListener('click', () => {
        accordion.classList.toggle('open');
        if (key) {
          state[key] = accordion.classList.contains('open');
          try { localStorage.setItem(ACC_KEY, JSON.stringify(state)); } catch { }
        }
      });
    });

    try {
      const data = AurestoStore.load();
      const name = data.restaurant?.name;
      const nameEl = document.getElementById('mcRestaurantName');
      const avatarEl = document.getElementById('mcAvatar');
      if (name && nameEl) nameEl.textContent = name;
      if (name && avatarEl) avatarEl.textContent = name.trim().charAt(0).toUpperCase();
    } catch { }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
