/**
 * Wave Business API Integration Service (Stub & Architecture Prepared)
 * 
 * Usage 1: Client restaurant payment
 * Usage 2: Restaurant Auresto subscription payment
 * 
 * Note: Real API credentials will be injected via environment variables:
 * - WAVE_API_KEY
 * - WAVE_BUSINESS_ID
 * - WAVE_WEBHOOK_SECRET
 */

const WAVE_API_BASE = process.env.WAVE_API_BASE || 'https://api.wave.com/v1';

/**
 * Creates a Wave Checkout session for subscription or order payment.
 * Returns checkout URL to redirect the user to Wave app/web payment.
 */
async function createWaveCheckout({ amount, currency = 'XOF', title, clientReference, successUrl, cancelUrl }) {
  const apiKey = process.env.WAVE_API_KEY;

  if (!apiKey) {
    console.warn('[WAVE SERVICE] WAVE_API_KEY non configurée. Le checkout Wave nécessitera les identifiants réels.');
    return {
      ok: false,
      error: 'WAVE_NOT_CONFIGURED',
      message: 'L\'accès API Wave Business est en attente de validation par Wave.'
    };
  }

  try {
    const fetch = require('node-fetch');
    const response = await fetch(`${WAVE_API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: String(amount),
        currency: currency === 'FCFA' ? 'XOF' : currency,
        error_url: cancelUrl,
        success_url: successUrl,
        client_reference: clientReference,
        title: title || 'Paiement Auresto'
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `Wave API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      ok: true,
      checkoutUrl: data.wave_launch_url || data.checkout_url,
      sessionId: data.id
    };
  } catch (err) {
    console.error('[WAVE SERVICE ERROR]', err);
    return {
      ok: false,
      error: 'WAVE_API_ERROR',
      message: err.message
    };
  }
}

/**
 * Verifies a Wave Webhook payload signature to ensure it originates from Wave servers.
 */
function verifyWaveWebhook(signatureHeader, rawPayload) {
  const webhookSecret = process.env.WAVE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('[WAVE SERVICE] WAVE_WEBHOOK_SECRET non configuré.');
    return false;
  }
  const crypto = require('crypto');
  try {
    const hmac = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');
    return hmac === signatureHeader;
  } catch (err) {
    console.error('[WAVE WEBHOOK ERROR]', err);
    return false;
  }
}

module.exports = {
  createWaveCheckout,
  verifyWaveWebhook
};
