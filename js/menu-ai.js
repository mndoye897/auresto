const CATEGORY_MAP = [

  { name: 'Entrées', keys: ['entree', 'entrée', 'entrees', 'entrées', 'starter', 'hors'] },

  { name: 'Plats', keys: ['plat', 'plats', 'principal', 'specialite', 'spécialité', 'grillade', 'poisson', 'viande', 'thiéb', 'thieb', 'yassa', 'mafé', 'mafe'] },

  { name: 'Boissons', keys: ['boisson', 'boissons', 'jus', 'drink', 'bissap', 'cafe', 'café', 'soda', 'eau', 'jus'] },

  { name: 'Desserts', keys: ['dessert', 'desserts', 'glace', 'fruit', 'gateau', 'gâteau', 'thiakry'] }

];



const FALLBACK_MENU = [

  { name: 'Thiéboudienne', category: 'Plats', price: 4500, description: 'Riz au poisson et légumes' },

  { name: 'Yassa poulet', category: 'Plats', price: 3500, description: 'Poulet mariné aux oignons' },

  { name: 'Mafé boeuf', category: 'Plats', price: 4000, description: 'Sauce arachide traditionnelle' },

  { name: 'Jus de bissap', category: 'Boissons', price: 1500, description: 'Fait maison' },

  { name: 'Bissap gingembre', category: 'Boissons', price: 1500, description: 'Rafraîchissant' },

  { name: 'Café touba', category: 'Boissons', price: 500, description: 'Café épicé sénégalais' },

  { name: 'Thiakry', category: 'Desserts', price: 2000, description: 'Mil sucré au lait caillé' },

  { name: 'Salade de fruits', category: 'Desserts', price: 2500, description: 'Fruits de saison' }

];



const FOOD_EMOJI = {

  thieb: '🍚', yassa: '🍗', mafe: '🥘', bissap: '🥤', cafe: '☕', dessert: '🍨', default: '🍽️'

};



