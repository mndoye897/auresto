// ============================================================
// Auresto — Éditeur de table (Table Editor)
// ============================================================

const TE_STORAGE_KEY = 'auresto_table_editor_design';
const TE_TABLES_KEY = 'auresto_table_editor_tables';

// État global
let current = {
  template: 'minimal',
  moduleId: '#E60023',
  bgColor: '#FFFFFF',
  cornerShape: 'square',
  logoEnabled: true,
  logoDataUrl: null,
  logoSize: 20,
  paperColor: '#FFFFFF',
  borderColor: '#E8A878',
  bgOption: 'restaurant',
  restaurantName: 'LE TERAL',
  tagline: 'GRILL & LOUNGE',
  tableLabel: 'TABLE {name}',
  instruction: 'Scannez pour découvrir notre menu',
  footerText: 'Merci et bon appétit !',
  fontFamily: 'DM Sans',
  titleSize: 22,
  textSize: 11,
  textAlign: 'center',
  borderWidth: 2,
  cornerRadius: 8,
  shadow: 20,
  reflection: 0,
  printFormat: 'chevalet',
  printQuality: 'standard',
  margin: 10,
  menuAutoOpen: true,
  menuShowPrices: true,
  menuShowImages: true,
  menuLanguage: 'fr',
  support: 'chevalet',
  zoom: 100,
  lighting: 'day',
  darkMode: false,
  tableCount: 50,
  prefix: 'Table'
};

let tables = [];
let qrCodeInstance = null;
let autoSaveTimer = null;
let toastTimer = null;

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

// ============================================================
// Initialisation
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initTables();
  initQRCode();
  bindEvents();
  loadDefaultLogo();
  updatePreview();
  renderTables();
  updateTableCount();
});

// ============================================================
// État — Sauvegarde / Chargement
// ============================================================
function saveState() {
  try {
    localStorage.setItem(TE_STORAGE_KEY, JSON.stringify(currentState()));
  } catch (e) {
    console.warn('Impossible de sauvegarder l\'état', e);
  }
}

function currentState() {
  return {
    template: current.template,
    moduleId: current.moduleId,
    bgColor: current.bgColor,
    cornerShape: current.cornerShape,
    logoEnabled: current.logoEnabled,
    logoDataUrl: current.logoDataUrl,
    paperColor: current.paperColor,
    borderColor: current.borderColor,
    bgOption: current.bgOption,
    fontFamily: current.fontFamily,
    titleSize: current.titleSize,
    textSize: current.textSize,
    textAlign: current.textAlign,
    borderWidth: current.borderWidth,
    cornerRadius: current.cornerRadius,
    shadow: current.shadow,
    reflection: current.reflection,
    printFormat: current.printFormat,
    printQuality: current.printQuality,
    margin: current.margin,
    menuAutoOpen: current.menuAutoOpen,
    menuShowPrices: current.menuShowPrices,
    menuShowImages: current.menuShowImages,
    menuLanguage: current.menuLanguage,
    support: current.support,
    zoom: current.zoom,
    lighting: current.lighting,
    darkMode: current.darkMode,
    tableCount: current.tableCount,
    prefix: current.prefix
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(TE_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      Object.assign(current, data);
      applyStateToUI();
    }
  } catch (e) {
    console.warn('Impossible de charger l\'état', e);
  }
}

