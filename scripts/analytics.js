// scripts/analytics.js — ESM puro, sem carregar GA/Pixel de novo
// Exports: trackWhatsAppClick, trackLead, trackReviews, openWhatsApp

// -- helpers de detecção
const hasGA = () => typeof window.gtag === "function";
const hasPX = () => typeof window.fbq === "function";

// -- eventos
export function trackWhatsAppClick(source = "cta") {
  try {
    hasGA() && window.gtag("event", "whatsapp_click", {
      event_category: "Contato",
      source: String(source)
    });
    hasPX() && window.fbq("trackCustom", "WhatsAppClick", { source: String(source) });
  } catch (_) {}
}

export function trackLead(formIdOrAction = "form") {
  try {
    hasGA() && window.gtag("event", "lead_submit", {
      form_action: String(formIdOrAction)
    });
    // Pixel: evento padrão para captação
    hasPX() && window.fbq("track", "Lead", { form_action: String(formIdOrAction) });
  } catch (_) {}
}

export function trackReviews() {
  try {
    hasGA() && window.gtag("event", "click_avaliacoes", { event_category: "Prova social" });
    hasPX() && window.fbq("trackCustom", "ClickAvaliacoes");
  } catch (_) {}
}

// -- helper para abrir WhatsApp com UTM
export function openWhatsApp({
  tel = "5521995440439",
  source = "cta",
  message = "Olá, vim do site e quero agendar maquiagem. Data/ocasião: ____ .",
  utm = { utm_source: "site", utm_medium: "cta", utm_campaign: "whatsapp" }
} = {}) {
  const qp = new URLSearchParams({ text: message, ...utm, src: source });
  const url = `https://wa.me/${tel}?${qp.toString()}`;

  trackWhatsAppClick(source);
  window.open(url, "_blank", "noopener,noreferrer");
}

// -- util opcional: disparar scroll_25 (se quiser chamar no index)
export function trackScroll25Once() {
  try {
    hasGA() && window.gtag("event", "scroll_25");
    hasPX() && window.fbq("trackCustom", "Scroll25");
  } catch (_) {}
}

