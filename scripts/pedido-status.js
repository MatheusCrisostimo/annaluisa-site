const linkPattern = /^#(AL-[A-Za-z0-9_-]{22})\.([a-f0-9]{64})$/;
const heading = document.querySelector('#pedido-situacao');
const message = document.querySelector('#pedido-mensagem');
const protocolDisplay = document.querySelector('#pedido-protocolo');
const actions = document.querySelector('#pedido-acoes');
const refresh = document.querySelector('#pedido-atualizar');
const copy = document.querySelector('#pedido-copiar');
const copyFeedback = document.querySelector('#pedido-copia');
const descriptions = {
  pendente: ['Pedido recebido', 'A Anna vai conferir a disponibilidade e responder pelo WhatsApp.'],
  respondido: ['Resposta registrada', 'A Anna marcou o pedido como respondido. Confira a mensagem no WhatsApp informado no formulário.']
};
let requestNumber = 0;

function show(title, description) {
  heading.textContent = title;
  message.textContent = description;
}

function invalidLink() {
  actions.hidden = true;
  show('Link indisponível', 'Abra o link pessoal exibido na confirmação do seu pedido.');
}

async function loadStatus() {
  const request = ++requestNumber;
  protocolDisplay.hidden = true;
  copy.hidden = true;
  copyFeedback.hidden = true;
  const match = location.hash.match(linkPattern);
  if (!match) {
    invalidLink();
    return;
  }

  const [, protocolo, chaveAcompanhamento] = match;
  actions.hidden = false;
  refresh.disabled = true;
  show('Consultando seu pedido…', '');
  try {
    const response = await fetch('/api/pedido/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolo, chaveAcompanhamento }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (request !== requestNumber) return;
    if (response.status === 404) {
      invalidLink();
      return;
    }
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (request !== requestNumber) return;
    if (!data.success || !Object.hasOwn(descriptions, data.status)) throw new Error();

    show(...descriptions[data.status]);
    protocolDisplay.textContent = `Protocolo ${protocolo}`;
    protocolDisplay.hidden = false;
    copy.hidden = false;
  } catch {
    if (request === requestNumber) {
      show('Consulta indisponível', 'Não foi possível atualizar a situação agora. Tente novamente em instantes.');
    }
  } finally {
    if (request === requestNumber) refresh.disabled = false;
  }
}

refresh.addEventListener('click', loadStatus);
copy.addEventListener('click', async () => {
  const request = requestNumber;
  const link = new URL(`/acompanhar${location.hash}`, location.origin);
  let feedback;
  try {
    await navigator.clipboard.writeText(link.href);
    feedback = 'Link copiado. Guarde-o para consultar depois.';
  } catch {
    feedback = 'Copie o endereço da barra do navegador para guardar seu link.';
  }
  if (request === requestNumber) {
    copyFeedback.textContent = feedback;
    copyFeedback.hidden = false;
  }
});
window.addEventListener('hashchange', loadStatus);
loadStatus();
