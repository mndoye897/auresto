// ============================================================
// Auresto — Tables & QR Codes (Premium Editor)
// ============================================================

const QR_STORAGE_KEY = 'auresto_qr_design';
const HISTORY_LIMIT = 40;

let selectedTableId = null;
let qrLogoDataUrl = null;
let qrPreviewTimer = null;
let autoSaveTimer = null;
let massGenerateCount = 50;
let previewZoom = 100;
let previewRotation = 0;
let compareMode = false;
let previousDesign = null;
let tableSearchQuery = '';
let tableSortMode = 'name_asc';
let tableFilterMode = 'all';
let editingTableId = null;

const historyStack = { past: [], future: [] };

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const COLOR_PALETTE = [
  '#111111', '#124d58', '#0a566c', '#e8a878', '#ffffff',
  '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'
];

const TEMPLATES = {
  minimal: {
    templateId: 'minimal',
    colorDark: '#111111', colorLight: '#ffffff', paperColor: '#ffffff',
    borderColor: '#111111', borderWidth: 1, radius: 4,
    fontFamily: 'DM Sans', titleColor: '#111111', textColor: '#666666',
    titleSize: 16, textSize: 11, fontWeight: '500', texture: 'none',
    gradientEnabled: false, shadowBlur: 20
  },
  moderne: {
    templateId: 'moderne',
    colorDark: '#124d58', colorLight: '#ffffff', paperColor: '#fafafa',
    borderColor: '#124d58', borderWidth: 2, radius: 16,
    fontFamily: 'Poppins', titleColor: '#124d58', textColor: '#555555',
    titleSize: 20, textSize: 12, fontWeight: '600', texture: 'none',
    gradientEnabled: true, gradientFrom: '#ffffff', gradientTo: '#f0f4f5',
    shadowBlur: 50
  },
  bois: {
    templateId: 'bois',
    colorDark: '#3d2e1f', colorLight: '#faf6f0', paperColor: '#f5ebe0',
    borderColor: '#8b6914', borderWidth: 3, radius: 8,
    fontFamily: 'Georgia', titleColor: '#3d2e1f', textColor: '#6b5344',
    titleSize: 18, texture: 'wood', shadowBlur: 35
  },
  luxe: {
    templateId: 'luxe',
    colorDark: '#1a1a1a', colorLight: '#faf8f5', paperColor: '#1a1a1a',
    borderColor: '#e8a878', borderWidth: 2, radius: 2,
    fontFamily: 'Playfair Display', titleColor: '#e8a878', textColor: '#c4b5a0',
    titleSize: 22, fontWeight: '700', texture: 'none', shadowBlur: 60
  },
  fastfood: {
    templateId: 'fastfood',
    colorDark: '#ef4444', colorLight: '#ffffff', paperColor: '#fffbeb',
    borderColor: '#ef4444', borderWidth: 4, radius: 20,
    fontFamily: 'Poppins', titleColor: '#ef4444', textColor: '#92400e',
    titleSize: 22, fontWeight: '700', moduleShape: 'rounded'
  },
  italien: {
    templateId: 'italien',
    colorDark: '#166534', colorLight: '#ffffff', paperColor: '#fef2f2',
    borderColor: '#166534', borderWidth: 3, radius: 6,
    fontFamily: 'Playfair Display', titleColor: '#166534', textColor: '#444',
    titleSize: 20, gradientEnabled: true, gradientFrom: '#fef2f2', gradientTo: '#fff'
  },
  japonais: {
    templateId: 'japonais',
    colorDark: '#1a1a1a', colorLight: '#ffffff', paperColor: '#fafafa',
    borderColor: '#dc2626', borderWidth: 1, radius: 0,
    fontFamily: 'DM Sans', titleColor: '#1a1a1a', textColor: '#666',
    titleSize: 16, fontWeight: '500', moduleShape: 'square'
  },
  bar: {
    templateId: 'bar',
    colorDark: '#fbbf24', colorLight: '#0f0f0f', paperColor: '#0f0f0f',
    borderColor: '#fbbf24', borderWidth: 2, radius: 12,
    fontFamily: 'Instrument Serif', titleColor: '#fbbf24', textColor: '#a3a3a3',
    titleSize: 24, shadowBlur: 55
  },
  cafe: {
    templateId: 'cafe',
    colorDark: '#78350f', colorLight: '#ffffff', paperColor: '#fef3c7',
    borderColor: '#78350f', borderWidth: 2, radius: 14,
    fontFamily: 'Instrument Serif', titleColor: '#78350f', textColor: '#92400e',
    titleSize: 20, texture: 'paper'
  }
};

// ---------- Helpers ----------

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function showToast(msg) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getDefaultQrDesign() {
  return {
    templateId: 'minimal',
    colorDark: '#111111',
    colorLight: '#ffffff',
    paperColor: '#ffffff',
    borderColor: '#124d58',
    borderWidth: 3,
    radius: 12,
    gradientEnabled: false,
    gradientFrom: '#ffffff',
    gradientTo: '#f5f5f5',
    texture: 'none',
    bgImage: '',
    logoEnabled: true,
    logoSize: 22,
    logoRadius: 0,
    logoShadow: 0,
    logoOpacity: 100,
    logoBg: '#ffffff',
    logoDataUrl: '',
    headerText: 'Table {name}',
    subtitleText: '',
    footerText: 'Scannez pour commander',
    fontFamily: 'DM Sans',
    fontWeight: '700',
    titleSize: 18,
    textSize: 12,
    titleColor: '#124d58',
    textColor: '#555555',
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 1.4,
    textShadow: 0,
    printLayout: 'chevalet',
    previewDecor: 'restaurant',
    qrSize: 160,
    moduleShape: 'square',
    eyeShape: 'square',
    errorCorrection: 'H',
    qrOpacity: 100,
    qrRotation: 0,
    shadowBlur: 40,
    reflection: 0,
    perspective: 0,
    depth: 0,
    blur: 0
  };
}

function getQrDesign() {
  const saved = JSON.parse(localStorage.getItem(QR_STORAGE_KEY) || '{}');
  return { ...getDefaultQrDesign(), ...saved };
}

function saveQrDesign(design, skipHistory) {
  localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(design));
  if (!skipHistory) pushHistory();
  scheduleAutoSave();
}

function getSelectedTable() {
  const data = AurestoStore.load();
  return data.tables.find(t => t.id === selectedTableId) || data.tables[0] || null;
}

