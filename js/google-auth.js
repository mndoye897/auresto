// Google Sign-In Integration
// Note: Replace YOUR_GOOGLE_CLIENT_ID with your actual Google Client ID from Google Cloud Console

const GOOGLE_CLIENT_ID = '787540992072-bb32pg57psks7hqcmqf44ciq6l1g1ln3.apps.googleusercontent.com'; // TODO: Replace with actual client ID

async function handleGoogleSignIn(response) {
  const token = response.credential;
  if (!token) {
    const msg = 'Erreur: Token Google non trouvé';
    if (typeof showToast === 'function') showToast(msg);
    else alert(msg);
    return;
  }

  try {
    // Decode JWT token locally to get user info (no backend validation needed for basic info)
    const payload = JSON.parse(atob(token.split('.')[1]));
    const { email, name, picture } = payload;

    // Determine context: onboarding or homepage
    const isOnboarding = document.getElementById('accName'); // accName exists only on onboarding
    
    if (isOnboarding) {
      // On onboarding page: auto-fill form
      document.getElementById('accEmail').value = email || '';
      document.getElementById('accName').value = name || '';

      // Save to store
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

      if (typeof showToast === 'function') {
        showToast(`Bienvenue ${name || 'utilisateur'}! Continuez votre configuration.`);
      }

      // Optional: Auto-advance to next step after short delay
      setTimeout(() => {
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn && !nextBtn.disabled) nextBtn.click();
      }, 1500);
    } else {
      // On homepage: redirect to onboarding with data in localStorage
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
  if (!window.google?.accounts?.id) {
    // Google library not loaded yet, retry after a short delay
    setTimeout(initGoogleSignIn, 200);
    return;
  }

  // Initialize Google Sign-In
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleSignIn
  });

  // Setup button click handlers
  const onboardingBtn = document.getElementById('googleSignInBtn');
  if (onboardingBtn) {
    // Onboarding page button
    try {
      google.accounts.id.renderButton(
        onboardingBtn,
        {
          type: 'standard',
          size: 'large',
          text: 'signin_with',
          locale: 'fr'
        }
      );
    } catch (err) {
      console.warn('Could not render button:', err);
    }
  }

  const homepageBtn = document.getElementById('googleSignInBtnHeader');
  if (homepageBtn) {
    // Homepage button - click triggers popup
    homepageBtn.addEventListener('click', () => {
      google.accounts.id.renderButton(
        document.createElement('div'),
        { type: 'standard', size: 'large' }
      );
      google.accounts.id.prompt();
    });
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGoogleSignIn);
} else {
  initGoogleSignIn();
}