function applyStateToUI() {
  // Couleurs
  $('#moduleColorHex').value = current.moduleId;
  $('#moduleColorInput').value = current.moduleId;
  $('#moduleColorSwatch').style.background = current.moduleId;
  $('#bgColorHex').value = current.bgColor;
  $('#bgColorInput').value = current.bgColor;
  $('#bgColorSwatch').style.background = current.bgColor;
  $('#paperColorHex').value = current.paperColor;
  $('#paperColorInput').value = current.paperColor;
  $('#paperColorSwatch').style.background = current.paperColor;
  $('#borderColorHex').value = current.borderColor;
  $('#borderColorInput').value = current.borderColor;
  $('#borderColorSwatch').style.background = current.borderColor;

  // Forme des coins
  $$('#cornerShapeGroup button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === current.cornerShape);
  });

  // Logo
  $('#logoEnabled').checked = current.logoEnabled;
  $('#logoSizeRange').value = current.logoSize;
  $('#logoSizeVal').textContent = current.logoSize + '%';
  updateLogoControls();

  // Arrière-plan
  $$('#bgOptions .te-bg-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bg === current.bgOption);
  });
  $$('.te-float-bg').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bg === current.bgOption);
  });

  // Textes
  $('#restaurantNameInput').value = current.restaurantName;
  $('#restaurantTaglineInput').value = current.tagline;
  $('#tableLabelInput').value = current.tableLabel;
  $('#instructionTextInput').value = current.instruction;
  $('#footerTextInput').value = current.footerText;
  $('#fontFamilySelect').value = current.fontFamily;
  $('#titleSizeRange').value = current.titleSize;
  $('#titleSizeVal').textContent = current.titleSize + 'px';
  $('#textSizeRange').value = current.textSize;
  $('#textSizeVal').textContent = current.textSize + 'px';

  // Alignement
  $$('#textAlignGroup button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === current.textAlign);
  });

  // Bordures & effets
  $('#borderWidthRange').value = current.borderWidth;
  $('#borderWidthVal').textContent = current.borderWidth + 'px';
  $('#cornerRadiusRange').value = current.cornerRadius;
  $('#cornerRadiusVal').textContent = current.cornerRadius + 'px';
  $('#shadowRange').value = current.shadow;
  $('#shadowVal').textContent = current.shadow + 'px';
  $('#reflectionRange').value = current.reflection;
  $('#reflectionVal').textContent = current.reflection + '%';

  // Format
  $('#printFormatSelect').value = current.printFormat;
  $('#printQualitySelect').value = current.printQuality;
  $('#marginRange').value = current.margin;
  $('#marginVal').textContent = current.margin + 'mm';

  // Options du menu
  $('#menuAutoOpen').checked = current.menuAutoOpen;
  $('#menuShowPrices').checked = current.menuShowPrices;
  $('#menuShowImages').checked = current.menuShowImages;
  $('#menuLanguageSelect').value = current.menuLanguage;

  // Support
  $$('#supportTabs .te-support-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.support === current.support);
  });
  $$('.te-support-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.support === current.support);
  });

  // Zoom
  $('#zoomVal').textContent = current.zoom + '%';

  // Éclairage
  $$('.te-lighting-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lighting === current.lighting);
  });

  // Mode sombre
  $('#darkModeToggle').checked = current.darkMode;

  // Génération
  $('#tableCountInput').value = current.tableCount;
  $('#prefixInput').value = current.prefix;
}

