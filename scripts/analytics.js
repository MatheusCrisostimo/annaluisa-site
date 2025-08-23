// /scripts/analytics.js — módulo ESM resiliente (GA4 + Meta Pixel + eventos)

export const ANALYTICS_CFG = {
  GA4_ID: 'G-60ZPREPJV3',
  PIXEL_ID: 'YOUR_PIXEL_ID' // troque pelo ID real do Meta Pixel
};

// ---------- Boot helpers ----------
function ensureGA4() {
  if (typeof window.gtag === 'function') return;
  // load gtag.js
  const gid = ANALYTICS_CFG.GA4_ID;
  if (!gid) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + gid;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ window.dataLayer.push(arguments); };
  window.gtag('consent','default',{
    ad_user_data:'denied',
    ad_personalization:'denied',
    ad_storage:'denied',
    analytics_storage:'granted'
  });
  window.gtag('js', new Date());
  window.gtag('config', gid);
}

function ensurePixel() {
  if (typeof window.fbq === 'function') return;
  // Meta Pixel loader
  (function(f,b,e,v,n,t,s){
    if(f.fbq)return; n=f.fbq=function(){n.callMethod ?
      n.callMethod.apply(n,arguments) : n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n; n.push=n; n.loaded=!0; n.version='2.0';
    n.queue=[]; t=b.createElement(e); t.async=!0; t.src=v;
    s=b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t,s);
  })(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');

  if (ANALYTICS_CFG.PIXEL_ID && ANALYTICS_CFG.PIXEL_ID !== 'YOUR_PIXEL_ID') {
    window.fbq('init', ANALYTICS_CFG.PIXEL_ID);
    window.fbq('track', 'PageView');
  }
}

// initialize lazily after DOM is ready (safe em qualquer página)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { ensureGA4(); ensurePixel(); });
} else {
  ensureGA4(); ensurePixel();
}

// ---------- Eventos utilitários ----------
export function trackWhatsAppClick(source = 'cta') {
  try { window.gtag && window.gtag('event','whatsapp_click',{event_category:'Contato', source}); } catch {}
  try { window.fbq && window.fbq('trackCustom','WhatsAppClick',{source}); } catch {}
}

export function trackLead(formId = 'form') {
  try { window.gtag && window.gtag('event','lead_submit',{form_id: formId}); } catch {}
  try { window.fbq && window.fbq('track','Lead'); } catch {}
}

export function trackReviews() {
  try { window.gtag && window.gtag('event','reviews_click'); } catch {}
  try { window.fbq && window.fbq('trackCustom','ReviewsClick'); } catch {}
}

// (opcional) util para abrir WA via módulo — o site já tem fallback próprio
export function openWhatsApp({phone='5521995440439', text='Olá, vim do site e quero agendar maquiagem.', source='cta'} = {}) {
  const msg = encodeURIComponent(text);
  const url = `https://wa.me/${phone}?text=${msg}&utm_source=site&utm_medium=cta&utm_campaign=whatsapp&src=${encodeURIComponent(source)}`;
  window.open(url,'_blank','noopener,noreferrer');
}
