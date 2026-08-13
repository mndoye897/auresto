const crypto = require('crypto');
const fetch = require('node-fetch');

const SANDBOX_API_BASE = 'https://api-sandbox.dexpay.africa/api/v1';
const LIVE_API_BASE = 'https://api.dexpay.africa/api/v1';

function getConfig() {
  const mode = String(process.env.DEXPAY_MODE || 'sandbox').toLowerCase();
  const apiKey = String(process.env.DEXPAY_API_KEY || '').trim();
  const webhookSecret = String(process.env.DEXPAY_WEBHOOK_SECRET || process.env.DEXPAY_API_SECRET || '').trim();

  return {
    mode: mode === 'live' ? 'live' : 'sandbox',
    apiKey,
    webhookSecret,
    apiBase: String(process.env.DEXPAY_API_BASE || (mode === 'live' ? LIVE_API_BASE : SANDBOX_API_BASE)).replace(/\/$/, '')
  };
}

function isConfigured() {
  const { apiKey } = getConfig();
  return Boolean(apiKey);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
}

async function createCheckoutSession({ reference, itemName, amount, successUrl, failureUrl, webhookUrl, metadata }) {
  const config = getConfig();
  if (!config.apiKey) {
    return { ok: false, code: 'DEXPAY_NOT_CONFIGURED', message: 'DexPay n’est pas configuré sur le serveur.' };
  }

  try {
    const response = await fetch(`${config.apiBase}/checkout-sessions`, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reference,
        item_name: itemName,
        amount,
        currency: 'XOF',
        success_url: successUrl,
        failure_url: failureUrl,
        webhook_url: webhookUrl,
        is_one_shot_payment: true,
        metadata
      })
    });

    const payload = await readJson(response);
    if (!response.ok) {
      return {
        ok: false,
        code: 'DEXPAY_SESSION_FAILED',
        status: response.status,
        message: payload.message || payload.error || 'La session DexPay n’a pas pu être créée.'
      };
    }

    const data = payload.data || payload;
    const paymentUrl = config.mode === 'sandbox'
      ? (data.sandbox_payment_url || data.payment_url)
      : data.payment_url;

    if (!paymentUrl) {
      return { ok: false, code: 'DEXPAY_INVALID_RESPONSE', message: 'DexPay n’a pas renvoyé de lien de paiement.' };
    }

    return {
      ok: true,
      mode: config.mode,
      sessionId: data.id || data.reference || reference,
      reference: data.reference || reference,
      paymentUrl,
      status: data.status || 'initiated'
    };
  } catch (error) {
    console.error('[DEXPAY] Checkout session error:', error.message);
    return { ok: false, code: 'DEXPAY_NETWORK_ERROR', message: 'DexPay est momentanément inaccessible.' };
  }
}

function verifyWebhookSignature(rawBody, signature) {
  const { webhookSecret } = getConfig();
  if (!webhookSecret || !signature || !rawBody) return false;

  const received = String(signature).replace(/^sha256=/i, '').trim();
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
  } catch {
    return false;
  }
}

module.exports = {
  createCheckoutSession,
  getConfig,
  isConfigured,
  verifyWebhookSignature
};