// ============================================================
// Tables
// ============================================================
function initTables() {
  try {
    const saved = localStorage.getItem(TE_TABLES_KEY);
    if (saved) {
      tables = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Impossible de charger les tables', e);
  }

  if (tables.length === 0) {
    // Générer 50 tables par défaut
    generateTables(50, 'Table');
  }
}

function generateTables(count, prefix) {
  tables = [];
  for (let i = 1; i <= count; i++) {
    tables.push({
      id: 'table_' + i,
      name: prefix + ' ' + i,
      status: 'ready',
      createdAt: Date.now()
    });
  }
  saveTables();
  renderTables();
  updateTableCount();
  showToast(count + ' tables générées avec succès');
}

function saveTables() {
  try {
    localStorage.setItem(TE_TABLES_KEY, JSON.stringify(tables));
  } catch (e) {
    console.warn('Impossible de sauvegarder les tables', e);
  }
}

function addTable() {
  const nextNum = tables.length + 1;
  tables.push({
    id: 'table_' + nextNum,
    name: current.prefix + ' ' + nextNum,
    status: 'ready',
    createdAt: Date.now()
  });
  saveTables();
  renderTables();
  updateTableCount();
  showToast('Table ajoutée');
}

function updateTableCount() {
  $('#tableCountBadge').textContent = '(' + tables.length + ')';
}

// ============================================================
// Rendu des tables
// ============================================================
function renderTables() {
  const grid = $('#tablesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Afficher les 3 premières, puis "..." si plus de 5, puis la dernière
  const visibleTables = [];
  if (tables.length > 0) {
    visibleTables.push(tables[0]);
    if (tables.length > 1) visibleTables.push(tables[1]);
    if (tables.length > 2) visibleTables.push(tables[2]);
    if (tables.length > 5) {
      visibleTables.push({ id: 'more', name: '...', status: 'more' });
    }
    if (tables.length > 3) {
      visibleTables.push(tables[tables.length - 1]);
    }
  }

  visibleTables.forEach(table => {
    if (table.more) {
      const moreCard = document.createElement('div');
      moreCard.className = 'te-table-card-more';
      moreCard.textContent = '…';
      grid.appendChild(moreCard);
      return;
    }

    const card = document.createElement('div');
    card.className = 'te-table-card';
    card.dataset.id = table.id;

    const name = document.createElement('span');
    name.className = 'te-table-card-name';
    name.textContent = table.name;

    const status = document.createElement('span');
    status.className = 'te-table-card-status';
    status.textContent = 'Prêt';

    const qrWrap = document.createElement('div');
    qrWrap.className = 'te-table-card-qr';
    const canvas = document.createElement('canvas');
    canvas.width = 60;
    canvas.height = 60;
    qrWrap.appendChild(canvas);

    card.appendChild(name);
    card.appendChild(status);
    card.appendChild(qrWrap);

    // Générer le mini QR
    try {
      const qr = new QRCode(canvas, {
        text: 'https://auresto.app/menu?table=' + encodeURIComponent(table.name),
        width: 60,
        height: 60,
        colorDark: current.moduleId,
        colorLight: current.bgColor,
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (e) {
      console.warn('Erreur génération QR', e);
    }

    card.addEventListener('click', () => {
      $('#previewTableLabel').textContent = table.name.toUpperCase();
      showToast('Table sélectionnée : ' + table.name);
    });

    grid.appendChild(card);
  });

  // Carte "Ajouter une table"
  const addCard = document.createElement('button');
  addCard.type = 'button';
  addCard.className = 'te-table-card-add';
  addCard.innerHTML = '<span class="te-add-icon">+</span><span>Ajouter une table</span>';
  addCard.addEventListener('click', addTable);
  grid.appendChild(addCard);
}

// ============================================================
// QR Code
// ============================================================
function initQRCode() {
  const canvas = $('#qrCanvas');
  if (!canvas) return;

  try {
    qrCodeInstance = new QRCode(canvas, {
      text: 'https://auresto.app/menu?table=12',
      width: 140,
      height: 140,
      colorDark: current.moduleId,
      colorLight: current.bgColor,
      correctLevel: QRCode.CorrectLevel.H
    });
  } catch (e) {
    console.warn('Erreur initialisation QR', e);
  }
}

function updateQRCode() {
  const canvas = $('#qrCanvas');
  if (!canvas) return;

  try {
    if (qrCodeInstance) {
      qrCodeInstance.clear();
      qrCodeInstance.makeCode('https://auresto.app/menu?table=12');
    } else {
      qrCodeInstance = new QRCode(canvas, {
        text: 'https://auresto.app/menu?table=12',
        width: 140,
        height: 140,
        colorDark: current.moduleId,
        colorLight: current.bgColor,
        correctLevel: QRCode.CorrectLevel.H
      });
    }

    // Appliquer la couleur des modules
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const target = hexToRgb(current.moduleId);
    const bg = hexToRgb(current.bgColor);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      // Si le pixel est sombre (module), le remplacer par la couleur choisie
      if (r < 128 && g < 128 && b < 128 && a > 128) {
        data[i] = target.r;
        data[i + 1] = target.g;
        data[i + 2] = target.b;
      } else if (r > 200 && g > 200 && b > 200 && a > 128) {
        // Fond blanc -> couleur de fond
        data[i] = bg.r;
        data[i + 1] = bg.g;
        data[i + 2] = bg.b;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Logo central
    if (current.logoEnabled && current.logoDataUrl) {
      const logoSize = canvas.width * (current.logoSize / 100);
      const x = (canvas.width - logoSize) / 2;
      const y = (canvas.height - logoSize) / 2;
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 2, y - 2, logoSize + 4, logoSize + 4);
        ctx.drawImage(img, x, y, logoSize, logoSize);
      };
      img.src = current.logoDataUrl;
    }
  } catch (e) {
    console.warn('Erreur mise à jour QR', e);
  }
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

// ============================================================
// Aperçu
// ============================================================
function updatePreview() {
  const chevalet = $('#chevalet');
  if (!chevalet) return;

  // Support
  chevalet.dataset.support = current.support;

  // Couleurs du support
  chevalet.style.setProperty('--te-paper-color', current.paperColor);
  chevalet.style.setProperty('--te-border-color', current.borderColor);
  chevalet.style.setProperty('--te-border-width', current.borderWidth + 'px');
  chevalet.style.setProperty('--te-corner-radius', current.cornerRadius + 'px');
  chevalet.style.setProperty('--te-shadow', current.shadow + 'px');
  chevalet.style.setProperty('--te-reflection', (current.reflection / 100).toString());

  // Police
  chevalet.style.setProperty('--te-font-family', '"' + current.fontFamily + '", sans-serif');
  chevalet.style.setProperty('--te-title-size', current.titleSize + 'px');
  chevalet.style.setProperty('--te-text-size', current.textSize + 'px');
  chevalet.style.setProperty('--te-text-align', current.textAlign);

  // Couleurs du texte
  const titleColor = current.paperColor === '#FFFFFF' || current.paperColor === '#ffffff' ? '#1a1a1a' : '#ffffff';
  const textColor = current.paperColor === '#FFFFFF' || current.paperColor === '#ffffff' ? '#666666' : '#cccccc';
  chevalet.style.setProperty('--te-title-color', titleColor);
  chevalet.style.setProperty('--te-text-color', textColor);

  // Fond du QR
  chevalet.style.setProperty('--te-qr-bg', current.bgColor);

  // Textes
  $('#previewRestaurantName').textContent = current.restaurantName;
  $('#previewTagline').textContent = current.tagline;
  $('#previewTableLabel').textContent = current.tableLabel.replace('{name}', '12');
  $('#previewInstruction').textContent = current.instruction;
  $('#previewFooter').textContent = current.footerText;

  // Arrière-plan
  const stage = $('#previewStage');
  stage.dataset.bg = current.bgOption;

  // Éclairage
  const isNight = current.lighting === 'night' || current.darkMode;
  stage.classList.toggle('lighting-night', isNight);

  // Zoom
  const inner = $('#previewInner');
  inner.style.transform = 'scale(' + (current.zoom / 100) + ')';

  // QR Code
  updateQRCode();
}

// ============================================================
// Événements
// ============================================================
function bindEvents() {
  // Onglets
  $$('.te-panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.te-panel-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Accordéons
  $$('.te-accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const accordion = trigger.closest('.te-accordion');
      accordion.classList.toggle('open');
    });
  });

  // Modèles
  $$('.te-template-card').forEach(card => {
    card.addEventListener('click', () => {
      $$('.te-template-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      applyTemplate(card.dataset.template);
    });
  });

  // Couleurs modules
  bindColorInput('#moduleColorInput', '#moduleColorHex', '#moduleColorSwatch', 'moduleId');
  bindColorInput('#moduleColorHex', '#moduleColorInput', '#moduleColorSwatch', 'moduleId');
  bindColorInput('#bgColorInput', '#bgColorHex', '#bgColorSwatch', 'bgColor');
  bindColorInput('#bgColorHex', '#bgColorInput', '#bgColorSwatch', 'bgColor');
  bindColorInput('#paperColorInput', '#paperColorHex', '#paperColorSwatch', 'paperColor');
  bindColorInput('#paperColorHex', '#paperColorInput', '#paperColorSwatch', 'paperColor');
  bindColorInput('#borderColorInput', '#borderColorHex', '#borderColorSwatch', 'borderColor');
  bindColorInput('#borderColorHex', '#borderColorInput', '#borderColorSwatch', 'borderColor');

  // Forme des coins
  $$('#cornerShapeGroup button').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#cornerShapeGroup button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      current.cornerShape = btn.dataset.value;
      scheduleAutoSave();
    });
  });

  // Logo
  $('#logoEnabled').addEventListener('change', e => {
    current.logoEnabled = e.target.checked;
    updateLogoControls();
    scheduleAutoSave();
  });

  $('#logoFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      current.logoDataUrl = ev.target.result;
      $('#logoPreviewImg').src = current.logoDataUrl;
      scheduleAutoSave();
    };
    reader.readAsDataURL(file);
  });

  $('#removeLogoBtn').addEventListener('click', () => {
    current.logoDataUrl = null;
    $('#logoPreviewImg').src = 'favicon.svg';
    scheduleAutoSave();
  });

  $('#logoSizeRange').addEventListener('input', e => {
    current.logoSize = parseInt(e.target.value);
    $('#logoSizeVal').textContent = current.logoSize + '%';
    scheduleAutoSave();
  });

  // Arrière-plan
  $$('#bgOptions .te-bg-option').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#bgOptions .te-bg-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      current.bgOption = btn.dataset.bg;
      $$('.te-float-bg').forEach(b => b.classList.toggle('active', b.dataset.bg === current.bgOption));
      scheduleAutoSave();
    });
  });

  $$('.te-float-bg').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.te-float-bg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      current.bgOption = btn.dataset.bg;
      $$('#bgOptions .te-bg-option').forEach(b => b.classList.toggle('active', b.dataset.bg === current.bgOption));
      scheduleAutoSave();
    });
  });

  // Textes
  bindTextInput('#restaurantNameInput', 'restaurantName');
  bindTextInput('#restaurantTaglineInput', 'tagline');
  bindTextInput('#tableLabelInput', 'tableLabel');
  bindTextInput('#instructionTextInput', 'instruction');
  bindTextInput('#footerTextInput', 'footerText');

  $('#fontFamilySelect').addEventListener('change', e => {
    current.fontFamily = e.target.value;
    scheduleAutoSave();
  });

  bindRangeInput('#titleSizeRange', 'titleSize', 'titleSizeVal', 'px');
  bindRangeInput('#textSizeRange', 'textSize', 'textSizeVal', 'px');

  // Alignement
  $$('#textAlignGroup button').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#textAlignGroup button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      current.textAlign = btn.dataset.value;
      scheduleAutoSave();
    });
  });

  // Bordures & effets
  bindRangeInput('#borderWidthRange', 'borderWidth', 'borderWidthVal', 'px');
  bindRangeInput('#cornerRadiusRange', 'cornerRadius', 'cornerRadiusVal', 'px');
  bindRangeInput('#shadowRange', 'shadow', 'shadowVal', 'px');
  bindRangeInput('#reflectionRange', 'reflection', 'reflectionVal', '%');

  // Format
  $('#printFormatSelect').addEventListener('change', e => {
    current.printFormat = e.target.value;
    scheduleAutoSave();
  });

  $('#printQualitySelect').addEventListener('change', e => {
    current.printQuality = e.target.value;
    scheduleAutoSave();
  });

  bindRangeInput('#marginRange', 'margin', 'marginVal', 'mm');

  // Options du menu
  $('#menuAutoOpen').addEventListener('change', e => {
    current.menuAutoOpen = e.target.checked;
    scheduleAutoSave();
  });

  $('#menuShowPrices').addEventListener('change', e => {
    current.menuShowPrices = e.target.checked;
    scheduleAutoSave();
  });

  $('#menuShowImages').addEventListener('change', e => {
    current.menuShowImages = e.target.checked;
    scheduleAutoSave();
  });

  $('#menuLanguageSelect').addEventListener('change', e => {
    current.menuLanguage = e.target.value;
    scheduleAutoSave();
  });

  // Support tabs
  $$('#supportTabs .te-support-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setSupport(btn.dataset.support);
    });
  });

  $$('.te-support-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setSupport(btn.dataset.support);
    });
  });

  // Zoom
  $('#zoomInBtn').addEventListener('click', () => {
    current.zoom = Math.min(150, current.zoom + 10);
    $('#zoomVal').textContent = current.zoom + '%';
    scheduleAutoSave();
  });

  $('#zoomOutBtn').addEventListener('click', () => {
    current.zoom = Math.max(50, current.zoom - 10);
    $('#zoomVal').textContent = current.zoom + '%';
    scheduleAutoSave();
  });

  // Éclairage
  $$('.te-lighting-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.te-lighting-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      current.lighting = btn.dataset.lighting;
      scheduleAutoSave();
    });
  });

  // Mode sombre
  $('#darkModeToggle').addEventListener('change', e => {
    current.darkMode = e.target.checked;
    scheduleAutoSave();
  });

  // Génération
  $('#countUpBtn').addEventListener('click', () => {
    const input = $('#tableCountInput');
    input.value = Math.min(500, parseInt(input.value || 1) + 1);
    current.tableCount = parseInt(input.value);
  });

  $('#countDownBtn').addEventListener('click', () => {
    const input = $('#tableCountInput');
    input.value = Math.max(1, parseInt(input.value || 1) - 1);
    current.tableCount = parseInt(input.value);
  });

  $('#tableCountInput').addEventListener('change', e => {
    current.tableCount = Math.max(1, Math.min(500, parseInt(e.target.value || 1)));
    e.target.value = current.tableCount;
  });

  $('#prefixInput').addEventListener('input', e => {
    current.prefix = e.target.value;
  });

  $('#generateBtn').addEventListener('click', () => {
    generateTables(current.tableCount, current.prefix || 'Table');
  });

  // Boutons d'action
  $('#saveBtn').addEventListener('click', () => {
    saveState();
    showToast('Design enregistré');
  });

  $('#previewBtn').addEventListener('click', () => {
    showToast('Aperçu en plein écran');
  });

  $('#shareBtn').addEventListener('click', () => {
    showToast('Lien de partage copié');
  });

  $('#downloadAllBtn').addEventListener('click', () => {
    showToast('Téléchargement de ' + tables.length + ' tables...');
  });

  $('#printBtn').addEventListener('click', () => {
    window.print();
  });

  // Export
  $('#exportPngBtn').addEventListener('click', () => exportQR('png'));
  $('#exportJpgBtn').addEventListener('click', () => exportQR('jpg'));
  $('#exportSvgBtn').addEventListener('click', () => exportQR('svg'));
  $('#exportPdfBtn').addEventListener('click', () => exportQR('pdf'));

  // Menu toggle
  $('#menuToggleBtn').addEventListener('click', () => {
    const sidebar = $('.te-sidebar');
    sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
  });
}