const MenuAI = {

  async scanMenuImage(file, onProgress) {

    const dataUrl = await this.readFile(file);

    onProgress?.('Préparation de l\'image…');

    const img = await this.loadImage(dataUrl);

    const { canvas, dataUrl: resizedUrl } = this.resizeImage(img, 1800);



    onProgress?.('Lecture du menu (OCR)…');

    let ocrLines = [];

    try {

      if (window.Tesseract) {

        const result = await Tesseract.recognize(resizedUrl, 'fra', {

          logger: m => {

            if (m.status === 'recognizing text') {

              onProgress?.(`Lecture du menu… ${Math.round((m.progress || 0) * 100)}%`);

            }

          }

        });

        if (result?.data?.lines?.length) {

          ocrLines = result.data.lines.map(line => ({

            text: (line.text || '').trim(),

            bbox: line.bbox

          })).filter(l => l.text);

        }

        if (!ocrLines.length && result?.data?.text) {

          ocrLines = result.data.text.split('\n').map(text => ({ text: text.trim(), bbox: null })).filter(l => l.text);

        }

      }

    } catch (err) {

      console.warn('OCR partiel:', err);

    }



    onProgress?.('Détection des catégories et prix…');

    let items = this.parseLines(ocrLines.map(l => l.text));



    if (items.length < 2) {

      onProgress?.('Analyse complémentaire…');

      items = this.parseLinesAggressive(ocrLines.map(l => l.text).join('\n'));

    }



    if (items.length < 2) {

      onProgress?.('Application du menu type…');

      items = this.mergeWithFallback(items);

    }



    onProgress?.('Génération des photos…');

    try {

      items = await this.attachPhotos(canvas, items, ocrLines);

    } catch {

      items = items.map(item => ({ ...item, photo: this.generateFoodPlaceholder(item.name) }));

    }



    onProgress?.('Menu prêt !');

    const categories = [...new Set(items.map(i => i.category))];

    return { items, categories, sourceImage: dataUrl };

  },



  resizeImage(img, maxSize) {

    let { width, height } = img;

    if (width > maxSize || height > maxSize) {

      const ratio = Math.min(maxSize / width, maxSize / height);

      width = Math.round(width * ratio);

      height = Math.round(height * ratio);

    }

    const canvas = document.createElement('canvas');

    canvas.width = width;

    canvas.height = height;

    canvas.getContext('2d').drawImage(img, 0, 0, width, height);

    return { canvas, dataUrl: canvas.toDataURL('image/jpeg', 0.92) };

  },



  parseLines(lines) {

    let currentCategory = 'Plats';

    const items = [];

    for (const raw of lines) {

      const line = raw.replace(/\s+/g, ' ').trim();

      if (!line || line.length < 3) continue;

      const cat = this.detectCategory(line);

      if (cat && !this.extractPrice(line)) {

        currentCategory = cat;

        continue;

      }

      const parsed = this.parseDishLine(line, currentCategory);

      if (parsed) items.push(parsed);

    }

    return items;

  },



  parseLinesAggressive(text) {

    const items = [];

    const chunks = text.split(/[\n;|]/);

    let currentCategory = 'Plats';

    for (const raw of chunks) {

      const line = raw.replace(/\s+/g, ' ').trim();

      if (!line) continue;

      const cat = this.detectCategory(line);

      if (cat && !this.extractPrice(line)) { currentCategory = cat; continue; }

      const prices = [...line.matchAll(/(\d[\d\s.,]{1,})\s*(?:fcfa|f\b|cfa)?/gi)];

      if (prices.length) {

        const last = prices[prices.length - 1];

        const num = parseInt(last[1].replace(/[\s.,]/g, ''), 10);

        if (num >= 200 && num <= 100000) {

          let name = line.slice(0, last.index).replace(/[.\-–—•·:]+/g, ' ').trim();

          name = name.replace(/^\d+[\).\s]*/, '').trim();

          if (name.length >= 2 && !/^(total|menu|prix|tel)/i.test(name)) {

            items.push({

              name: name.charAt(0).toUpperCase() + name.slice(1),

              category: currentCategory,

              price: num,

              description: '',

              available: true

            });

          }

        }

      }

    }

    return items;

  },



  detectCategory(line) {

    const lower = line.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (line.length > 40) return null;

    for (const cat of CATEGORY_MAP) {

      if (cat.keys.some(k => lower.includes(k)) && !this.extractPrice(line)) return cat.name;

    }

    if (/^(entrees?|plats?|boissons?|desserts?)$/i.test(line)) {

      const base = line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();

      return base.endsWith('s') ? base : base + 's';

    }

    return null;

  },



  extractPrice(line) {

    const patterns = [

      /(\d{1,3}(?:[.\s]\d{3})+)\s*(?:fcfa|f\b|cfa)?/i,

      /(\d[\d\s.,]{1,})\s*(?:fcfa|f\b|cfa)/i,

      /(\d{3,5})\s*$/,

      /(\d{1,2}[.,]\d{3})\s*$/

    ];

    for (const p of patterns) {

      const m = line.match(p);

      if (m) {

        const raw = m[1];

        let num;

        if (/^\d{1,3}(?:[.\s]\d{3})+$/.test(raw) || /^\d{1,2}[.,]\d{3}$/.test(raw)) {

          num = parseInt(raw.replace(/[.\s]/g, ''), 10);

        } else {

          num = parseInt(raw.replace(/[\s.,]/g, ''), 10);

        }

        if (num >= 200 && num <= 100000) return { value: num, match: m[0] };

      }

    }

    return null;

  },



  parseDishLine(line, category) {

    const price = this.extractPrice(line);

    if (!price) return null;

    let name = line.replace(price.match, '').replace(/[.\-–—•·]+/g, ' ').trim();

    name = name.replace(/^\d+[\).\s]*/, '').trim();

    if (name.length < 2 || /^(total|menu|prix|tel)/i.test(name)) return null;

    return {

      name: name.charAt(0).toUpperCase() + name.slice(1),

      category,

      price: price.value,

      description: '',

      available: true

    };

  },



  mergeWithFallback(extracted) {

    const names = new Set(extracted.map(i => i.name.toLowerCase()));

    const merged = [...extracted];

    for (const item of FALLBACK_MENU) {

      if (!names.has(item.name.toLowerCase()) && merged.length < 12) merged.push({ ...item });

    }

    return merged;

  },



  async attachPhotos(canvas, items, ocrLines) {

    return Promise.all(items.map(async item => {

      let photo = await this.generateGeminiImage(item.name);

      if (!photo) {

        const pricedLines = ocrLines.filter(l => l.text && this.extractPrice(l.text));

        const line = pricedLines.find(l => {

          const t = l.text.toLowerCase();

          const n = item.name.toLowerCase().slice(0, 5);

          return n.length >= 3 && t.includes(n);

        });

        if (line?.bbox && canvas.width > 0) {

          try {

            const pad = 8;

            const x = Math.max(0, line.bbox.x0 - pad);

            const y = Math.max(0, line.bbox.y0 - pad);

            const w = Math.min(canvas.width - x, (line.bbox.x1 - line.bbox.x0) + pad * 2);

            const h = Math.min(canvas.height - y, (line.bbox.y1 - line.bbox.y0) + pad * 2);

            if (w > 20 && h > 20) {

              const crop = document.createElement('canvas');

              crop.width = 200;

              crop.height = 200;

              crop.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, 200, 200);

              photo = crop.toDataURL('image/jpeg', 0.85);

            }

          } catch { /* ignore crop errors */ }

        }

      }

      if (!photo) photo = this.generateFoodPlaceholder(item.name);

      return { ...item, photo };

    }));

  },



  async generateGeminiImage(name) {

    const apiKey = window.AurestoStore?.load()?.integration?.geminiApiKey;

    if (!apiKey) return '';

    const prompt = `Photo stylée et appétissante d'un plat nommé ${name}, présentation gourmande, fond neutre, couleur chaude.`;

    try {

      const response = await fetch(`https://gemini.googleapis.com/v1/images:generate?key=${encodeURIComponent(apiKey)}`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ model: 'gemini-imagen-1', prompt, size: '512x512' })

      });

      if (!response.ok) return '';

      const result = await response.json();

      const imageData = result?.data?.[0]?.imageUri || result?.data?.[0]?.b64_json;

      if (!imageData) return '';

      if (imageData.startsWith('data:')) return imageData;

      if (result.data[0].b64_json) return `data:image/png;base64,${result.data[0].b64_json}`;

      return imageData;

    } catch (err) {

      return '';

    }

  },



  generateFoodPlaceholder(name) {

    const query = name.toLowerCase().replace(/[\W_]+/g, '+') || 'plat';

    return `https://source.unsplash.com/400x400/?${encodeURIComponent(query)},food,restaurant`;

  },



  readFile(file) {

    return new Promise((resolve, reject) => {

      const r = new FileReader();

      r.onload = e => resolve(e.target.result);

      r.onerror = reject;

      r.readAsDataURL(file);

    });

  },



  loadImage(src) {

    return new Promise((resolve, reject) => {

      const img = new Image();

      img.onload = () => resolve(img);

      img.onerror = reject;

      img.src = src;

    });

  }

};



window.MenuAI = MenuAI;

