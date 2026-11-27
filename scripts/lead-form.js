import { getCampaignAttribution } from './attribution.js';

export function setupLeadForm(form, { origin, onSuccess }) {
  const feedback = form.querySelector('[data-lead-feedback]');
  const submit = form.querySelector('button[type="submit"]');
  const service = form.elements.namedItem('servico');
  const date = form.elements.namedItem('data');
  const bridal = form.querySelector('[data-lead-bridal]');
  const initialOrigin = new URLSearchParams(location.search).get('origem') === 'whatsapp'
    ? 'whatsapp' : origin;
  const source = form.elements.namedItem('origem');
  if (source) source.value = initialOrigin;
  const submitLabel = submit.textContent;
  let lastPayload;
  let submissionId;
  let chaveAcompanhamento;

  function syncServiceFields() {
    const isBridal = service.value === 'Noiva';
    if (bridal) {
      bridal.hidden = !isBridal;
      bridal.disabled = !isBridal;
    }
    date.required = isBridal || service.value === 'Maquiagem Social';
  }

  function showFeedback(message, receipt) {
    const title = document.createElement('p');
    title.className = 'font-semibold';
    title.textContent = message;
    feedback.replaceChildren(title);
    feedback.classList.toggle('text-rose-900', !receipt);
    feedback.classList.toggle('bg-rose-50', !receipt);
    feedback.classList.toggle('text-emerald-900', Boolean(receipt));
    feedback.classList.toggle('bg-emerald-50', Boolean(receipt));
    feedback.setAttribute('role', receipt ? 'status' : 'alert');
    feedback.hidden = false;

    if (receipt) {
      const details = document.createElement('p');
      details.className = 'mt-1';
      const timing = receipt.prazoRetorno ? ` Prazo de retorno: ${receipt.prazoRetorno}.` : '';
      details.textContent = `Protocolo ${receipt.leadId}.${timing} A Anna vai conferir a data e responder pelo WhatsApp.`;
      feedback.append(details);

      const actions = document.createElement('div');
      actions.className = 'btn-group-mobile mt-3 flex flex-wrap gap-2';
      if (typeof receipt.linkAcompanhamento === 'string' && receipt.linkAcompanhamento.startsWith('/acompanhar#')) {
        const trackingLink = document.createElement('a');
        trackingLink.className = 'btn btn-primary';
        trackingLink.href = receipt.linkAcompanhamento;
        trackingLink.textContent = 'Acompanhar pedido';
        actions.append(trackingLink);
      }
      if (typeof window.__openWA === 'function') {
        const followUp = document.createElement('button');
        followUp.type = 'button';
        followUp.className = 'btn btn-outline';
        followUp.textContent = 'Falar sobre este pedido';
        followUp.addEventListener('click', () => {
          window.__openWA('acompanhar_orcamento', `Olá, Anna! Gostaria de falar sobre o pedido ${receipt.leadId}.`);
        });
        actions.append(followUp);
      }
      if (actions.childElementCount) feedback.append(actions);
    }

    feedback.focus();
  }

  service.addEventListener('change', syncServiceFields);
  syncServiceFields();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;

    const formData = new FormData(form);
    const payload = {
      ...Object.fromEntries(formData),
      origem: source?.value || initialOrigin,
      itensNoiva: formData.getAll('itensNoiva')
    };
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPayload) {
      submissionId = crypto.randomUUID();
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      chaveAcompanhamento = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      lastPayload = serialized;
    }
    feedback.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Enviando pedido…';
    let receipt;

    try {
      const campanha = getCampaignAttribution();
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, submissionId, chaveAcompanhamento, ...(campanha ? { campanha } : {}) }),
        signal: AbortSignal.timeout(15000)
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.leadId) {
        showFeedback(data.error || 'Não foi possível salvar seu pedido. Tente novamente.');
      } else {
        receipt = data;
      }
    } catch {
      showFeedback('Não foi possível confirmar o envio. Seus dados continuam no formulário. Tente novamente.');
    } finally {
      submit.disabled = false;
      submit.textContent = submitLabel;
    }

    if (receipt) {
      form.reset();
      if (source) source.value = initialOrigin;
      syncServiceFields();
      lastPayload = undefined;
      showFeedback('Pedido recebido. A data ainda está sob consulta.', receipt);
      onSuccess?.(receipt);
    }
  });
}