function getFilteredTables() {
  let tables = AurestoStore.load().tables || [];
  if (tableSearchQuery) {
    const q = tableSearchQuery.toLowerCase();
    tables = tables.filter(t => t.name.toLowerCase().includes(q));
  }
  if (tableFilterMode === 'ready') tables = tables.filter(() => true);
  if (tableFilterMode === 'empty') tables = [];
  tables.sort((a, b) => {
    if (tableSortMode === 'name_desc') return b.name.localeCompare(a.name, 'fr');
    if (tableSortMode === 'created_desc') return b.id.localeCompare(a.id);
    return a.name.localeCompare(b.name, 'fr');
  });
  return tables;
}

// ---------- History (Undo / Redo) ----------

function pushHistory() {
  const snap = clone(getQrDesign());
  if (historyStack.past.length && JSON.stringify(historyStack.past[historyStack.past.length - 1]) === JSON.stringify(snap)) return;
  historyStack.past.push(snap);
  if (historyStack.past.length > HISTORY_LIMIT) historyStack.past.shift();
  historyStack.future = [];
  updateHistoryButtons();
}

function undo() {
  if (historyStack.past.length < 2) return;
  historyStack.future.unshift(historyStack.past.pop());
  const prev = historyStack.past[historyStack.past.length - 1];
  localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(prev));
  loadDesignIntoControls();
  updatePreview();
  updateHistoryButtons();
  showToast('Modification annulée');
}

function redo() {
  if (!historyStack.future.length) return;
  const next = historyStack.future.shift();
  historyStack.past.push(next);
  localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(next));
  loadDesignIntoControls();
  updatePreview();
  updateHistoryButtons();
  showToast('Modification rétablie');
}

function updateHistoryButtons() {
  const undoBtn = $('#undoBtn');
  const redoBtn = $('#redoBtn');
  if (undoBtn) undoBtn.disabled = historyStack.past.length < 2;
  if (redoBtn) redoBtn.disabled = !historyStack.future.length;
}

// ---------- Auto Save ----------

function scheduleAutoSave() {
  const badge = $('#autoSaveBadge');
  const text = $('#autoSaveText');
  if (badge) { badge.classList.remove('saved'); badge.classList.add('saving'); }
  if (text) text.textContent = 'Enregistrement...';
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    const design = getQrDesign();
    const data = AurestoStore.load();
    data.qrConfig = { ...data.qrConfig, headerTemplate: design.headerText, footerText: design.footerText, printLayout: design.printLayout };
    AurestoStore.save(data);
    if (badge) { badge.classList.remove('saving'); badge.classList.add('saved'); }
    if (text) text.textContent = 'Enregistré automatiquement';
  }, 800);
}

// ---------- Accordions ----------

function initAccordions() {
  $$('.qr-accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const accordion = trigger.closest('.qr-accordion');
      const wasOpen = accordion.classList.contains('open');
      $$('.qr-accordion').forEach(a => a.classList.remove('open'));
      if (!wasOpen) accordion.classList.add('open');
    });
  });
}

function initPanelTabs() {
  $$('.qr-panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.qr-panel-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const panel = $('.qr-panel');
      if (tab.dataset.tab === 'configure') {
        panel.classList.add('mode-configure');
        $$('.qr-accordion').forEach(a => a.classList.remove('open'));
        const exportAcc = document.querySelector('[data-accordion="export"]');
        if (exportAcc) exportAcc.classList.add('open');
      } else {
        panel.classList.remove('mode-configure');
      }
    });
  });
}

// ---------- Templates ----------

function renderTemplates() {
  const grid = $('#templateGrid');
  if (!grid) return;
  const design = getQrDesign();
  const labels = { minimal: 'Minimal', moderne: 'Moderne', bois: 'Bois', luxe: 'Luxe', fastfood: 'Fast Food', italien: 'Italien', japonais: 'Japonais', bar: 'Bar', cafe: 'Café' };
  const icons = { minimal: '◻', moderne: '◆', bois: '🪵', luxe: '✦', fastfood: '🍔', italien: '🍝', japonais: '🍣', bar: '🍸', cafe: '☕' };

  grid.innerHTML = Object.keys(TEMPLATES).map(id => `
    <div class="template-card${design.templateId === id ? ' active' : ''}" data-template="${id}">
      <span class="check-icon"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>
      <div class="template-preview" style="background:${TEMPLATES[id].paperColor};color:${TEMPLATES[id].titleColor}">${icons[id]}</div>
      <span>${labels[id]}</span>
    </div>
  `).join('');

  grid.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => applyTemplate(card.dataset.template));
  });
}

function applyTemplate(id) {
  if (!TEMPLATES[id]) return;
  const current = getQrDesign();
  const merged = { ...current, ...TEMPLATES[id], logoDataUrl: current.logoDataUrl, templateId: id };
  localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(merged));
  if (merged.logoDataUrl) qrLogoDataUrl = merged.logoDataUrl;
  loadDesignIntoControls();
  renderTemplates();
  updatePreview();
  showToast(`Modèle « ${id} » appliqué`);
}

// ---------- Color Pickers ----------

function initColorPickers() {
  const pairs = [
    ['qrColorDark', 'qrColorDarkHex', 'qrColorDarkRgb', 'colorDark'],
    ['qrColorLight', 'qrColorLightHex', 'qrColorLightRgb', 'colorLight'],
    ['qrPaperColor', 'qrPaperColorHex', null, 'paperColor'],
    ['qrBorderColor', 'qrBorderColorHex', null, 'borderColor'],
    ['qrTitleColor', 'qrTitleColorHex', null, 'titleColor'],
    ['qrTextColor', 'qrTextColorHex', null, 'textColor'],
    ['qrGradientFrom', 'qrGradientFromHex', null, 'gradientFrom'],
    ['qrGradientTo', 'qrGradientToHex', null, 'gradientTo'],
    ['qrLogoBg', 'qrLogoBgHex', null, 'logoBg']
  ];

  pairs.forEach(([colorId, hexId, rgbId, key]) => {
    const colorEl = $(`#${colorId}`);
    const hexEl = $(`#${hexId}`);
    if (!colorEl) return;

    const sync = (val, skipHistory) => {
      if (!/^#[0-9a-fA-F]{3,6}$/.test(val)) return;
      colorEl.value = val.length === 4 ? val : val;
      if (hexEl) hexEl.value = val.toUpperCase();
      if (rgbId) {
        const { r, g, b } = hexToRgb(val);
        const rgbEl = $(`#${rgbId}`);
        if (rgbEl) rgbEl.textContent = `${r},${g},${b}`;
      }
      const design = getQrDesign();
      design[key] = val;
      saveQrDesign(design, skipHistory);
      updatePreview();
    };

    colorEl.addEventListener('input', () => sync(colorEl.value));
    if (hexEl) {
      hexEl.addEventListener('change', () => {
        let v = hexEl.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        sync(v);
      });
    }
  });

  const palette = $('#qrColorPalette');
  if (palette) {
    palette.innerHTML = COLOR_PALETTE.map(c =>
      `<button type="button" class="palette-swatch" style="background:${c}" data-color="${c}" title="${c}"></button>`
    ).join('');
    palette.addEventListener('click', e => {
      const swatch = e.target.closest('.palette-swatch');
      if (!swatch) return;
      const colorEl = $('#qrColorDark');
      if (colorEl) {
        colorEl.value = swatch.dataset.color;
        colorEl.dispatchEvent(new Event('input'));
      }
    });
  }
}

function initSegmentedGroups() {
  const groups = [
    ['moduleShapeGroup', 'moduleShape'],
    ['eyeShapeGroup', 'eyeShape'],
    ['textAlignGroup', 'textAlign']
  ];
  groups.forEach(([groupId, key]) => {
    const group = $(`#${groupId}`);
    if (!group) return;
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const design = getQrDesign();
        design[key] = btn.dataset.value;
        saveQrDesign(design);
        updatePreview();
      });
    });
  });
}

