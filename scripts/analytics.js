// analytics.js — centraliza GA4 + Meta Pixel + binds
window.ANALYTICS_CFG = { GA4_ID: 'G-60ZPREPJV3', PIXEL_ID: 'YOUR_PIXEL_ID' };

(function(){
  const gsrc = 'https://www.googletagmanager.com/gtag/js?id=' + window.ANALYTICS_CFG.GA4_ID;
  const s = document.createElement('script'); s.async = true; s.src = gsrc;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent','default',{
    ad_user_data:'denied',
    ad_personalization:'denied',
    ad_storage:'denied',
    analytics_storage:'granted'
  });
  gtag('js', new Date());
  gtag('config', window.ANALYTICS_CFG.GA4_ID);
})();

(function(){
  !(function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)})(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  if (window.ANALYTICS_CFG.PIXEL_ID && window.ANALYTICS_CFG.PIXEL_ID !== 'YOUR_PIXEL_ID') {
    fbq('init', window.ANALYTICS_CFG.PIXEL_ID);
    fbq('track', 'PageView');
  }
})();

window.trackWhatsApp = function(source){
  if (typeof gtag !== 'undefined') gtag('event','whatsapp_click',{event_category:'Contato', source: source||'btn'});
  if (typeof fbq !== 'undefined') fbq('trackCustom','WhatsAppClick',{source: source||'btn'});
};

(function(){
  function bindWhats(){
    document.querySelectorAll('a[href*="wa.me"], a[href*="api.whatsapp.com"], button[data-whats-source]')
      .forEach(el => {
        if (el.__waBound) return;
        el.__waBound = true;
        el.addEventListener('click', () => {
          const src = el.getAttribute('data-whats-source') || 'link';
          window.trackWhatsApp(src);
        });
      });
  }
  bindWhats();
  document.addEventListener('DOMContentLoaded', bindWhats);
})();

(function(){
  document.addEventListener('submit', (e)=>{
    const f = e.target;
    if (f && f.tagName === 'FORM') {
      if (typeof gtag !== 'undefined') gtag('event','lead_submit',{form_action:f.action || ''});
      if (typeof fbq !== 'undefined') fbq('track','Lead');
    }
  });
})();

(function(){
  let fired25=false;
  window.addEventListener('scroll', ()=>{
    const p = (window.scrollY/(document.body.scrollHeight-window.innerHeight))*100;
    if (!fired25 && p>25){ fired25=true; gtag?.('event','scroll_25'); fbq?.('trackCustom','Scroll25'); }
  });
})();
