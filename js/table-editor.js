// ============================================================
// Auresto — Éditeur de table (Table Editor)
// ============================================================

const TE_STORAGE_KEY = 'auresto_table_editor_design';
const TE_TABLES_KEY = 'auresto_table_editor_tables';

// Charge un fichier image quelconque (photo, logo...) et renvoie une data
// URL compacte. Redimensionne les images trop grandes (photos de téléphone
// = souvent 3-12 Mo) pour éviter de dépasser le quota de localStorage et
// signale clairement les formats que le navigateur ne sait pas décoder
// (ex: HEIC/HEIF des iPhone, non supportés nativement par les navigateurs).
function loadImageFileAsDataUrl(file, { maxDim = 1600, quality = 0.88, keepTransparency = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('unsupported-type'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode-failed'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const format = keepTransparency ? 'image/png' : 'image/jpeg';
          resolve(canvas.toDataURL(format, quality));
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Position réelle (fraction de la largeur/hauteur de l'image source) du
// centre du socle en bois visible dans assets/bg-restaurant.png, mesurée
// directement sur la photo (image source : 1448×1086px).
const RESTAURANT_BG_STAND = { fx: 0.513, fy: 0.775, fw: 0.365, naturalW: 1448, naturalH: 1086 };
const CHEVALET_NATIVE_WIDTH = 260;

// Cadrage par defaut de la carte sur le socle : valeurs retenues comme
// rendu de reference. Le bouton « Reinitialiser » y revient aussi, pour
// que « par defaut » et « reinitialise » designent le meme resultat.
const TE_DEFAULT_VIEW = { zoom: 90, cardSize: 105, cardOffsetX: 0, cardOffsetY: 0 };

// Pose la carte (son bord bas) exactement sur le socle réel visible dans la
// photo d'arrière-plan, en tenant compte du recadrage "cover" du CSS.
function alignCardOnPhotoStand() {
  const stage = $('#previewStage');
  const scene = $('#scene');
  if (!stage || !scene) return;

  // Ajustements manuels du restaurateur : decalage en pixels de scene et
  // taille en % de la taille calculee automatiquement.
  const userScale = (current.cardSize || 100) / 100;
  const dx = current.cardOffsetX || 0;
  const dy = current.cardOffsetY || 0;

  if (current.bgOption !== 'restaurant') {
    scene.classList.add('te-scene-centered');
    scene.style.left = '';
    scene.style.top = '';
    scene.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
    const chevaletReset = $('#chevalet');
    if (chevaletReset) {
      chevaletReset.style.transformOrigin = '50% 100%';
      chevaletReset.style.transform =
        `perspective(1400px) rotateX(6deg) rotateY(-4deg) scale(${userScale})`;
    }
    return;
  }

  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const { fx, fy, fw, naturalW, naturalH } = RESTAURANT_BG_STAND;
  const scale = Math.max(rect.width / naturalW, rect.height / naturalH);
  const dispW = naturalW * scale;
  const dispH = naturalH * scale;
  // background-position: center 40% (voir CSS .te-preview-stage[data-bg="restaurant"])
  const offsetX = (rect.width - dispW) * 0.5;
  const offsetY = (rect.height - dispH) * 0.40;

  const targetX = offsetX + fx * dispW;
  const targetY = offsetY + fy * dispH;

  // Taille réelle du socle dans la photo -> même largeur pour la carte,
  // sans jamais dépasser la hauteur disponible dans la vignette d'aperçu
  // (le ratio largeur/hauteur de l'aperçu ne correspond pas forcément à
  // celui de la photo, donc on plafonne pour éviter tout débordement).
  const CHEVALET_NATIVE_HEIGHT = 420;
  const targetCardWidth = fw * dispW;
  const maxCardHeight = Math.min(targetY, rect.height) * 0.92;
  const widthScale = targetCardWidth / CHEVALET_NATIVE_WIDTH;
  const heightScale = maxCardHeight / CHEVALET_NATIVE_HEIGHT;
  const cardScale = Math.min(widthScale, heightScale);

  const chevalet = $('#chevalet');
  if (chevalet) {
    chevalet.style.transformOrigin = '50% 100%';
    chevalet.style.transform =
      `perspective(1400px) rotateX(6deg) rotateY(-4deg) scale(${cardScale * userScale})`;
  }

  scene.classList.remove('te-scene-centered');
  scene.style.left = targetX + 'px';
  scene.style.top = targetY + 'px';
  scene.style.transform = `translate(-50%, -100%) translate(${dx}px, ${dy}px)`;
}

// Construit l'URL réelle du menu client (scan QR) pour une table donnée
function buildTableUrl(tableName) {
  const base = `${location.origin}${location.pathname.replace(/[^/]+$/, '')}client.html`;
  const restaurant = (typeof current !== 'undefined' && current.restaurantName) || 'restaurant';
  const params = new URLSearchParams({ restaurant, table: tableName });
  // Identifiant du restaurant : permet au client scannant le QR code de
  // déposer un avis sans disposer de données locales.
  const rid = (() => {
    try { return localStorage.getItem('auresto_restaurant_id'); } catch { return null; }
  })();
  if (rid) params.set('r', rid);
  return `${base}?${params.toString()}`;
}

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
  fontFamily: 'Playfair Display',
  titleSize: 26,
  textSize: 11,
  textAlign: 'center',
  borderEnabled: true,
  borderWidth: 2,
  cornerRadius: 16,
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
  zoom: TE_DEFAULT_VIEW.zoom,
  // Position et taille de la carte, ajustables a la souris / au clavier.
  // Les offsets sont en pixels de la scene, la taille en % de la taille
  // calculee automatiquement pour le socle de la photo.
  cardOffsetX: TE_DEFAULT_VIEW.cardOffsetX,
  cardOffsetY: TE_DEFAULT_VIEW.cardOffsetY,
  cardSize: TE_DEFAULT_VIEW.cardSize,
  lighting: 'day',
  darkMode: false,
  tableCount: 50,
  prefix: 'Table',
  // Décalages (x, y en px) des éléments déplacés à la souris sur la carte
  elementOffsets: {},
  // Photo personnalisée pour l'arrière-plan de la scène (data URL)
  customBgUrl: null,
  // Photo personnalisée utilisée comme papier de la carte (data URL)
  paperImageUrl: null
};

let tables = [];
let autoSaveTimer = null;
let toastTimer = null;

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

// ============================================================
// Initialisation
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderSidebarAccount();
  initTables();
  initQRCode();
  bindEvents();
  initDirectEditing();
  initCardDragging();
  loadDefaultLogo();
  updatePreview();
  renderTables();
  updateTableCount();

  let alignResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(alignResizeTimer);
    alignResizeTimer = setTimeout(alignCardOnPhotoStand, 150);
  });
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
    borderEnabled: current.borderEnabled,
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
    cardOffsetX: current.cardOffsetX,
    cardOffsetY: current.cardOffsetY,
    cardSize: current.cardSize,
    lighting: current.lighting,
    darkMode: current.darkMode,
    tableCount: current.tableCount,
    prefix: current.prefix,
    elementOffsets: current.elementOffsets,
    customBgUrl: current.customBgUrl,
    paperImageUrl: current.paperImageUrl
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
  $('#borderEnabled').checked = current.borderEnabled !== false;
  $('#logoSizeRange').value = current.logoSize;
  $('#logoSizeVal').textContent = current.logoSize + '%';
  updateLogoControls();
  updateBorderControls();

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

  // Taille de la carte
  $('#cardSizeVal').textContent = (current.cardSize || 100) + '%';

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

    card.appendChild(name);
    card.appendChild(status);
    card.appendChild(qrWrap);

    // Générer le mini QR
    try {
      const miniCanvas = document.createElement('canvas');
      miniCanvas.width = 60;
      miniCanvas.height = 60;
      qrWrap.appendChild(miniCanvas);
      const miniMatrix = computeQrMatrix(buildTableUrl(table.name));
      drawQrModules(miniCanvas, miniMatrix, current.cornerShape, current.moduleId, current.bgColor);
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
// Calcule la matrice QR dans un conteneur hors-écran, jamais inséré dans la
// page : on n'utilise jamais le rendu DOM (canvas/<img>) de la librairie,
// seulement l'objet matrice qu'elle expose (_oQRCode), pour éviter la course
// entre notre affichage et le <img onload> asynchrone qu'elle gère seule.
function computeQrMatrix(text) {
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
  document.body.appendChild(tempDiv);
  const qr = new QRCode(tempDiv, {
    text,
    width: 140,
    height: 140,
    colorDark: current.moduleId,
    colorLight: current.bgColor,
    correctLevel: QRCode.CorrectLevel.H
  });
  const matrix = qr._oQRCode;
  tempDiv.remove();
  return matrix;
}

function initQRCode() {
  const wrap = $('#qrWrap');
  if (!wrap) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'qrCanvas';
  canvas.width = 140;
  canvas.height = 140;
  wrap.innerHTML = '';
  wrap.appendChild(canvas);
}

function updateQRCode() {
  const wrap = $('#qrWrap');
  if (!wrap) return;

  try {
    const canvas = wrap.querySelector('canvas') || (initQRCode(), wrap.querySelector('canvas'));
    if (!canvas) return;

    const oQRCode = computeQrMatrix(buildTableUrl('12'));
    drawQrModules(canvas, oQRCode, current.cornerShape, current.moduleId, current.bgColor);
    const ctx = canvas.getContext('2d');

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

// Redessine la matrice QR module par module (permet les formes "arrondis"/"points",
// style QR marchand type Wave/WeChat Pay). Les 3 carrés de repérage (coins) restent
// pleins pour garantir la fiabilité du scan.
function drawQrModules(canvas, oQRCode, shape, moduleColor, bgColor) {
  const count = oQRCode.getModuleCount();
  // Rendu interne haute résolution (≥10px/module) indispensable pour que les
  // formes "points"/"arrondis" restent scannables ; la taille affichée (CSS)
  // ne change pas.
  const displaySize = canvas.style.width ? parseInt(canvas.style.width, 10) : canvas.width;
  const resolution = Math.max(count * 10, displaySize);
  if (canvas.width !== resolution) canvas.width = resolution;
  if (canvas.height !== resolution) canvas.height = resolution;
  canvas.style.width = displaySize + 'px';
  canvas.style.height = displaySize + 'px';

  const size = canvas.width;
  const cell = size / count;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = moduleColor;

  const isFinderZone = (row, col) => {
    const inTL = row < 7 && col < 7;
    const inTR = row < 7 && col >= count - 7;
    const inBL = row >= count - 7 && col < 7;
    return inTL || inTR || inBL;
  };

  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!oQRCode.isDark(row, col)) continue;
      const x = col * cell;
      const y = row * cell;
      const useShape = isFinderZone(row, col) ? 'square' : shape;

      drawQrModuleShape(ctx, useShape, x, y, cell);
    }
  }
}

// Dessine un module (case sombre) selon le motif choisi. `shape` peut être
// 'square', 'rounded', 'dots', 'diamond' ou 'classy'.
function drawQrModuleShape(ctx, shape, x, y, cell) {
  if (shape === 'dots') {
    const r = (cell / 2) * 0.95;
    ctx.beginPath();
    ctx.arc(x + cell / 2, y + cell / 2, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'rounded') {
    const pad = cell * 0.06;
    const r = cell * 0.32;
    roundRectPath(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2, r);
    ctx.fill();
  } else if (shape === 'diamond') {
    const cx = x + cell / 2, cy = y + cell / 2;
    const s = cell * 1.05;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  } else if (shape === 'classy') {
    const pad = cell * 0.05;
    classyRectPath(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.28);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, cell, cell);
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Carré arrondi uniquement sur 2 coins opposés (haut-gauche / bas-droite) —
// look "chic" utilisé par plusieurs générateurs de QR marchands.
function classyRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
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
  // Bordures désactivées : cadre à 0 et filet décoratif masqué via .te-no-border.
  const bordersOn = current.borderEnabled !== false;
  chevalet.style.setProperty('--te-border-width', (bordersOn ? current.borderWidth : 0) + 'px');
  chevalet.classList.toggle('te-no-border', !bordersOn);
  chevalet.style.setProperty('--te-corner-radius', current.cornerRadius + 'px');
  chevalet.style.setProperty('--te-shadow', current.shadow + 'px');
  chevalet.style.setProperty('--te-reflection', (current.reflection / 100).toString());

  // Police
  chevalet.style.setProperty('--te-font-family', '"' + current.fontFamily + '", sans-serif');
  chevalet.style.setProperty('--te-title-size', current.titleSize + 'px');
  chevalet.style.setProperty('--te-text-size', current.textSize + 'px');
  chevalet.style.setProperty('--te-text-align', current.textAlign);

  // Couleurs du texte (le papier photo force un texte blanc lisible)
  const isWhitePaper = current.paperColor === '#FFFFFF' || current.paperColor === '#ffffff';
  const titleColor = current.paperImageUrl ? '#ffffff' : (isWhitePaper ? '#1a1a1a' : '#ffffff');
  const textColor = current.paperImageUrl ? '#f0f0f0' : (isWhitePaper ? '#666666' : '#cccccc');
  chevalet.style.setProperty('--te-title-color', titleColor);
  chevalet.style.setProperty('--te-text-color', textColor);

  // Papier personnalisé (photo uploadée par le restaurateur)
  const top = $('.te-chevalet-top');
  if (top) {
    if (current.paperImageUrl) {
      top.style.setProperty('--te-paper-image', `url("${current.paperImageUrl}")`);
      top.classList.add('has-paper-image');
    } else {
      top.classList.remove('has-paper-image');
    }
  }
  const uploadCard = $('#uploadPaperImageCard');
  const paperPreview = $('#paperImagePreview');
  const removeBtn = $('#removePaperImageBtn');
  if (uploadCard) uploadCard.classList.toggle('active', !!current.paperImageUrl);
  if (paperPreview) paperPreview.style.backgroundImage = current.paperImageUrl ? `url("${current.paperImageUrl}")` : '';
  if (removeBtn) removeBtn.hidden = !current.paperImageUrl;

  // Fond du QR
  chevalet.style.setProperty('--te-qr-bg', current.bgColor);

  // Logo (icône du haut) — image uploadée si présente, sinon icône générique
  const iconEl = $('#previewRestaurantIcon');
  if (iconEl) {
    if (current.logoDataUrl) {
      iconEl.style.backgroundImage = `url("${current.logoDataUrl}")`;
      iconEl.classList.add('has-logo');
    } else {
      iconEl.style.backgroundImage = '';
      iconEl.classList.remove('has-logo');
    }
  }

  // Textes
  $('#previewRestaurantName').textContent = current.restaurantName;
  $('#previewTagline').textContent = current.tagline;
  $('#previewTableLabel').textContent = current.tableLabel.replace('{name}', '12');
  $('#previewInstruction').textContent = current.instruction;
  $('#previewFooter').textContent = current.footerText;

  // Arrière-plan
  const stage = $('#previewStage');
  stage.dataset.bg = current.bgOption;
  applyCustomBgImage();
  alignCardOnPhotoStand();

  // Éclairage
  const isNight = current.lighting === 'night' || current.darkMode;
  stage.classList.toggle('lighting-night', isNight);

  // Zoom
  const inner = $('#previewInner');
  inner.style.transform = 'scale(' + (current.zoom / 100) + ')';

  // QR Code
  updateQRCode();

  // Position des éléments déplacés à la souris
  applyElementOffsets();
}

// ============================================================
// Édition directe sur la carte (clic pour changer le logo, glisser les
// textes/éléments à la souris — comme dans un éditeur type Canva)
// ============================================================
const DRAGGABLE_IDS = [
  'previewRestaurantIcon',
  'previewRestaurantName',
  'previewTagline',
  'previewTableLabel',
  'previewInstruction',
  'previewFooter',
  'qrWrap'
];

function applyElementOffsets() {
  DRAGGABLE_IDS.forEach(id => {
    const el = $('#' + id);
    if (!el) return;
    const offset = current.elementOffsets[id];
    el.style.transform = offset ? `translate(${offset.x}px, ${offset.y}px)` : '';
  });
}

// Déplacement de la carte entière à la souris / au doigt.
// On ignore le geste s'il démarre sur un élément déjà déplaçable (textes,
// logo, QR) : ceux-ci gardent leur propre glisser, plus fin.
function initCardDragging() {
  const chevalet = $('#chevalet');
  const stage = $('#previewStage');
  if (!chevalet || !stage) return;

  chevalet.classList.add('te-card-draggable');

  let dragging = false;
  let startX = 0, startY = 0, baseX = 0, baseY = 0;

  const point = e => (e.touches && e.touches[0]) || e;

  const onDown = e => {
    if (e.target.closest('.te-editable')) return;
    const p = point(e);
    dragging = true;
    startX = p.clientX;
    startY = p.clientY;
    baseX = current.cardOffsetX || 0;
    baseY = current.cardOffsetY || 0;
    chevalet.classList.add('te-card-dragging');
    if (e.cancelable) e.preventDefault();
  };

  const onMove = e => {
    if (!dragging) return;
    const p = point(e);
    // L'aperçu est mis à l'échelle par le zoom : on ramène le déplacement
    // souris dans le repère de la scène, sinon la carte « glisse » plus vite
    // ou plus lentement que le curseur.
    const zoom = (current.zoom || 100) / 100;
    current.cardOffsetX = Math.round(baseX + (p.clientX - startX) / zoom);
    current.cardOffsetY = Math.round(baseY + (p.clientY - startY) / zoom);
    alignCardOnPhotoStand();
    if (e.cancelable) e.preventDefault();
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    chevalet.classList.remove('te-card-dragging');
    scheduleAutoSave();
  };

  chevalet.addEventListener('mousedown', onDown);
  chevalet.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
}

function initDirectEditing() {
  // Clic sur le logo (icône du haut) ou sur le QR code -> changer l'image
  const openLogoPicker = () => $('#logoFileInput')?.click();
  $('#previewRestaurantIcon')?.addEventListener('click', e => {
    if (dragMoved) { dragMoved = false; return; }
    openLogoPicker();
  });
  $('#qrWrap')?.addEventListener('click', e => {
    if (dragMoved) { dragMoved = false; return; }
    openLogoPicker();
  });

  DRAGGABLE_IDS.forEach(id => {
    const el = $('#' + id);
    if (el) el.classList.add('te-editable');
  });

  // Lignes de repère (style Canva) affichées pendant le glisser pour centrer
  // un élément par rapport à la carte ou aux autres éléments.
  const card = $('.te-chevalet-top');
  const guideV = document.createElement('div');
  guideV.className = 'te-align-guide te-align-guide-v';
  const guideH = document.createElement('div');
  guideH.className = 'te-align-guide te-align-guide-h';
  card?.appendChild(guideV);
  card?.appendChild(guideH);

  const SNAP = 6;
  let dragEl = null, dragId = null, startX = 0, startY = 0, baseX = 0, baseY = 0;

  $('#chevalet')?.addEventListener('mousedown', e => {
    const target = e.target.closest('.te-editable');
    if (!target) return;
    dragEl = target;
    dragId = target.id;
    dragMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    const offset = current.elementOffsets[dragId] || { x: 0, y: 0 };
    baseX = offset.x;
    baseY = offset.y;
    dragEl.classList.add('te-dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragEl || !card) return;
    const zoom = (current.zoom || 100) / 100;
    const dx = (e.clientX - startX) / zoom;
    const dy = (e.clientY - startY) / zoom;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    let x = baseX + dx;
    let y = baseY + dy;

    // Cibles d'alignement : centre de la carte + centre des autres éléments
    const cardRect = card.getBoundingClientRect();
    const dragRect = dragEl.getBoundingClientRect();
    const dragCx = dragRect.left + dragRect.width / 2;
    const dragCy = dragRect.top + dragRect.height / 2;
    const targetsX = [cardRect.left + cardRect.width / 2];
    const targetsY = [cardRect.top + cardRect.height / 2];
    DRAGGABLE_IDS.forEach(id => {
      if (id === dragId) return;
      const other = $('#' + id);
      if (!other) return;
      const r = other.getBoundingClientRect();
      targetsX.push(r.left + r.width / 2);
      targetsY.push(r.top + r.height / 2);
    });

    let snappedX = null, snappedY = null;
    for (const tx of targetsX) {
      if (Math.abs(dragCx - tx) < SNAP) { snappedX = tx; break; }
    }
    for (const ty of targetsY) {
      if (Math.abs(dragCy - ty) < SNAP) { snappedY = ty; break; }
    }
    if (snappedX !== null) x += (snappedX - dragCx) / zoom;
    if (snappedY !== null) y += (snappedY - dragCy) / zoom;

    dragEl.style.transform = `translate(${x}px, ${y}px)`;

    guideV.style.display = snappedX !== null ? 'block' : 'none';
    if (snappedX !== null) guideV.style.left = (snappedX - cardRect.left) + 'px';
    guideH.style.display = snappedY !== null ? 'block' : 'none';
    if (snappedY !== null) guideH.style.top = (snappedY - cardRect.top) + 'px';

    baseXLive = x; baseYLive = y;
  });

  let baseXLive = 0, baseYLive = 0;

  window.addEventListener('mouseup', () => {
    if (!dragEl) return;
    current.elementOffsets[dragId] = { x: baseXLive, y: baseYLive };
    dragEl.classList.remove('te-dragging');
    guideV.style.display = 'none';
    guideH.style.display = 'none';
    dragEl = null;
    dragId = null;
    scheduleAutoSave();
  });
}
let dragMoved = false;

// Sélectionne un arrière-plan de scène (préréglage ou "custom") et
// synchronise les deux jeux de vignettes (panneau + contrôles flottants)
function selectBgOption(value) {
  current.bgOption = value;
  $$('#bgOptions .te-bg-option').forEach(b => b.classList.toggle('active', b.dataset.bg === value));
  $$('.te-float-bg').forEach(b => b.classList.toggle('active', b.dataset.bg === value));
  updatePreview();
  scheduleAutoSave();
}

// Applique la photo personnalisée (si définie) aux vignettes "Votre photo"
// et, si elle est sélectionnée, à la scène d'aperçu elle-même.
function applyCustomBgImage() {
  if (!current.customBgUrl) return;
  const url = `url("${current.customBgUrl}")`;
  const customSwatch = $('#bgOptionCustom');
  if (customSwatch) customSwatch.style.backgroundImage = url;
  const stage = $('#previewStage');
  if (stage && current.bgOption === 'custom') {
    stage.style.backgroundImage = url;
    stage.style.backgroundSize = 'cover';
    stage.style.backgroundPosition = 'center';
  } else if (stage) {
    stage.style.backgroundImage = '';
  }
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

  // Accordéons (état ouvert/fermé mémorisé entre les rechargements)
  const ACC_STATE_KEY = 'auresto_table_editor_accordions';
  let accState = {};
  try { accState = JSON.parse(localStorage.getItem(ACC_STATE_KEY)) || {}; } catch { accState = {}; }

  $$('.te-accordion').forEach(accordion => {
    const key = accordion.dataset.accordion;
    if (key && Object.prototype.hasOwnProperty.call(accState, key)) {
      accordion.classList.toggle('open', accState[key]);
    }
  });

  $$('.te-accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const accordion = trigger.closest('.te-accordion');
      accordion.classList.toggle('open');
      const key = accordion.dataset.accordion;
      if (key) {
        accState[key] = accordion.classList.contains('open');
        localStorage.setItem(ACC_STATE_KEY, JSON.stringify(accState));
      }
    });
  });

  // Modèles
  $$('.te-template-card:not(#uploadPaperImageCard)').forEach(card => {
    card.addEventListener('click', () => {
      $$('.te-template-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      applyTemplate(card.dataset.template);
    });
  });

  // Modèle personnalisé : photo uploadée par le restaurateur comme papier
  // de la carte (au lieu d'une simple couleur/dégradé)
  $('#uploadPaperImageCard')?.addEventListener('click', () => $('#paperImageFileInput')?.click());

  $('#paperImageFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    loadImageFileAsDataUrl(file).then(dataUrl => {
      current.paperImageUrl = dataUrl;
      $$('.te-template-card').forEach(c => c.classList.remove('active'));
      $('#uploadPaperImageCard')?.classList.add('active');
      updatePreview();
      scheduleAutoSave();
    }).catch(() => {
      showToast("Impossible d'utiliser cette image (format non supporté). Essayez un JPG ou PNG.");
    });
    e.target.value = '';
  });

  $('#removePaperImageBtn')?.addEventListener('click', () => {
    current.paperImageUrl = null;
    $('#paperImageFileInput').value = '';
    $('#uploadPaperImageCard')?.classList.remove('active');
    updatePreview();
    scheduleAutoSave();
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

  // Bordures de la carte
  $('#borderEnabled').addEventListener('change', e => {
    current.borderEnabled = e.target.checked;
    updateBorderControls();
    updatePreview();
    scheduleAutoSave();
  });

  $('#logoFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    loadImageFileAsDataUrl(file, { maxDim: 500, keepTransparency: true }).then(dataUrl => {
      current.logoDataUrl = dataUrl;
      $('#logoPreviewImg').src = current.logoDataUrl;
      updatePreview();
      scheduleAutoSave();
    }).catch(() => {
      showToast("Impossible d'utiliser cette image (format non supporté). Essayez un JPG ou PNG.");
    });
    e.target.value = '';
  });

  $('#removeLogoBtn').addEventListener('click', () => {
    current.logoDataUrl = null;
    $('#logoPreviewImg').src = getRestaurantLogoUrl() || 'favicon.svg';
    loadDefaultLogo();
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

  // Photo personnalisée en arrière-plan (n'importe quelle image, pas
  // seulement les préréglages)
  const openCustomBgPicker = () => $('#customBgFileInput')?.click();
  $('#bgOptionAdd')?.addEventListener('click', openCustomBgPicker);
  $('.te-float-bg-add')?.addEventListener('click', openCustomBgPicker);
  $('#bgOptionCustom')?.addEventListener('click', () => {
    if (current.customBgUrl) selectBgOption('custom');
    else openCustomBgPicker();
  });

  $('#customBgFileInput')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    loadImageFileAsDataUrl(file).then(dataUrl => {
      current.customBgUrl = dataUrl;
      selectBgOption('custom');
      applyCustomBgImage();
      scheduleAutoSave();
    }).catch(() => {
      showToast("Impossible d'utiliser cette image (format non supporté). Essayez un JPG ou PNG.");
    });
    e.target.value = '';
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

  // Zoom — updatePreview() applique la mise à l'échelle, sans cet appel le
  // pourcentage changeait sans que l'aperçu ne bouge.
  $('#zoomInBtn').addEventListener('click', () => {
    current.zoom = Math.min(150, current.zoom + 10);
    $('#zoomVal').textContent = current.zoom + '%';
    updatePreview();
    scheduleAutoSave();
  });

  $('#zoomOutBtn').addEventListener('click', () => {
    current.zoom = Math.max(50, current.zoom - 10);
    $('#zoomVal').textContent = current.zoom + '%';
    updatePreview();
    scheduleAutoSave();
  });

  // Taille de la carte, indépendante du zoom de l'aperçu
  const setCardSize = value => {
    current.cardSize = Math.max(40, Math.min(200, value));
    $('#cardSizeVal').textContent = current.cardSize + '%';
    alignCardOnPhotoStand();
    scheduleAutoSave();
  };

  $('#cardSizeUpBtn').addEventListener('click', () => setCardSize((current.cardSize || 100) + 5));
  $('#cardSizeDownBtn').addEventListener('click', () => setCardSize((current.cardSize || 100) - 5));

  $('#cardResetBtn').addEventListener('click', () => {
    Object.assign(current, TE_DEFAULT_VIEW);
    $('#cardSizeVal').textContent = TE_DEFAULT_VIEW.cardSize + '%';
    $('#zoomVal').textContent = TE_DEFAULT_VIEW.zoom + '%';
    updatePreview();
    scheduleAutoSave();
    showToast('Cadrage par défaut rétabli');
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

}

// Widget profil de la barre latérale, identique aux autres pages :
// initiale en majuscule et « Compte <plan> ».
function renderSidebarAccount() {
  try {
    const data = AurestoStore.load();
    const name = data.restaurant?.name || 'Mon restaurant';
    const plan = data.plan || data.restaurant?.subscription_plan || 'Free';
    const nameEl = $('#teRestaurantName');
    const planEl = $('#teAccountPlan');
    const avatarEl = $('#teAvatar');
    const badgeEl = $('#tePlanBadge');
    if (nameEl) nameEl.textContent = name;
    if (planEl) planEl.textContent = `Compte ${plan}`;
    if (avatarEl) avatarEl.textContent = name.trim().charAt(0).toUpperCase() || 'A';
    if (badgeEl) badgeEl.textContent = plan;
  } catch { }
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

// Bordures désactivées : le réglage d'épaisseur n'a plus de sens, on le grise
// comme le fait le bloc logo. La valeur choisie est conservée et revient
// telle quelle si le restaurateur réactive les bordures.
function updateBorderControls() {
  const controls = $('#borderControls');
  if (!controls) return;
  const on = current.borderEnabled !== false;
  controls.style.opacity = on ? '1' : '0.4';
  controls.style.pointerEvents = on ? 'auto' : 'none';
}

// Récupère le logo du restaurant (uploadé à l'inscription/onboarding), pas
// celui d'Auresto. Le restaurateur peut toujours le remplacer via "Changer
// le logo" ; ce logo n'est qu'un point de départ par défaut.
function getRestaurantLogoUrl() {
  try {
    const raw = localStorage.getItem('auresto_data');
    const data = raw ? JSON.parse(raw) : null;
    return data?.branding?.logo || null;
  } catch {
    return null;
  }
}

function loadDefaultLogo() {
  if (current.logoDataUrl) return;
  const restaurantLogo = getRestaurantLogoUrl();
  if (!restaurantLogo) return;

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
  img.onerror = () => {};
  img.src = restaurantLogo;
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
    },
    vibrant: {
      moduleId: '#ffffff',
      bgColor: '#d6249f',
      paperColor: 'linear-gradient(135deg, #ff3caa 0%, #ff7a45 45%, #ffce45 100%)',
      borderColor: '#ffffff',
      borderWidth: 3,
      cornerRadius: 20,
      fontFamily: 'Poppins',
      titleSize: 24,
      textSize: 12,
      shadow: 35
    },
    tropical: {
      moduleId: '#0a4d3c',
      bgColor: '#0fae82',
      paperColor: 'linear-gradient(135deg, #0fae82 0%, #34c78e 45%, #d9e05b 100%)',
      borderColor: '#ffffff',
      borderWidth: 3,
      cornerRadius: 18,
      fontFamily: 'Poppins',
      titleSize: 24,
      textSize: 12,
      shadow: 30
    },
    aurora: {
      moduleId: '#1a1035',
      bgColor: '#5b2a86',
      paperColor: 'linear-gradient(150deg, #3d1a6b 0%, #6a3fb5 40%, #2e9ecf 75%, #35d0c0 100%)',
      borderColor: '#c9a6ff',
      borderWidth: 2,
      cornerRadius: 16,
      fontFamily: 'Playfair Display',
      titleSize: 25,
      textSize: 12,
      shadow: 38
    },
    sunset: {
      moduleId: '#5a1a3a',
      bgColor: '#e2496a',
      paperColor: 'linear-gradient(160deg, #3b1256 0%, #a12a6b 40%, #e2496a 70%, #f5a24a 100%)',
      borderColor: '#ffd27a',
      borderWidth: 2,
      cornerRadius: 16,
      fontFamily: 'Playfair Display',
      titleSize: 25,
      textSize: 12,
      shadow: 38
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