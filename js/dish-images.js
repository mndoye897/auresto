/**
 * Shared dish image resolver — used by onboarding and dashboard.
 */
function generateNanoBananaImage(dishName) {
  const cleanName = (dishName || '').trim();
  if (!cleanName) return 'images/placeholder-plat.png';

  const lower = cleanName.toLowerCase();

  if (lower.includes('burger') || lower.includes('hamburger') || lower.includes('cheeseburger')) {
    return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('pizza')) {
    return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('thiéb') || lower.includes('thieb') || lower.includes('ceebu') || lower.includes('riz')) {
    return 'images/thieboudienne.png';
  }
  if (lower.includes('yassa')) {
    return 'images/yassa.png';
  }
  if (lower.includes('dibi') || lower.includes('agneau') || lower.includes('viande') || lower.includes('grill') || lower.includes('boeuf') || lower.includes('steak')) {
    return 'images/dibi.png';
  }
  if (lower.includes('crevette') || lower.includes('gambas') || lower.includes('fruit de mer') || lower.includes('poisson') || lower.includes('seafood')) {
    return 'images/crevettes.png';
  }
  if (lower.includes('bissap') || lower.includes('bouye') || lower.includes('jus') || lower.includes('cocktail') || lower.includes('soda') || lower.includes('boisson')) {
    return 'images/bissap.png';
  }
  if (lower.includes('tacos') || lower.includes('burrito') || lower.includes('fajitas')) {
    return 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('sushi') || lower.includes('maki') || lower.includes('sashimi') || lower.includes('ramen')) {
    return 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('poulet') || lower.includes('chicken') || lower.includes('nugget')) {
    return 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('pâte') || lower.includes('spaghetti') || lower.includes('pate') || lower.includes('lasagne') || lower.includes('pasta')) {
    return 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('salade') || lower.includes('salad') || lower.includes('entrée') || lower.includes('entree')) {
    return 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('frite') || lower.includes('fries')) {
    return 'https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('glace') || lower.includes('dessert') || lower.includes('gâteau') || lower.includes('gateau') || lower.includes('chocolat') || lower.includes('crepe') || lower.includes('crêpe') || lower.includes('cake')) {
    return 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('café') || lower.includes('cafe') || lower.includes('espresso') || lower.includes('cappuccino') || lower.includes('thé') || lower.includes('the')) {
    return 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('chawarma') || lower.includes('shawarma') || lower.includes('kebab') || lower.includes('wrap')) {
    return 'https://images.unsplash.com/photo-1561651823-34feb02250e4?auto=format&fit=crop&w=800&q=80';
  }

  const prompt = `delicious gourmet food photo of ${cleanName}, top restaurant presentation`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true`;
}

function getDishImageUrl(item) {
  if (!item) return 'images/placeholder-plat.png';
  const explicit = item.photo || item.image_url || item.image || item.photoUrl || item.imageUrl || item.photo_url;
  const isInvalid = !explicit ||
    String(explicit).trim() === '' ||
    String(explicit).trim() === 'images/placeholder-plat.png' ||
    (String(explicit).startsWith('data:image/') && !item.userUploaded);

  if (!isInvalid) {
    return String(explicit).trim();
  }
  if (item.name && typeof generateNanoBananaImage === 'function') {
    const generated = generateNanoBananaImage(item.name);
    if (generated && generated !== 'images/placeholder-plat.png') return generated;
  }
  return 'images/placeholder-plat.png';
}

if (typeof window !== 'undefined') {
  window.generateNanoBananaImage = generateNanoBananaImage;
  window.getDishImageUrl = getDishImageUrl;
}
