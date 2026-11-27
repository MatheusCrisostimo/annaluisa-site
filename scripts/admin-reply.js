import { replyDrafts, whatsAppLink } from './admin-reply-text.js';

export function mountOrderReply(dialog) {
  const order = dialog.querySelector('[data-reply-order]');
  const model = dialog.querySelector('[data-reply-model]');
  const message = dialog.querySelector('[data-reply-message]');
  const copy = dialog.querySelector('[data-reply-copy]');
  const whatsapp = dialog.querySelector('[data-reply-whatsapp]');
  const feedback = dialog.querySelector('[data-reply-feedback]');
  let active = null;

  function syncActions() {
    const text = message.value.trim();
    const link = text && active?.phone ? whatsAppLink(active.phone, text) : '';
    copy.disabled = !text;
    whatsapp.hidden = !link;
    if (link) whatsapp.href = link;
    else whatsapp.removeAttribute('href');
  }

  function loadDraft() {
    message.value = active?.drafts[model.value] ?? '';
    feedback.textContent = '';
    syncActions();
  }

  function clear() {
    active = null;
    order.textContent = '';
    loadDraft();
  }

  model.addEventListener('change', loadDraft);
  message.addEventListener('input', () => {
    if (!active) return;
    active.drafts[model.value] = message.value;
    feedback.textContent = '';
    syncActions();
  });

  copy.addEventListener('click', async () => {
    const current = active;
    const text = message.value.trim();
    if (!current || !text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (active === current) feedback.textContent = 'Mensagem copiada.';
    } catch {
      if (active !== current) return;
      message.focus();
      message.select();
      feedback.textContent = 'Texto selecionado. Use a opção Copiar do seu dispositivo.';
    }
  });

  dialog.querySelector('[data-reply-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (!dialog.open) clear(); });
  clear();

  return {
    open(lead) {
      if (dialog.open) return;
      const { suggested, drafts } = replyDrafts(lead);
      active = { drafts, phone: lead.autorizaWhatsApp === true ? lead.telefone : '' };
      order.textContent = [lead.nome, lead.id].filter(Boolean).join(' · ');
      model.value = suggested;
      loadDraft();
      dialog.showModal();
      model.focus();
    },
    reset() {
      if (dialog.open) dialog.close();
      clear();
    }
  };
}
