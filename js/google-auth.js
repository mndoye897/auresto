// Google Sign-In Integration
// Note: Replace YOUR_GOOGLE_CLIENT_ID with your actual Google Client ID from Google Cloud Console

const GOOGLE_CLIENT_ID = '787540992072-bb32pg57psks7hqcmqf44ciq6l1g1ln3.apps.googleusercontent.com'; // TODO: Replace with actual client ID

// Safe UTF-8 JWT parser for Google ID Tokens
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Error decoding JWT token:', e);
    return null;
  }
}

// Check if loaded via file:// protocol
function checkFileProtocolWarning() {
  if (window.location.protocol === 'file:') {
    const warningMsg = "Google Sign-In nécessite d'être exécuté via un serveur local (ex: http://localhost ou Live Server) et ne fonctionne pas en file:///";
    console.warn('[Auresto Auth Warning]', warningMsg);
    return true;
  }
  return false;
}

async function handleGoogleSignIn(response) {
  const token = response?.credential;
  if (!token) {
    const msg = 'Erreur: Token Google non trouvé';
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
    return;
  }

  try {
    // Decode JWT token safely (supports French accents/UTF-8)
    const payload = parseJwt(token);
    if (!payload) {
      throw new Error('Jeton JWT Google invalide');
    }
    const { email, name, picture } = payload;

    // Determine context: onboarding or homepage
    const isOnboarding = document.getElementById('accName'); // accName exists only on onboarding
    
    if (isOnboarding) {
      // On onboarding page: auto-fill form
      const emailEl = document.getElementById('accEmail');
      const nameEl = document.getElementById('accName');
      if (emailEl) emailEl.value = email || '';
      if (nameEl) nameEl.value = name || '';

      // Save to store
      if (window.AurestoStore) {
        const data = AurestoStore.load();
        data.account = {
          ...data.account,
          provider: 'google',
          name: name || data.account.name || '',
          email: email || data.account.email || '',
          phone: data.account.phone || '',
          password: '' // Google users don't need password
        };
        AurestoStore.save(data);
      }

      if (typeof showToast === 'function') {
        showToast(`Bienvenue ${name || 'utilisateur'} ! Continuez votre configuration.`);
      }

      // Optional: Auto-advance to next step after short delay
      setTimeout(() => {
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn && !nextBtn.disabled) nextBtn.click();
      }, 1500);
    } else {
      // On homepage: redirect to onboarding with data in localStorage
      if (window.AurestoStore) {
        const data = {
          ...AurestoStore.load(),
          account: {
            name: name || '',
            email: email || '',
            phone: '',
            password: ''
          }
        };
        AurestoStore.save(data);
      }
      
      // Redirect to onboarding
      window.location.href = 'onboarding.html';
    }

  } catch (err) {
    console.error('Google Sign-In error:', err);
    const msg = 'Erreur lors de la connexion Google. Veuillez réessayer.';
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
  }
}

// Initialize Google Sign-In when DOM is ready
function initGoogleSignIn() {
  const isFile = checkFileProtocolWarning();

  if (!window.google?.accounts?.id) {
    // Google library not loaded yet, retry after a short delay (up to 10 attempts)
    if (!window._gsiRetryCount) window._gsiRetryCount = 0;
    if (window._gsiRetryCount < 15) {
      window._gsiRetryCount++;
      setTimeout(initGoogleSignIn, 200);
    } else if (isFile) {
      console.warn('Google Sign-In non disponible en mode file:///. Veuillez utiliser un serveur local HTTP.');
    }
    return;
  }

  try {
    // Initialize Google Sign-In
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleSignIn,
      auto_select: false
    });
  } catch (err) {
    console.error('Error initializing Google Accounts ID:', err);
  }

  // Setup button click handlers for onboarding
  const onboardingBtnContainer = document.getElementById('googleSignInBtn');
  if (onboardingBtnContainer) {
    if (isFile) {
      // On file:// protocol, show helpful toast when clicked
      onboardingBtnContainer.addEventListener('click', (e) => {
        const warning = "Authentification Google indisponible via file:///. Veuillez lancer votre projet via un serveur HTTP (ex: http://localhost ou Live Server).";
        if (typeof showToast === 'function') showToast(warning);
        else alert(warning);
      });
    } else {
      try {
        google.accounts.id.renderButton(
          onboardingBtnContainer,
          {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            locale: 'fr',
            shape: 'rectangular',
            logo_alignment: 'left'
          }
        );
      } catch (err) {
        console.warn('Could not render onboarding Google button:', err);
      }
    }
  }

  // Setup button click handlers for homepage header
  const homepageBtnContainer = document.getElementById('googleSignInBtnHeader');
  if (homepageBtnContainer) {
    if (isFile) {
      homepageBtnContainer.addEventListener('click', () => {
        const warning = "Authentification Google indisponible via file:///. Veuillez lancer votre projet via un serveur HTTP (ex: http://localhost ou Live Server).";
        if (typeof showToast === 'function') showToast(warning);
        else alert(warning);
      });
    } else {
      try {
        google.accounts.id.renderButton(
          homepageBtnContainer,
          {
            type: 'standard',
            theme: 'outline',
            size: 'medium',
            text: 'signin',
            locale: 'fr',
            shape: 'pill'
          }
        );
      } catch (err) {
        console.warn('Could not render homepage Google button:', err);
        homepageBtnContainer.addEventListener('click', () => {
          google.accounts.id.prompt();
        });
      }
    }
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGoogleSignIn);
} else {
  initGoogleSignIn();
}