// ---------- Table Management ----------

function renderTables() {
  const tables = getFilteredTables();
  const allTables = AurestoStore.load().tables || [];
  const grid = $('#tablesGrid');
  const count = $('#qrTableCount');
  const stripCount = $('#tableStripCount');

  if (count) count.textContent = `${allTables.length} table${allTables.length > 1 ? 's' : ''} configurée${allTables.length > 1 ? 's' : ''}`;
  if (stripCount) stripCount.textContent = `${allTables.length} table${allTables.length > 1 ? 's' : ''}`;

  if (!grid) return;

  if (!tables.length) {
    grid.innerHTML = '<div class="qr-empty-tables">Aucune table trouvée. Ajoutez votre première table.</div>';
    renderTableStrip();
    return;
  }

  grid.innerHTML = tables.map(table => {
    const sel = table.id === selectedTableId;
    return `
      <div class="qr-table-card${sel ? ' selected' : ''}" data-table-id="${table.id}">
        <div class="qr-table-card-info">
          <div class="qr-table-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/></svg>
          </div>
          <div>
            <strong>${escapeHtml(table.name)}</strong>
            <span class="qr-table-status"><span class="qr-table-status-dot"></span>Prêt</span>
          </div>
        </div>
        <div class="qr-table-actions">
          <button type="button" class="qr-table-action-btn" data-edit-table="${table.id}" title="Renommer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
          <button type="button" class="qr-table-action-btn" data-dup-table="${table.id}" title="Dupliquer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
          <button type="button" class="qr-table-action-btn" data-dl-table="${table.id}" title="Télécharger"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>
          <button type="button" class="qr-table-action-btn danger" data-delete-table="${table.id}" title="Supprimer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg></button>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.qr-table-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      selectedTableId = card.dataset.tableId;
      renderTables();
      updatePreview();
    });
  });

  bindTableActions(grid);
  renderTableStrip();
}

function bindTableActions(container) {
  container.querySelectorAll('[data-delete-table]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const table = AurestoStore.load().tables.find(t => t.id === btn.dataset.deleteTable);
      if (table && confirm(`Supprimer « ${table.name} » ?`)) {
        AurestoStore.removeTable(table.id);
        if (selectedTableId === table.id) selectedTableId = null;
        renderTables();
        updatePreview();
        showToast(`Table « ${table.name} » supprimée`);
      }
    });
  });

  container.querySelectorAll('[data-edit-table]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      editingTableId = btn.dataset.editTable;
      const table = AurestoStore.load().tables.find(t => t.id === editingTableId);
      if (!table) return;
      $('#tableModalTitle').textContent = 'Renommer la table';
      $('#newTableName').value = table.name;
      $('#addTableModal').hidden = false;
      setTimeout(() => $('#newTableName').focus(), 100);
    });
  });

  container.querySelectorAll('[data-dup-table]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      AurestoStore.duplicateTable(btn.dataset.dupTable);
      const data = AurestoStore.load();
      selectedTableId = data.tables[data.tables.length - 1]?.id;
      renderTables();
      updatePreview();
      showToast('Table dupliquée');
    });
  });

  container.querySelectorAll('[data-dl-table]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const table = AurestoStore.load().tables.find(t => t.id === btn.dataset.dlTable);
      if (table) await downloadTablePng(table);
    });
  });
}

async function renderTableStrip() {
  const strip = $('#tableCardsStrip');
  if (!strip) return;
  const tables = AurestoStore.load().tables || [];
  const design = getQrDesign();

  strip.innerHTML = tables.map(table => {
    const active = table.id === selectedTableId;
    return `
      <div class="table-strip-card${active ? ' active' : ''}" data-table-id="${table.id}">
        <div class="strip-name">${escapeHtml(table.name)}</div>
        <span class="qr-table-status"><span class="qr-table-status-dot"></span>Prêt</span>
        <div class="mini-qr" data-mini-qr="${table.id}"></div>
        <div class="strip-actions">
          <button type="button" class="strip-action" data-strip-dl="${table.id}" title="Télécharger"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/></svg></button>
          <button type="button" class="strip-action" data-strip-edit="${table.id}" title="Renommer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
          <button type="button" class="strip-action" data-strip-del="${table.id}" title="Supprimer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/></svg></button>
        </div>
      </div>`;
  }).join('') + `
    <button type="button" class="table-add-card" id="stripAddTableBtn">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
      Ajouter
    </button>`;

  for (const table of tables) {
    const wrap = strip.querySelector(`[data-mini-qr="${table.id}"]`);
    if (!wrap) continue;
    const url = AurestoStore.getTableUrl(table.id);
    let canvas = await generateQrCanvas(url, 56, design.colorDark, design.colorLight, design.errorCorrection);
    canvas = stylizeQrCanvas(canvas, design);
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    wrap.appendChild(canvas);
  }

  strip.querySelectorAll('.table-strip-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      selectedTableId = card.dataset.tableId;
      renderTables();
      updatePreview();
    });
  });

  strip.querySelectorAll('[data-strip-dl]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const table = AurestoStore.load().tables.find(t => t.id === btn.dataset.stripDl);
      if (table) await downloadTablePng(table);
    });
  });

  strip.querySelectorAll('[data-strip-edit]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      editingTableId = btn.dataset.stripEdit;
      const table = AurestoStore.load().tables.find(t => t.id === editingTableId);
      if (!table) return;
      $('#tableModalTitle').textContent = 'Renommer la table';
      $('#newTableName').value = table.name;
      $('#addTableModal').hidden = false;
    });
  });

  strip.querySelectorAll('[data-strip-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const table = AurestoStore.load().tables.find(t => t.id === btn.dataset.stripDel);
      if (table && confirm(`Supprimer « ${table.name} » ?`)) {
        AurestoStore.removeTable(table.id);
        if (selectedTableId === table.id) selectedTableId = null;
        renderTables();
        updatePreview();
      }
    });
  });

  $('#stripAddTableBtn')?.addEventListener('click', openAddTableModal);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openAddTableModal() {
  editingTableId = null;
  $('#tableModalTitle').textContent = 'Ajouter une table';
  $('#newTableName').value = '';
  $('#addTableModal').hidden = false;
  setTimeout(() => $('#newTableName').focus(), 100);
}

function closeAddTableModal() {
  $('#addTableModal').hidden = true;
  editingTableId = null;
}

function addTable() {
  const name = $('#newTableName').value.trim();
  if (!name) { showToast('Veuillez entrer un nom'); return; }

  if (editingTableId) {
    AurestoStore.updateTable(editingTableId, { name });
    closeAddTableModal();
    renderTables();
    updatePreview();
    showToast(`Table renommée « ${name} »`);
    return;
  }

  AurestoStore.addTable(name);
  const data = AurestoStore.load();
  selectedTableId = data.tables[data.tables.length - 1].id;
  closeAddTableModal();
  renderTables();
  updatePreview();
  showToast(`Table « ${name} » ajoutée`);
}

function massGenerateTables() {
  const prefix = ($('#massPrefixInput')?.value || 'Table').trim();
  const suffix = ($('#massSuffixInput')?.value || '').trim();
  const count = massGenerateCount;
  const names = [];
  for (let i = 1; i <= count; i++) {
    names.push(`${prefix} ${i}${suffix ? ' ' + suffix : ''}`);
  }
  AurestoStore.addTablesBulk(names);
  const data = AurestoStore.load();
  selectedTableId = data.tables[data.tables.length - 1]?.id;
  renderTables();
  updatePreview();
  showToast(`${count} tables créées`);
}

// ---------- QR Generation ----------

function getErrorLevel(level) {
  if (typeof QRCode === 'undefined') return 2;
  const map = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };
  return map[level] || QRCode.CorrectLevel.H;
}

function generateQrCanvas(url, size, colorDark, colorLight, errorCorrection) {
  return new Promise(resolve => {
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(tempDiv);
    try {
      if (typeof QRCode !== 'undefined') {
        new QRCode(tempDiv, {
          text: url, width: size, height: size,
          colorDark: colorDark || '#111', colorLight: colorLight || '#fff',
          correctLevel: getErrorLevel(errorCorrection || 'H')
        });
        setTimeout(() => {
          const src = tempDiv.querySelector('canvas');
          resolve(src || createFallbackCanvas(size));
          tempDiv.remove();
        }, 80);
      } else {
        resolve(createFallbackCanvas(size));
        tempDiv.remove();
      }
    } catch {
      resolve(createFallbackCanvas(size));
      tempDiv.remove();
    }
  });
}

function createFallbackCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#111'; ctx.font = '700 12px sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('QR', size / 2, size / 2);
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function stylizeQrCanvas(sourceCanvas, design) {
  const { moduleShape, qrOpacity, colorDark, colorLight } = design;
  const w = sourceCanvas.width;
  const srcCtx = sourceCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, w, w);

  let moduleSize = 1;
  for (let x = 1; x < w; x++) {
    const curr = srcData.data[x * 4];
    const prev = srcData.data[(x - 1) * 4];
    if (Math.abs(curr - prev) > 100) { moduleSize = x; break; }
  }
  if (moduleSize < 2) moduleSize = Math.max(4, Math.round(w / 29));

  const out = document.createElement('canvas');
  out.width = w; out.height = w;
  const ctx = out.getContext('2d');
  ctx.fillStyle = colorLight || '#fff';
  ctx.fillRect(0, 0, w, w);
  ctx.globalAlpha = (qrOpacity || 100) / 100;
  ctx.fillStyle = colorDark || '#111';

  const modules = Math.floor(w / moduleSize);
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      const px = Math.min(col * moduleSize + Math.floor(moduleSize / 2), w - 1);
      const py = Math.min(row * moduleSize + Math.floor(moduleSize / 2), w - 1);
      if (srcData.data[(py * w + px) * 4] >= 128) continue;
      const x = col * moduleSize;
      const y = row * moduleSize;
      const ms = moduleSize - 0.5;
      if (moduleShape === 'dots') {
        ctx.beginPath();
        ctx.arc(x + ms / 2, y + ms / 2, ms / 2 * 0.82, 0, Math.PI * 2);
        ctx.fill();
      } else if (moduleShape === 'rounded') {
        roundRect(ctx, x + 0.5, y + 0.5, ms, ms, ms * 0.35);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, ms, ms);
      }
    }
  }
  ctx.globalAlpha = 1;
  return out;
}

function drawLogoOnCanvas(canvas, logoDataUrl, design) {
  return new Promise(resolve => {
    if (!logoDataUrl || !design.logoEnabled) { resolve(canvas); return; }
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      const size = canvas.width;
      const logoSize = Math.round(size * (design.logoSize / 100));
      const x = (size - logoSize) / 2;
      const y = (size - logoSize) / 2;
      const padding = Math.round(logoSize * 0.12);
      ctx.globalAlpha = (design.logoOpacity || 100) / 100;
      ctx.fillStyle = design.logoBg || '#fff';
      const r = design.logoRadius || 0;
      if (r > 0) {
        roundRect(ctx, x - padding, y - padding, logoSize + padding * 2, logoSize + padding * 2, r);
        ctx.fill();
      } else {
        ctx.fillRect(x - padding, y - padding, logoSize + padding * 2, logoSize + padding * 2);
      }
      if (design.logoShadow > 0) {
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = design.logoShadow;
      }
      if (r > 0) {
        ctx.save();
        roundRect(ctx, x, y, logoSize, logoSize, r);
        ctx.clip();
        ctx.drawImage(img, x, y, logoSize, logoSize);
        ctx.restore();
      } else {
        ctx.drawImage(img, x, y, logoSize, logoSize);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      resolve(canvas);
    };
    img.onerror = () => resolve(canvas);
    img.src = logoDataUrl;
  });
}

// ---------- Preview ----------

function updatePreview() {
  const design = getQrDesign();
  const table = getSelectedTable();
  const paper = $('#qrPaper');
  const stage = $('#qrPreviewStage');
  const inner = $('#previewStageInner');
  const skeleton = $('#previewSkeleton');

  if (!paper) return;

  paper.style.setProperty('--qr-paper-bg', design.paperColor);
  paper.style.setProperty('--qr-border-color', design.borderColor);
  paper.style.setProperty('--qr-border-width', `${design.borderWidth}px`);
  paper.style.setProperty('--qr-radius', `${design.radius}px`);
  paper.style.setProperty('--qr-font', `"${design.fontFamily}", sans-serif`);
  paper.style.setProperty('--qr-title-size', `${design.titleSize}px`);
  paper.style.setProperty('--qr-text-size', `${design.textSize}px`);
  paper.style.setProperty('--qr-title-color', design.titleColor);
  paper.style.setProperty('--qr-text-color', design.textColor);
  paper.style.setProperty('--qr-text-align', design.textAlign);
  paper.style.setProperty('--qr-letter-spacing', `${design.letterSpacing}px`);
  paper.style.setProperty('--qr-gradient-from', design.gradientFrom);
  paper.style.setProperty('--qr-gradient-to', design.gradientTo);

  paper.dataset.layout = design.printLayout;
  paper.classList.toggle('gradient-bg', design.gradientEnabled);
  paper.classList.remove('texture-wood', 'texture-marble', 'texture-paper', 'texture-linen');
  if (design.texture !== 'none') paper.classList.add(`texture-${design.texture}`);

  const shadow = design.shadowBlur || 0;
  const depth = design.depth || 0;
  paper.style.boxShadow = `${depth}px ${depth + 4}px ${shadow}px rgba(0,0,0,0.35)`;
  paper.style.filter = design.blur ? `blur(${design.blur}px)` : '';

  const persp = design.perspective || 0;
  const rot = (design.qrRotation || 0) + previewRotation;
  paper.style.transform = `perspective(800px) rotateX(${persp}deg) rotate(${rot}deg)`;

  if (stage) stage.dataset.decor = design.previewDecor || 'restaurant';
  if (inner) inner.style.transform = `scale(${previewZoom / 100})`;

  const reflection = $('#paperReflection');
  if (reflection) reflection.style.opacity = (design.reflection || 0) / 100;

  const title = $('#qrPreviewTitle');
  const subtitle = $('#qrPreviewSubtitle');
  const footer = $('#qrPreviewFooter');
  if (title) {
    title.textContent = table ? design.headerText.replace('{name}', table.name) : 'Aucune table';
    title.style.fontWeight = design.fontWeight;
    title.style.textShadow = design.textShadow ? `0 1px ${design.textShadow}px rgba(0,0,0,0.2)` : '';
    title.style.lineHeight = design.lineHeight;
  }
  if (subtitle) {
    subtitle.textContent = design.subtitleText || '';
    subtitle.style.display = design.subtitleText ? 'block' : 'none';
  }
  if (footer) {
    footer.textContent = design.footerText;
    footer.style.textShadow = design.textShadow ? `0 1px ${design.textShadow}px rgba(0,0,0,0.15)` : '';
  }

  const logoPreview = $('#qrLogoPreview');
  if (logoPreview) logoPreview.src = qrLogoDataUrl || 'favicon.svg';

  syncSupportTabs(design.printLayout);
  checkAccessibility(design);

  if (!table) return;

  if (skeleton) skeleton.classList.remove('hidden');
  clearTimeout(qrPreviewTimer);
  qrPreviewTimer = setTimeout(async () => {
    const url = AurestoStore.getTableUrl(table.id);
    const qrSize = Number(design.qrSize) || 160;
    let canvas = await generateQrCanvas(url, qrSize, design.colorDark, design.colorLight, design.errorCorrection);
    canvas = stylizeQrCanvas(canvas, design);
    if (design.logoEnabled && qrLogoDataUrl) {
      canvas = await drawLogoOnCanvas(canvas, qrLogoDataUrl, design);
    }
    const previewCanvas = $('#qrPreviewCanvas');
    if (previewCanvas) {
      previewCanvas.width = qrSize;
      previewCanvas.height = qrSize;
      previewCanvas.getContext('2d').drawImage(canvas, 0, 0);
    }
    if (skeleton) skeleton.classList.add('hidden');
  }, 120);
}

function syncSupportTabs(layout) {
  $$('.support-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.support === layout);
  });
}

function checkAccessibility(design) {
  const container = $('#a11yWarnings');
  if (!container) return;
  const warnings = [];
  const contrast = contrastRatio(design.colorDark, design.colorLight);
  if (contrast < 3) warnings.push({ type: 'error', msg: 'Contraste insuffisant entre le QR et son fond — risque de scan difficile' });
  else if (contrast < 4.5) warnings.push({ type: 'warn', msg: 'Contraste faible — vérifiez la lisibilité du QR code' });
  if (design.logoEnabled && design.logoSize > 30) warnings.push({ type: 'warn', msg: 'Logo trop grand — peut empêcher le scan du QR code' });
  if (design.logoEnabled && design.logoSize > 35) warnings.push({ type: 'error', msg: 'Logo excessivement grand — QR difficilement scannable' });
  const paperContrast = contrastRatio(design.titleColor, design.paperColor);
  if (paperContrast < 3) warnings.push({ type: 'warn', msg: 'Texte peu lisible sur le fond choisi' });
  if (design.qrOpacity < 60) warnings.push({ type: 'warn', msg: 'Opacité du QR trop basse pour un scan fiable' });

  container.innerHTML = warnings.map(w => `
    <div class="a11y-warning ${w.type}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
      ${w.msg}
    </div>`).join('');
}

// ---------- Export ----------

async function generateQrCardCanvas(table, design) {
  const url = AurestoStore.getTableUrl(table.id);
  const qrSize = Number(design.qrSize) || 200;
  let qrCanvas = await generateQrCanvas(url, qrSize, design.colorDark, design.colorLight, design.errorCorrection);
  qrCanvas = stylizeQrCanvas(qrCanvas, design);
  if (design.logoEnabled && (design.logoDataUrl || qrLogoDataUrl)) {
    qrCanvas = await drawLogoOnCanvas(qrCanvas, design.logoDataUrl || qrLogoDataUrl, design);
  }

  const padding = 40;
  const subH = design.subtitleText ? 24 : 0;
  const titleH = 50;
  const footerH = 40;
  const cardW = qrSize + padding * 2;
  const cardH = qrSize + padding * 2 + titleH + footerH + subH;
  const card = document.createElement('canvas');
  card.width = cardW; card.height = cardH;
  const ctx = card.getContext('2d');

  if (design.gradientEnabled) {
    const grad = ctx.createLinearGradient(0, 0, cardW, cardH);
    grad.addColorStop(0, design.gradientFrom);
    grad.addColorStop(1, design.gradientTo);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = design.paperColor;
  }
  ctx.fillRect(0, 0, cardW, cardH);

  if (design.borderWidth > 0) {
    ctx.strokeStyle = design.borderColor;
    ctx.lineWidth = design.borderWidth;
    ctx.strokeRect(design.borderWidth / 2, design.borderWidth / 2, cardW - design.borderWidth, cardH - design.borderWidth);
  }

  let yOff = padding;
  if (design.subtitleText) {
    ctx.fillStyle = design.textColor;
    ctx.font = `${design.textSize}px "${design.fontFamily}", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(design.subtitleText, cardW / 2, yOff + 12);
    yOff += subH;
  }

  ctx.fillStyle = design.titleColor;
  ctx.font = `${design.fontWeight} ${design.titleSize + 4}px "${design.fontFamily}", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(design.headerText.replace('{name}', table.name), cardW / 2, yOff + titleH / 2);
  ctx.drawImage(qrCanvas, padding, yOff + titleH, qrSize, qrSize);

  ctx.fillStyle = design.textColor;
  ctx.font = `${design.textSize + 2}px "${design.fontFamily}", sans-serif`;
  ctx.fillText(design.footerText, cardW / 2, yOff + titleH + qrSize + footerH / 2);

  return card;
}

async function downloadTablePng(table) {
  const design = getQrDesign();
  const card = await generateQrCardCanvas(table, design);
  const link = document.createElement('a');
  link.href = card.toDataURL('image/png');
  link.download = `auresto-qr-${table.name.replace(/\s+/g, '-').toLowerCase()}.png`;
  link.click();
  showToast(`PNG « ${table.name} » téléchargé`);
}

async function downloadPng() {
  const table = getSelectedTable();
  if (!table) { showToast('Sélectionnez une table'); return; }
  await downloadTablePng(table);
}

async function downloadJpg() {
  const table = getSelectedTable();
  if (!table) { showToast('Sélectionnez une table'); return; }
  const card = await generateQrCardCanvas(table, getQrDesign());
  const link = document.createElement('a');
  link.href = card.toDataURL('image/jpeg', 0.92);
  link.download = `auresto-qr-${table.name.replace(/\s+/g, '-').toLowerCase()}.jpg`;
  link.click();
  showToast('JPG téléchargé');
}

async function downloadSvg() {
  const table = getSelectedTable();
  if (!table) { showToast('Sélectionnez une table'); return; }
  const design = getQrDesign();
  const url = AurestoStore.getTableUrl(table.id);
  const title = design.headerText.replace('{name}', table.name);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
  <rect width="400" height="500" fill="${design.paperColor}" rx="${design.radius}"/>
  <text x="200" y="60" text-anchor="middle" fill="${design.titleColor}" font-family="${design.fontFamily}" font-size="${design.titleSize + 4}" font-weight="${design.fontWeight}">${title}</text>
  <text x="200" y="460" text-anchor="middle" fill="${design.textColor}" font-family="${design.fontFamily}" font-size="${design.textSize + 2}">${design.footerText}</text>
  <foreignObject x="100" y="100" width="200" height="200"><div xmlns="http://www.w3.org/1999/xhtml"><img src="${url}" width="200" height="200"/></div></foreignObject>
</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `auresto-qr-${table.name.replace(/\s+/g, '-').toLowerCase()}.svg`;
  link.click();
  showToast('SVG téléchargé');
}

async function downloadPdf() {
  const tables = AurestoStore.load().tables || [];
  if (!tables.length) { showToast('Ajoutez d\'abord une table'); return; }
  if (!window.jspdf) { showToast('Générateur PDF indisponible'); return; }
  showToast('Génération PDF...');
  const { jsPDF } = window.jspdf;
  const data = AurestoStore.load();
  const design = getQrDesign();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(16);
  doc.setTextColor(18, 77, 88);
  doc.text(data.restaurant.name || 'Auresto', 105, 18, { align: 'center' });
  let y = 38;
  for (const table of tables) {
    if (y > 250) { doc.addPage(); y = 20; }
    const card = await generateQrCardCanvas(table, design);
    const aspect = card.width / card.height;
    const w = 80;
    doc.addImage(card.toDataURL('image/png'), 'PNG', 65, y, w, w / aspect);
    y += w / aspect + 12;
  }
  doc.save(`auresto-qr-${data.restaurant.name || 'restaurant'}.pdf`);
  showToast('PDF téléchargé');
}

async function downloadWord() {
  const tables = AurestoStore.load().tables || [];
  if (!tables.length) { showToast('Ajoutez d\'abord une table'); return; }
  showToast('Génération Word...');
  const design = getQrDesign();
  const cards = await Promise.all(tables.map(async table => {
    const card = await generateQrCardCanvas(table, design);
    const img = card.toDataURL('image/png');
    const title = design.headerText.replace('{name}', table.name);
    return `<section style="margin:20px;padding:20px;border:${design.borderWidth}px solid ${design.borderColor};border-radius:${design.radius}px;background:${design.paperColor};text-align:center;page-break-after:always;"><h2 style="font-family:'${design.fontFamily}';color:${design.titleColor};">${title}</h2><img src="${img}" style="max-width:300px;"/><p style="color:${design.textColor};">${design.footerText}</p></section>`;
  }));
  const blob = new Blob([`<!doctype html><html><head><meta charset="utf-8"></head><body>${cards.join('')}</body></html>`], { type: 'application/msword' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `auresto-qr-${AurestoStore.load().restaurant.name || 'restaurant'}.doc`;
  link.click();
  showToast('Word téléchargé');
}

async function downloadZip(selectedOnly) {
  const tables = selectedOnly
    ? [getSelectedTable()].filter(Boolean)
    : AurestoStore.load().tables || [];
  if (!tables.length) { showToast('Aucune table à exporter'); return; }
  if (!window.JSZip) { showToast('JSZip indisponible'); return; }
  showToast('Génération ZIP...');
  const zip = new JSZip();
  const design = getQrDesign();
  for (const table of tables) {
    const card = await generateQrCardCanvas(table, design);
    const data = card.toDataURL('image/png').split(',')[1];
    zip.file(`qr-${table.name.replace(/\s+/g, '-').toLowerCase()}.png`, data, { base64: true });
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `auresto-qr-codes.zip`;
  link.click();
  showToast('ZIP téléchargé');
}

function saveConfig() {
  saveQrDesign(getQrDesign());
  showToast('Configuration enregistrée');
}

// ---------- Controls Binding ----------

function bindDesignControls() {
  const setDesign = (key, val) => {
    const design = getQrDesign();
    design[key] = val;
    saveQrDesign(design);
    updatePreview();
  };

  const ranges = [
    ['qrBorderWidth', 'qrBorderWidthVal', 'px', 'borderWidth'],
    ['qrRadius', 'qrRadiusVal', 'px', 'radius'],
    ['qrLogoSize', 'qrLogoSizeVal', '%', 'logoSize'],
    ['qrLogoRadius', 'qrLogoRadiusVal', 'px', 'logoRadius'],
    ['qrLogoShadow', 'qrLogoShadowVal', '', 'logoShadow'],
    ['qrLogoOpacity', 'qrLogoOpacityVal', '%', 'logoOpacity'],
    ['qrTitleSize', 'qrTitleSizeVal', 'px', 'titleSize'],
    ['qrTextSize', 'qrTextSizeVal', 'px', 'textSize'],
    ['qrSize', 'qrSizeVal', 'px', 'qrSize'],
    ['qrOpacity', 'qrOpacityVal', '%', 'qrOpacity'],
    ['qrRotation', 'qrRotationVal', '°', 'qrRotation'],
    ['qrLetterSpacing', 'qrLetterSpacingVal', 'px', 'letterSpacing'],
    ['qrLineHeight', 'qrLineHeightVal', '', 'lineHeight'],
    ['qrTextShadow', 'qrTextShadowVal', '', 'textShadow'],
    ['qrShadowBlur', 'qrShadowBlurVal', 'px', 'shadowBlur'],
    ['qrReflection', 'qrReflectionVal', '%', 'reflection'],
    ['qrPerspective', 'qrPerspectiveVal', '°', 'perspective'],
    ['qrDepth', 'qrDepthVal', '', 'depth'],
    ['qrBlur', 'qrBlurVal', 'px', 'blur']
  ];

  ranges.forEach(([id, outId, suffix, key]) => {
    const el = $(`#${id}`);
    const out = $(`#${outId}`);
    if (!el) return;
    el.addEventListener('input', () => {
      const suffixVal = key === 'lineHeight' ? el.value : `${el.value}${suffix}`;
      if (out) out.textContent = suffixVal;
      setDesign(key, key === 'lineHeight' ? Number(el.value) : Number(el.value));
    });
  });

  const texts = [
    ['qrHeaderText', 'headerText'], ['qrSubtitleText', 'subtitleText'],
    ['qrFooterText', 'footerText']
  ];
  texts.forEach(([id, key]) => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('input', () => setDesign(key, el.value));
  });

  const selects = [
    ['qrFontFamily', 'fontFamily'], ['qrPrintLayout', 'printLayout'],
    ['qrFontWeight', 'fontWeight'], ['qrErrorCorrection', 'errorCorrection'],
    ['qrTexture', 'texture']
  ];
  selects.forEach(([id, key]) => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('change', () => {
      setDesign(key, el.value);
      if (key === 'printLayout') syncSupportTabs(el.value);
    });
  });

  const checks = [
    ['qrLogoEnabled', 'logoEnabled'], ['qrGradientEnabled', 'gradientEnabled']
  ];
  checks.forEach(([id, key]) => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('change', () => setDesign(key, el.checked));
  });

  $('#qrLogoInput')?.addEventListener('change', e => {
    const [file] = e.target.files;
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Image max 2 Mo'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      qrLogoDataUrl = reader.result;
      setDesign('logoDataUrl', qrLogoDataUrl);
      $('#qrLogoPreview').src = qrLogoDataUrl;
      showToast('Logo importé');
    };
    reader.readAsDataURL(file);
  });

  $('#qrLogoRemoveBtn')?.addEventListener('click', () => {
    qrLogoDataUrl = null;
    setDesign('logoDataUrl', '');
    $('#qrLogoPreview').src = 'favicon.svg';
    $('#qrLogoInput').value = '';
    showToast('Logo supprimé');
  });

  $('#tableSearchInput')?.addEventListener('input', e => { tableSearchQuery = e.target.value; renderTables(); });
  $('#tableSortSelect')?.addEventListener('change', e => { tableSortMode = e.target.value; renderTables(); });
  $('#tableFilterSelect')?.addEventListener('change', e => { tableFilterMode = e.target.value; renderTables(); });

  $$('.mass-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.mass-count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      massGenerateCount = Number(btn.dataset.count);
    });
  });
  $('#massGenerateBtn')?.addEventListener('click', massGenerateTables);

  $$('.support-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setDesign('printLayout', tab.dataset.support);
      const sel = $('#qrPrintLayout');
      if (sel) sel.value = tab.dataset.support;
    });
  });

  $$('.decor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.decor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setDesign('previewDecor', tab.dataset.decor);
    });
  });

  $('#zoomInBtn')?.addEventListener('click', () => { previewZoom = Math.min(200, previewZoom + 10); $('#previewZoomVal').textContent = `${previewZoom}%`; updatePreview(); });
  $('#zoomOutBtn')?.addEventListener('click', () => { previewZoom = Math.max(50, previewZoom - 10); $('#previewZoomVal').textContent = `${previewZoom}%`; updatePreview(); });
  $('#rotatePreviewBtn')?.addEventListener('click', () => { previewRotation = (previewRotation + 15) % 360; updatePreview(); });

  $('#resetDesignBtn')?.addEventListener('click', () => {
    if (confirm('Réinitialiser le design ?')) {
      localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(getDefaultQrDesign()));
      qrLogoDataUrl = null;
      loadDesignIntoControls();
      renderTemplates();
      updatePreview();
      showToast('Design réinitialisé');
    }
  });

  $('#compareToggleBtn')?.addEventListener('click', () => {
    compareMode = !compareMode;
    $('#qrPreviewStage')?.classList.toggle('compare-mode', compareMode);
    showToast(compareMode ? 'Mode comparaison activé' : 'Mode comparaison désactivé');
  });

  $('#previewFullscreenBtn')?.addEventListener('click', () => {
    const clone = $('#fullscreenPreviewClone');
    const scene = $('#mockupScene');
    if (clone && scene) {
      clone.innerHTML = '';
      clone.appendChild(scene.cloneNode(true));
      $('#fullscreenPreviewModal').hidden = false;
    }
  });
  $('#closeFullscreenBtn')?.addEventListener('click', () => { $('#fullscreenPreviewModal').hidden = true; });

  $('#undoBtn')?.addEventListener('click', undo);
  $('#redoBtn')?.addEventListener('click', redo);

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
  });
}