// ============================================================
// Helpers d'événements
// ============================================================
function bindColorInput(inputSel, hexSel, swatchSel, key) {
  const input = $(inputSel);
  const hex = $(hexSel);
  const swatch = $(swatchSel);

  if (!input || !hex || !swatch) return;

  input.addEventListener('input', () => {
    const val = input.value;
    current[key] = val;
    hex.value = val.toUpperCase();
    swatch.style.background = val;
    scheduleAutoSave();
  });

  hex.addEventListener('input', () => {
    let val = hex.value;
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      current[key] = val;
      input.value = val;
      swatch.style.background = val;
      scheduleAutoSave();
    }
  });
}

function bindTextInput(sel, key) {
  const el = $(sel);
  if (!el) return;
  el.addEventListener('input', () => {
    current[key] = el.value;
    scheduleAutoSave();
  });
}

function bindRangeInput(rangeSel, key, valSel, suffix) {
  const range = $(rangeSel);
  const val = $(valSel);
  if (!range || !val) return;
  range.addEventListener('input', () => {
    current[key] = parseInt(range.value);
    val.textContent = current[key] + suffix;
    scheduleAutoSave();
  });
}

function setSupport(support) {
  current.support = support;
  $$('#supportTabs .te-support-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.support === support);
  });
  $$('.te-support-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.support === support);
  });
  $('#printFormatSelect').value = support;
  scheduleAutoSave();
}

