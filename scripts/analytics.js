import { captureCampaignAttribution, clearCampaignAttribution } from './attribution.js';

export const ANALYTICS_CFG = {
  GA4_ID: 'G-60ZPREPJV3',
  PIXEL_ID: ''
};

const CONSENT_KEY = 'cookieConsent';
const PRODUCTION_HOST = 'annaluisamakeup.vercel.app';
const DENIED = {
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  ad_storage: 'denied',
  analytics_storage: 'denied'
};
const GRANTED = {
  ...DENIED,
  ad_user_data: 'granted',
  ad_storage: 'granted',
  analytics_storage: 'granted'
};
const trackedReceipts = new Set();
let choice = null;
let installed = false;
let googleStarted = false;
let pixelStarted = false;

function canTrack() {
  return choice === 'granted' && location.protocol === 'https:' && location.hostname === PRODUCTION_HOST;
}

function storedChoice() {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

function loadScript(url) {
  const script = document.createElement('script');
  script.async = true;
  script.src = url;
  document.head.append(script);
}

function startGoogle() {
  const id = ANALYTICS_CFG.GA4_ID;
  window[`ga-disable-${id}`] = false;
  if (googleStarted) {
    window.gtag('consent', 'update', GRANTED);
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', DENIED);
  window.gtag('consent', 'update', GRANTED);
  window.gtag('js', new Date());
  window.gtag('config', id);
  googleStarted = true;
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
}

function startPixel() {
  const id = ANALYTICS_CFG.PIXEL_ID;
  if (!/^\d{8,20}$/.test(id)) return;
  if (pixelStarted) {
    window.fbq('consent', 'grant');
    return;
  }
  const fbq = function () {
    if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
    else fbq.queue.push(arguments);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = window._fbq = fbq;
  window.fbq('consent', 'grant');
  window.fbq('init', id);
  window.fbq('track', 'PageView');
  pixelStarted = true;
  loadScript('https://connect.facebook.net/en_US/fbevents.js');
}

function applyChoice(value) {
  choice = value;
  if (choice === 'granted') {
    captureCampaignAttribution();
    if (canTrack()) {
      startGoogle();
      startPixel();
    }
  } else {
    clearCampaignAttribution();
    if (googleStarted) {
      window[`ga-disable-${ANALYTICS_CFG.GA4_ID}`] = true;
      window.gtag('consent', 'update', DENIED);
    }
    if (pixelStarted) window.fbq('consent', 'revoke');
  }
}

export function setupConsent() {
  if (installed) return;
  installed = true;

  const banner = document.createElement('section');
  banner.id = 'cookieBanner';
  banner.setAttribute('aria-labelledby', 'cookiePreferencesTitle');
  banner.className = 'fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto border-t border-neutral-200 bg-white px-4 py-4 shadow-lg sm:px-6';
  banner.innerHTML = `
    <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h2 id="cookiePreferencesTitle" tabindex="-1" class="text-sm font-semibold text-neutral-900">Preferências de cookies</h2>
        <p class="mt-1 text-sm text-neutral-700">Com sua autorização, usamos cookies para medir visitas e resultados de anúncios. <a href="/docs/politica-privacidade.html" class="underline">Política de Privacidade</a></p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" data-cookie-choice="denied" class="min-h-11 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">Rejeitar</button>
        <button type="button" data-cookie-choice="granted" class="min-h-11 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700">Aceitar</button>
      </div>
    </div>
  `;
  banner.hidden = true;
  document.body.prepend(banner);
  let opener = null;

  function setBannerVisible(visible) {
    banner.hidden = !visible;
    document.body.classList.toggle('cookie-open', visible);
    if (!visible && opener) {
      opener.focus();
      opener = null;
    }
  }

  document.querySelectorAll('[data-cookie-preferences]').forEach(button => {
    button.setAttribute('aria-controls', banner.id);
    button.addEventListener('click', () => {
      opener = button;
      setBannerVisible(true);
      banner.querySelector('#cookiePreferencesTitle').focus();
    });
  });
  banner.addEventListener('keydown', event => {
    if (event.key === 'Escape' && opener) setBannerVisible(false);
  });
  banner.addEventListener('click', event => {
    const button = event.target.closest('button[data-cookie-choice]');
    if (!button) return;
    const value = button.dataset.cookieChoice;
    try { localStorage.setItem(CONSENT_KEY, value); } catch {}
    applyChoice(value);
    setBannerVisible(false);
  });

  document.addEventListener('anna:whatsapp', event => trackWhatsAppClick(event.detail));
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="https://wa.me/"]') : null;
    if (link && !event.defaultPrevented) trackWhatsAppClick(link.dataset.source || 'contato_link');
  });
  window.addEventListener('storage', event => {
    if (event.key !== CONSENT_KEY && event.key !== null) return;
    const next = storedChoice();
    if (choice === next) return;
    applyChoice(next);
    setBannerVisible(!next);
  });
  applyChoice(storedChoice());
  if (!choice) setBannerVisible(true);
}

function googleEvent(name, parameters) {
  if (canTrack() && googleStarted) window.gtag('event', name, parameters);
}

function pixelEvent(...args) {
  if (canTrack() && pixelStarted) window.fbq(...args);
}

export function trackWhatsAppClick(source = 'cta') {
  const label = typeof source === 'string' && /^[a-z0-9_-]{1,64}$/i.test(source) ? source : 'cta';
  googleEvent('whatsapp_click', { source: label });
  pixelEvent('trackCustom', 'WhatsAppClick', { source: label });
}

export function trackLead(formId, receiptId) {
  if (!canTrack() || !receiptId || trackedReceipts.has(receiptId)) return;
  const key = `anna:generate_lead:${receiptId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {}
  trackedReceipts.add(receiptId);
  googleEvent('generate_lead', { form_id: formId });
  pixelEvent('track', 'Lead');
}

export function trackReviews() {
  googleEvent('reviews_click');
  pixelEvent('trackCustom', 'ReviewsClick');
}

export function trackPortfolioOpen(index) {
  googleEvent('portfolio_open', { index });
  pixelEvent('trackCustom', 'PortfolioOpen', { index });
}

export function trackScrollDepth() {
  googleEvent('scroll_25');
  pixelEvent('trackCustom', 'Scroll25');
}