function loadDesignIntoControls() {
  const d = getQrDesign();

  const setVal = (id, val) => { const el = $(`#${id}`); if (el) el.value = val; };
  const setText = (id, val) => { const el = $(`#${id}`); if (el) el.textContent = val; };
  const setCheck = (id, val) => { const el = $(`#${id}`); if (el) el.checked = val; };

  setVal('qrColorDark', d.colorDark);
  setVal('qrColorDarkHex', d.colorDark.toUpperCase());
  setVal('qrColorLight', d.colorLight);
  setVal('qrColorLightHex', d.colorLight.toUpperCase());
  const dr = hexToRgb(d.colorDark);
  setText('qrColorDarkRgb', `${dr.r},${dr.g},${dr.b}`);
  const lr = hexToRgb(d.colorLight);
  setText('qrColorLightRgb', `${lr.r},${lr.g},${lr.b}`);

  setVal('qrPaperColor', d.paperColor);
  setVal('qrPaperColorHex', d.paperColor.toUpperCase());
  setVal('qrBorderColor', d.borderColor);
  setVal('qrBorderColorHex', d.borderColor.toUpperCase());
  setVal('qrTitleColor', d.titleColor);
  setVal('qrTitleColorHex', d.titleColor.toUpperCase());
  setVal('qrTextColor', d.textColor);
  setVal('qrTextColorHex', d.textColor.toUpperCase());
  setVal('qrGradientFrom', d.gradientFrom);
  setVal('qrGradientFromHex', d.gradientFrom.toUpperCase());
  setVal('qrGradientTo', d.gradientTo);
  setVal('qrGradientToHex', d.gradientTo.toUpperCase());
  setVal('qrLogoBg', d.logoBg);
  setVal('qrLogoBgHex', d.logoBg.toUpperCase());

  const rangeFields = [
    ['qrBorderWidth', 'qrBorderWidthVal', 'borderWidth', v => `${v}px`],
    ['qrRadius', 'qrRadiusVal', 'radius', v => `${v}px`],
    ['qrLogoSize', 'qrLogoSizeVal', 'logoSize', v => `${v}%`],
    ['qrLogoRadius', 'qrLogoRadiusVal', 'logoRadius', v => `${v}px`],
    ['qrLogoShadow', 'qrLogoShadowVal', 'logoShadow', v => `${v}`],
    ['qrLogoOpacity', 'qrLogoOpacityVal', 'logoOpacity', v => `${v}%`],
    ['qrTitleSize', 'qrTitleSizeVal', 'titleSize', v => `${v}px`],
    ['qrTextSize', 'qrTextSizeVal', 'textSize', v => `${v}px`],
    ['qrSize', 'qrSizeVal', 'qrSize', v => `${v}px`],
    ['qrOpacity', 'qrOpacityVal', 'qrOpacity', v => `${v}%`],
    ['qrRotation', 'qrRotationVal', 'qrRotation', v => `${v}°`],
    ['qrLetterSpacing', 'qrLetterSpacingVal', 'letterSpacing', v => `${v}px`],
    ['qrLineHeight', 'qrLineHeightVal', 'lineHeight', v => `${v}`],
    ['qrTextShadow', 'qrTextShadowVal', 'textShadow', v => `${v}`],
    ['qrShadowBlur', 'qrShadowBlurVal', 'shadowBlur', v => `${v}px`],
    ['qrReflection', 'qrReflectionVal', 'reflection', v => `${v}%`],
    ['qrPerspective', 'qrPerspectiveVal', 'perspective', v => `${v}°`],
    ['qrDepth', 'qrDepthVal', 'depth', v => `${v}`],
    ['qrBlur', 'qrBlurVal', 'blur', v => `${v}px`]
  ];
  rangeFields.forEach(([inputId, outId, key, fmt]) => {
    setVal(inputId, d[key]);
    setText(outId, fmt(d[key]));
  });

  setVal('qrHeaderText', d.headerText);
  setVal('qrSubtitleText', d.subtitleText);
  setVal('qrFooterText', d.footerText);
  setVal('qrFontFamily', d.fontFamily);
  setVal('qrFontWeight', d.fontWeight);
  setVal('qrPrintLayout', d.printLayout);
  setVal('qrErrorCorrection', d.errorCorrection);
  setVal('qrTexture', d.texture);
  setCheck('qrLogoEnabled', d.logoEnabled);
  setCheck('qrGradientEnabled', d.gradientEnabled);

  [['moduleShapeGroup', 'moduleShape'], ['eyeShapeGroup', 'eyeShape'], ['textAlignGroup', 'textAlign']].forEach(([gid, key]) => {
    const g = $(`#${gid}`);
    if (g) g.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.value === d[key]));
  });

  if (d.logoDataUrl) {
    qrLogoDataUrl = d.logoDataUrl;
    const lp = $('#qrLogoPreview');
    if (lp) lp.src = d.logoDataUrl;
  }

  $$('.decor-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.decor === (d.previewDecor || 'restaurant'));
  });
}