function updateLogoControls() {
  const controls = $('#logoControls');
  if (!controls) return;
  controls.style.opacity = current.logoEnabled ? '1' : '0.4';
  controls.style.pointerEvents = current.logoEnabled ? 'auto' : 'none';
}

function loadDefaultLogo() {
  if (current.logoDataUrl) return;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 64);
    current.logoDataUrl = canvas.toDataURL('image/png');
    $('#logoPreviewImg').src = current.logoDataUrl;
    updateQRCode();
  };
  img.src = 'favicon.svg';
}

// ============================================================
// Modèles
// ============================================================
function applyTemplate(template) {
  const templates = {
    minimal: {
      moduleId: '#111111',
      bgColor: '#FFFFFF',
      paperColor: '#FFFFFF',
      borderColor: '#111111',
      borderWidth: 1,
      cornerRadius: 4,
      fontFamily: 'DM Sans',
      titleSize: 20,
      textSize: 11,
      shadow: 15
    },
    elegant: {
      moduleId: '#1a1a1a',
      bgColor: '#FFFFFF',
      paperColor: '#1a1a1a',
      borderColor: '#e8a878',
      borderWidth: 2,
      cornerRadius: 2,
      fontFamily: 'Playfair Display',
      titleSize: 24,
      textSize: 12,
      shadow: 30
    },
    bois: {
      moduleId: '#3d2e1f',
      bgColor: '#faf6f0',
      paperColor: '#f5ebe0',
      borderColor: '#8b6914',
      borderWidth: 3,
      cornerRadius: 8,
      fontFamily: 'Georgia',
      titleSize: 22,
      textSize: 12,
      shadow: 25
    },
    luxe: {
      moduleId: '#1a1a1a',
      bgColor: '#faf8f5',
      paperColor: '#1a1a1a',
      borderColor: '#e8a878',
      borderWidth: 2,
      cornerRadius: 2,
      fontFamily: 'Playfair Display',
      titleSize: 26,
      textSize: 12,
      shadow: 40
    }
  };

  const t = templates[template];
  if (!t) return;

  Object.assign(current, t);
  applyStateToUI();
  scheduleAutoSave();
  showToast('Modèle appliqué : ' + template);
}

