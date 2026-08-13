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

    if (!window.Tesseract?.recognize) {
      throw new Error('Le module de lecture du menu est indisponible. Vérifiez votre connexion puis réessayez.');
    }

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



    // Si le pack français n'est pas accessible, Tesseract peut encore lire
    // correctement les noms et prix avec le modèle anglais.
    if (!ocrLines.length && window.Tesseract?.recognize) {
      try {
        onProgress?.('Nouvel essai de lecture…');
        const fallbackResult = await Tesseract.recognize(resizedUrl, 'eng', {
          logger: message => {
            if (message.status === 'recognizing text') {
              onProgress?.(`Lecture du menu… ${Math.round((message.progress || 0) * 100)}%`);
            }
          }
        });
        ocrLines = (fallbackResult?.data?.lines || [])
          .map(line => ({ text: (line.text || '').trim(), bbox: line.bbox }))
          .filter(line => line.text);
        if (!ocrLines.length && fallbackResult?.data?.text) {
          ocrLines = fallbackResult.data.text.split('\n')
            .map(text => ({ text: text.trim(), bbox: null }))
            .filter(line => line.text);
        }
      } catch (fallbackError) {
        console.warn('OCR de secours indisponible:', fallbackError);
      }
    }

    onProgress?.('Détection des catégories et prix…');

    let items = this.parseLines(ocrLines.map(l => l.text));



    if (items.length < 2) {

      onProgress?.('Analyse complémentaire…');

      items = this.parseLinesAggressive(ocrLines.map(l => l.text).join('\n'));

    }



    // Ne jamais compléter le résultat par des plats fictifs : un scan doit
    // refléter uniquement le contenu de la photo choisie par le restaurant.
    if (!items.length) {
      onProgress?.('Aucun plat exploitable détecté.');
      return { items: [], categories: [], sourceImage: dataUrl };
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
    // Les photos sont générées localement : l'ancien appel direct à
    // l'API Gemini exposait la clé dans le navigateur (clé volable +
    // endpoint inexistant côté Google). La clé doit rester côté serveur.
    return items.map(item => ({
      ...item,
      photo: this.generateFoodPlaceholder(item.name)
    }));
  },

  generateFoodPlaceholder(name) {
    if (typeof generateNanoBananaImage === 'function') {
      return generateNanoBananaImage(name);
    }
    const cleanName = (name || '').trim();
    if (!cleanName) return 'images/placeholder-plat.png';
    const prompt = `delicious gourmet food photo of ${cleanName}, top restaurant presentation`;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true`;
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

