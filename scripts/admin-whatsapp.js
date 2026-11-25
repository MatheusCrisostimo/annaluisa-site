import { WHATSAPP_GREETING as GREETING, WHATSAPP_WEBHOOK_PATH as WEBHOOK_PATH } from './whatsapp-config.js';

const API_PATH = '/api/admin/whatsapp';
const PRODUCTION_CALLBACK = `https://annaluisamakeup.vercel.app${WEBHOOK_PATH}`;
const WEBHOOK_VARIABLES = [
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_PHONE_NUMBER_ID'
];
const REPLY_VARIABLES = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_API_VERSION',
  'WHATSAPP_AUTOREPLY_ENABLED'
];
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
});
const buttonClass = 'min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50';

function formatDateTime(value) {
  if (!value) return 'Aguardando registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Aguardando registro' : dateTime.format(date);
}

function showMissing(target, requested, names) {
  const missing = names.filter(name => requested.includes(name));
  const fragment = document.createDocumentFragment();
  missing.forEach(name => {
    const item = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = name;
    item.append(code);
    fragment.append(item);
  });
  target.replaceChildren(fragment);
  target.parentElement.hidden = !missing.length;
}

export function mountWhatsApp(root, { api }) {
  let generation = 0;
  let mounted = false;
  let loading = false;

  function render() {
    root.innerHTML = `
      <section class="grid gap-4" aria-labelledby="whatsapp-title">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="whatsapp-title" class="text-xl font-semibold text-neutral-900">WhatsApp</h2>
            <p class="mt-1 max-w-xl text-sm text-neutral-600">Acompanhe a conexão e o direcionamento inicial para o formulário de orçamento.</p>
          </div>
          <button id="whatsapp-refresh" type="button" class="${buttonClass}">Atualizar status</button>
        </div>

        <div class="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <h3 class="text-sm font-semibold text-neutral-900">Webhook</h3>
              <p id="whatsapp-webhook-status" class="mt-1 text-sm text-neutral-700"></p>
              <div class="mt-2 text-xs text-amber-900" hidden>
                <p class="font-medium">Variáveis pendentes do webhook</p>
                <ul id="whatsapp-missing-webhook" class="mt-1 grid gap-1 break-all"></ul>
              </div>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-neutral-900">Resposta automática</h3>
              <p id="whatsapp-auto-reply-status" class="mt-1 text-sm text-neutral-700"></p>
              <div class="mt-2 text-xs text-amber-900" hidden>
                <p class="font-medium">Variáveis pendentes para responder</p>
                <ul id="whatsapp-missing-reply" class="mt-1 grid gap-1 break-all"></ul>
              </div>
            </div>
          </div>
          <dl class="mt-4 grid gap-3 border-t border-neutral-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt class="text-xs font-medium text-neutral-600">Última verificação</dt>
              <dd id="whatsapp-last-verification" class="mt-0.5 text-sm text-neutral-900"></dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-neutral-600">Último evento recebido</dt>
              <dd id="whatsapp-last-event" class="mt-0.5 text-sm text-neutral-900"></dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-neutral-600">Última tentativa de resposta</dt>
              <dd id="whatsapp-last-reply" class="mt-0.5 text-sm text-neutral-900"></dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-neutral-600">Retorno da Meta</dt>
              <dd id="whatsapp-last-reply-status" class="mt-0.5 text-sm text-neutral-900"></dd>
            </div>
          </dl>
          <p class="mt-4 text-xs text-neutral-600">Os registros correspondem ao ambiente aberto neste painel.</p>
          <p id="whatsapp-feedback" class="mt-3 text-sm" role="status" aria-live="polite"></p>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <h3 class="text-sm font-semibold text-neutral-900">Testar na prévia</h3>
            <p class="mt-2 text-sm text-neutral-700">A prévia protegida do PR serve para revisar o painel. Para receber testes da Meta, use um deployment de teste com uma URL HTTPS pública.</p>
            <ol class="mt-3 list-decimal space-y-3 pl-5 text-sm text-neutral-700">
              <li>Use o número de teste da Meta e um telefone de destinatário cadastrado no teste. Comece com <code class="break-all">WHATSAPP_AUTOREPLY_ENABLED=false</code>.</li>
              <li>Configure o callback com o domínio público da prévia seguido de <code class="break-all">${WEBHOOK_PATH}</code>. Valide o webhook no painel da Meta e assine o campo <code>messages</code>.</li>
              <li>Envie uma mensagem de teste para o número de teste e atualize o status aqui. Confira as datas de verificação e de recebimento.</li>
              <li>Para testar a saudação, habilite a resposta no ambiente de teste e envie uma mensagem de outro telefone cadastrado no teste.</li>
            </ol>
          </section>

          <section class="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <h3 class="text-sm font-semibold text-neutral-900">Preparar a ativação</h3>
            <p class="mt-3 text-sm text-neutral-700">Confirme primeiro que Anna pode continuar as conversas pelo WhatsApp Business com Coexistência, se o número for elegível, ou pela caixa de entrada compartilhada do provedor.</p>
            <p class="mt-2 text-sm text-neutral-700">Configure as variáveis no ambiente correspondente da Vercel. Após validar o atendimento humano, use <code class="break-all">WHATSAPP_AUTOREPLY_ENABLED=true</code> no ambiente que deve responder.</p>
            <div class="mt-3 rounded-xl bg-neutral-50 p-3">
              <p class="text-xs font-semibold text-neutral-700">Callback do site em produção</p>
              <code class="mt-1 block break-all text-xs text-neutral-900">${PRODUCTION_CALLBACK}</code>
            </div>
          </section>
        </div>

        <section class="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 class="text-sm font-semibold text-neutral-900">Saudação automática</h3>
          <p class="mt-2 text-sm text-neutral-700">A saudação vale para uma mensagem de texto recente no primeiro contato ou após 14 dias sem mensagem da pessoa. Protocolos, pedidos de atendimento humano e pedidos para parar ficam fora da resposta automática.</p>
          <blockquote class="mt-3 whitespace-pre-wrap break-words rounded-xl bg-neutral-50 p-3 text-sm text-neutral-800">${GREETING}</blockquote>
        </section>

        <details class="rounded-xl border border-neutral-200 bg-white p-4">
          <summary class="cursor-pointer text-sm font-semibold text-neutral-900">Variáveis da integração</summary>
          <p class="mt-3 text-sm text-neutral-700">Adicione os valores no painel da Vercel, nas variáveis de ambiente do projeto.</p>
          <div class="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <p class="text-xs font-medium text-neutral-700">Webhook</p>
              <ul class="mt-1 grid gap-1 break-all text-xs text-neutral-900">${WEBHOOK_VARIABLES.map(name => `<li><code>${name}</code></li>`).join('')}</ul>
            </div>
            <div>
              <p class="text-xs font-medium text-neutral-700">Resposta automática</p>
              <ul class="mt-1 grid gap-1 break-all text-xs text-neutral-900">${REPLY_VARIABLES.map(name => `<li><code>${name}</code></li>`).join('')}</ul>
            </div>
          </div>
        </details>
      </section>
    `;
    root.querySelector('#whatsapp-refresh').addEventListener('click', load);
    mounted = true;
  }

  function updateStatus(config, webhook) {
    const webhookStatus = config.missingWebhook.length ? 'Configuração pendente'
      : webhook.lastVerifiedAt ? 'Webhook verificado' : 'Configurado, aguardando verificação';
    const replyStatus = config.enabled ? 'Resposta automática ativa'
      : config.requested ? 'Ativação pendente' : 'Resposta automática desativada';
    const metaResult = {
      accepted: 'Solicitação aceita pela Meta',
      failed: 'Falha na solicitação à Meta',
      unknown: 'Resultado indeterminado'
    };
    root.querySelector('#whatsapp-webhook-status').textContent = webhookStatus;
    root.querySelector('#whatsapp-auto-reply-status').textContent = replyStatus;
    root.querySelector('#whatsapp-last-verification').textContent = formatDateTime(webhook.lastVerifiedAt);
    root.querySelector('#whatsapp-last-event').textContent = formatDateTime(webhook.lastEventAt);
    root.querySelector('#whatsapp-last-reply').textContent = formatDateTime(webhook.lastReplyAt);
    root.querySelector('#whatsapp-last-reply-status').textContent = Object.hasOwn(metaResult, webhook.lastReplyStatus)
      ? metaResult[webhook.lastReplyStatus] : 'Aguardando registro';
    showMissing(root.querySelector('#whatsapp-missing-webhook'), config.missingWebhook, WEBHOOK_VARIABLES);
    showMissing(root.querySelector('#whatsapp-missing-reply'), config.missingReply, REPLY_VARIABLES);
  }

  async function load() {
    if (loading) return;
    if (!mounted) render();
    const token = ++generation;
    const refresh = root.querySelector('#whatsapp-refresh');
    const feedback = root.querySelector('#whatsapp-feedback');
    loading = true;
    refresh.disabled = true;
    feedback.className = 'mt-3 text-sm text-neutral-600';
    feedback.textContent = 'Consultando a integração…';
    try {
      const { config, webhook } = await api(API_PATH);
      if (token !== generation) return;
      updateStatus(config, webhook);
      feedback.textContent = '';
    } catch {
      if (token !== generation) return;
      feedback.className = 'mt-3 text-sm text-rose-700';
      feedback.textContent = 'Não foi possível consultar o status. Use Atualizar status para tentar novamente.';
    } finally {
      if (token === generation) {
        loading = false;
        refresh.disabled = false;
      }
    }
  }

  return {
    enter: load,
    reset() {
      generation += 1;
      loading = false;
      mounted = false;
      root.replaceChildren();
    }
  };
}