// ============================================================
// Export
// ============================================================
function exportQR(format) {
  const canvas = $('#qrCanvas');
  if (!canvas) return;

  const link = document.createElement('a');

  if (format === 'png') {
    link.download = 'qr-code-table.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } else if (format === 'jpg') {
    link.download = 'qr-code-table.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
  } else if (format === 'svg') {
    // Export SVG simple
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
      '<rect width="200" height="200" fill="' + current.bgColor + '"/>' +
      '<text x="100" y="100" text-anchor="middle" fill="' + current.moduleId + '" font-size="14">QR Code</text>' +
      '</svg>';
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    link.download = 'qr-code-table.svg';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  } else if (format === 'pdf') {
    // Export PDF simple
    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (win) {
      win.document.write('<html><head><title>QR Code</title></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0">');
      win.document.write('<img src="' + dataUrl + '" style="max-width:80%;max-height:80%"/>');
      win.document.write('</body></html>');
      win.document.close();
      win.print();
    }
  }

  showToast('Export ' + format.toUpperCase() + ' téléchargé');
}

// ============================================================
// Auto-save
// ============================================================
function scheduleAutoSave() {
  const badge = $('#autoSaveBadge');
  const text = $('#autoSaveText');

  if (badge) {
    badge.classList.add('saving');
    if (text) text.textContent = 'Enregistrement...';
  }

  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveState();
    updatePreview();
    if (badge) {
      badge.classList.remove('saving');
      if (text) text.textContent = 'Enregistré automatiquement';
    }
  }, 600);
}

// ============================================================
// Toast
// ============================================================
function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}