// ---------- Init ----------

function init() {
  const data = AurestoStore.load();
  $('#qrPlanTitle').textContent = data.plan ? `👑 ${data.plan}` : '👑 Free';

  pushHistory();
  loadDesignIntoControls();
  initAccordions();
  initPanelTabs();
  initColorPickers();
  initSegmentedGroups();
  renderTemplates();

  if (!selectedTableId && data.tables?.length) selectedTableId = data.tables[0].id;

  renderTables();
  updatePreview();
  bindDesignControls();

  $('#addTableBtn')?.addEventListener('click', openAddTableModal);
  $('#closeAddTableModalBtn')?.addEventListener('click', closeAddTableModal);
  $('#cancelAddTableModalBtn')?.addEventListener('click', closeAddTableModal);
  $('#confirmAddTableBtn')?.addEventListener('click', addTable);
  $('#addTableModal')?.addEventListener('click', e => { if (e.target === $('#addTableModal')) closeAddTableModal(); });
  $('#newTableName')?.addEventListener('keydown', e => { if (e.key === 'Enter') addTable(); });

  $('#saveQrConfigBtn')?.addEventListener('click', saveConfig);
  $('#downloadPngBtn')?.addEventListener('click', downloadPng);
  $('#downloadJpgBtn')?.addEventListener('click', downloadJpg);
  $('#downloadSvgBtn')?.addEventListener('click', downloadSvg);
  $('#downloadPdfBtn')?.addEventListener('click', downloadPdf);
  $('#downloadWordBtn')?.addEventListener('click', downloadWord);
  $('#downloadZipBtn')?.addEventListener('click', () => downloadZip(true));
  $('#downloadAllZipBtn')?.addEventListener('click', () => downloadZip(false));
  $('#downloadAllTablesBtn')?.addEventListener('click', () => downloadZip(false));
}

AurestoStore.init().then(init).catch(() => init());
