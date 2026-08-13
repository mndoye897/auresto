const header = document.querySelector('.site-header');
const toast = document.querySelector('#toast');
const parallaxCards = [...document.querySelectorAll('[data-parallax]')];
const heroVideo = document.querySelector('.hero-video');
const liveTotal = document.querySelector('.live-total');
const orderStatus = document.querySelector('.order-status');
let toastTimer;

function updateScene() {
  const y = window.scrollY;
  header.classList.toggle('scrolled', y > 28);
  parallaxCards.forEach(card => {
    const speed = Number(card.dataset.parallax);
    card.style.setProperty('--parallax-y', `${y * speed}px`);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function ensureVideoPlays() {
  if (!heroVideo) return;
  const play = () => heroVideo.play().catch(() => {});
  play();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) play();
  });
}

function initReveal() {
  const items = [...document.querySelectorAll('.reveal')];
  if (!items.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  items.forEach((item, index) => {
    item.style.transitionDelay = `${index % 5 * 0.08}s`;
    observer.observe(item);
  });
}

function initLiveDashboard() {
  if (!liveTotal || !orderStatus) return;

  const states = [
    { status: 'Commande envoyée', total: '12 000 FCFA' },
    { status: 'En préparation', total: '12 000 FCFA' },
    { status: 'Paiement reçu', total: '12 000 FCFA' },
    { status: 'Nouvelle commande', total: '15 500 FCFA' }
  ];
  let index = 0;

  setInterval(() => {
    index = (index + 1) % states.length;
    const next = states[index];
    orderStatus.style.opacity = '0';
    liveTotal.style.opacity = '0';

    setTimeout(() => {
      orderStatus.textContent = next.status;
      liveTotal.textContent = next.total;
      orderStatus.style.opacity = '1';
      liveTotal.style.opacity = '1';
    }, 280);
  }, 4200);
}

window.addEventListener('scroll', updateScene, { passive: true });
window.addEventListener('resize', updateScene);
updateScene();
ensureVideoPlays();
initReveal();
initLiveDashboard();

document.querySelector('#menuToggle').addEventListener('click', event => {
  const nav = document.querySelector('#mainNav');
  nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open'));
});

document.querySelectorAll('#mainNav a').forEach(link => link.addEventListener('click', () => {
  document.querySelector('#mainNav').classList.remove('open');
  document.querySelector('#menuToggle').setAttribute('aria-expanded', 'false');
}));

document.querySelector('#playButton').addEventListener('click', () => showToast('Une démonstration Auresto arrive très bientôt.'));
document.querySelector('#loginButton').addEventListener('click', () => {
  if (window.AurestoStore?.isLoggedIn?.()) location.href = 'dashboard.html';
  else location.href = 'onboarding.html';
});
document.querySelectorAll('[data-plan]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.href) {
      location.href = button.dataset.href;
      return;
    }
    showToast(`Vous avez choisi l'offre ${button.dataset.plan}. Parlons-en !`);
  });
});

// Désactivé temporairement pour les tests locaux (conflits de cache sur localhost)
// if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js'));
