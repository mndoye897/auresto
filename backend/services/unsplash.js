const fetch = require('node-fetch');

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
const GENERIC_QUERIES = ['plat africain', 'cuisine sénégalaise', 'assiette repas'];

function nettoyerNomPlat(nomPlat) {
  if (!nomPlat || typeof nomPlat !== 'string') return 'plat africain';

  let nom = nomPlat
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\([^)]*$/g, '')
    .replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ' ')
    .replace(/["'“”‘’]/g, '')
    .replace(/[\[\]{}<>]/g, ' ')
    .replace(/[^\p{L}\d\s]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const mots = nom
    .split(' ')
    .filter(m => m.length > 2 && !/^(et|de|du|la|le|les|des|au|aux|pour|avec|sur|a|en)$/i.test(m));

  if (mots.length === 0) {
    return 'plat africain';
  }

  const cleaned = mots.slice(0, 5).join(' ').trim();
  return cleaned.length >= 3 ? cleaned : 'plat africain';
}

async function signalerTelechargement(downloadLocation) {
  if (!downloadLocation || !UNSPLASH_KEY) return;
  try {
    await fetch(`${downloadLocation}&client_id=${UNSPLASH_KEY}`, { method: 'GET' });
  } catch (err) {
    console.warn('Unsplash download location error:', err.message || err);
  }
}

async function rechercherUnsplash(query) {
  if (!UNSPLASH_KEY) return null;
  try {
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('orientation', 'squarish');
    url.searchParams.set('per_page', '1');

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_KEY}`
      },
      timeout: 10000
    });

    if (!res.ok) {
      console.warn('Unsplash recherche échouée:', res.status, res.statusText);
      return null;
    }

    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;

    if (result.links?.download_location) {
      signalerTelechargement(result.links.download_location).catch(() => {});
    }

    return result.urls?.regular || null;
  } catch (err) {
    console.warn('Unsplash API error:', err.message || err);
    return null;
  }
}

async function trouverImagePlat(nomPlat) {
  const query = nettoyerNomPlat(nomPlat);
  let image = await rechercherUnsplash(query);
  if (image) return image;

  for (const fallback of GENERIC_QUERIES) {
    image = await rechercherUnsplash(fallback);
    if (image) return image;
  }

  return null;
}

module.exports = { trouverImagePlat, nettoyerNomPlat };
