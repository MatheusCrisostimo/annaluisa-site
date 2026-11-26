const PREFERENCE_KEY = 'cookieConsent';
const CAMPAIGN_KEY = 'annaCampaignAttribution';
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign'];
const ENTRY_PAGES = new Map([
  ['/', '/'], ['/index.html', '/'], ['/noivas', '/noivas'], ['/noivas.html', '/noivas'],
  ['/agendar', '/agendar'], ['/agendar.html', '/agendar'], ['/links', '/links'],
  ['/links/', '/links'], ['/links.html', '/links'], ['/links/index.html', '/links']
]);

export function normalizeCampaign(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const campaign = {};
  for (const field of UTM_FIELDS) {
    if (typeof input[field] !== 'string') continue;
    const value = input[field].trim();
    if (/^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,79}$/u.test(value)) campaign[field] = value;
  }
  if (!Object.keys(campaign).length) return null;
  const page = ENTRY_PAGES.get(input.paginaEntrada);
  if (page) campaign.paginaEntrada = page;
  return campaign;
}

export function captureCampaignAttribution() {
  try {
    if (window.localStorage.getItem(PREFERENCE_KEY) !== 'granted') return;
    const params = new URLSearchParams(window.location.search);
    const campaign = normalizeCampaign({
      ...Object.fromEntries(UTM_FIELDS.map(field => [field, params.get(field)])),
      paginaEntrada: window.location.pathname
    });
    if (campaign) window.sessionStorage.setItem(CAMPAIGN_KEY, JSON.stringify(campaign));
  } catch {
    // Storage can be unavailable in a private browser session.
  }
}

export function getCampaignAttribution() {
  try {
    if (window.localStorage.getItem(PREFERENCE_KEY) !== 'granted') return null;
    return normalizeCampaign(JSON.parse(window.sessionStorage.getItem(CAMPAIGN_KEY)));
  } catch {
    return null;
  }
}

export function clearCampaignAttribution() {
  try {
    window.sessionStorage.removeItem(CAMPAIGN_KEY);
  } catch {
    // The browser may block storage for this page.
  }
}
