import { parseMoneyCents } from './admin-money.js';

const API_PATH = '/api/admin/propostas';
const currencyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moneyInputFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BRT_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
const buttonClass = 'rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50';
const primaryButtonClass = 'rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50';
const inputClass = 'mt-1 block w-full rounded-lg border border-neutral-200 bg-white p-2.5 text-sm text-neutral-900';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : '';
}

function isExpired(proposal) {
  return proposal.status === 'pronta' && proposal.validade < BRT_DATE.format(new Date());
}

function statusText(proposal) {
  if (proposal.status !== 'pronta') return 'Rascunho';
  return isExpired(proposal) ? 'Validade vencida' : 'Pronta para envio';
}

function previewText(proposal, edits) {
  const lines = [
    'Proposta de atendimento | Anna Luísa',
    proposal.nome ? `Cliente: ${proposal.nome}` : '',
    edits.servico ? `Serviço: ${edits.servico}` : '',
    edits.data ? `Data solicitada: ${formatDate(edits.data)}` : '',
    edits.horario ? `Horário solicitado para estar pronta: ${edits.horario}` : '',
    edits.cidade ? `Cidade: ${edits.cidade}` : '',
    edits.numeroPessoas ? `Pessoas: ${edits.numeroPessoas}` : '',
    edits.itens ? `\nItens da proposta\n${edits.itens}` : '',
    Number.isSafeInteger(edits.precoCentavos) ? `\nValor total: ${currencyFormat.format(edits.precoCentavos / 100)}` : '',
    edits.condicoes ? `\nCondições comerciais\n${edits.condicoes}` : '',
    edits.validade ? `\nVálida até ${formatDate(edits.validade)}.` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

export function mountProposals(root, { api, onContract }) {
  let generation = 0;
  let view = 'idle';

  function renderMessage(message) {
    root.innerHTML = '<p class="rounded-xl border border-neutral-100 bg-white p-5 text-sm text-neutral-600" role="status"></p>';
    root.firstElementChild.textContent = message;
  }

  function renderList(proposals) {
    const cards = proposals.map(proposal => `
      <li class="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="break-words text-sm font-semibold text-neutral-900">${escapeHtml(proposal.nome || 'Cliente')}</p>
          <p class="break-words text-xs text-neutral-600">${escapeHtml(proposal.servico)} · ${escapeHtml(statusText(proposal))}</p>
          <p class="mt-1 break-all text-[11px] text-neutral-500">Protocolo ${escapeHtml(proposal.leadId)}</p>
          ${proposal.precoCentavos !== null ? `<p class="mt-1 text-xs text-neutral-600">${escapeHtml(currencyFormat.format(proposal.precoCentavos / 100))}</p>` : ''}
        </div>
        <button type="button" data-proposal-id="${escapeHtml(proposal.leadId)}" class="${buttonClass} shrink-0">Abrir proposta</button>
      </li>
    `).join('');

    root.innerHTML = `
      <section class="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-neutral-900">Propostas salvas</h2>
          <button type="button" data-proposal-refresh class="${buttonClass}">Atualizar</button>
        </div>
        ${cards ? `<ul class="grid gap-2">${cards}</ul>` : '<p class="text-sm text-neutral-600">Abra um pedido na fila para preparar a primeira proposta.</p>'}
      </section>
    `;
    root.querySelector('[data-proposal-refresh]').addEventListener('click', loadList);
    root.querySelectorAll('[data-proposal-id]').forEach(button => {
      button.addEventListener('click', () => openLead({ id: button.dataset.proposalId }));
    });
  }

  async function loadList() {
    const token = ++generation;
    view = 'loading-list';
    renderMessage('Carregando propostas…');
    try {
      const result = await api(API_PATH);
      if (token !== generation) return;
      view = 'list';
      renderList(result.proposals);
    } catch (error) {
      if (token !== generation) return;
      view = 'idle';
      renderMessage(error.message || 'Não foi possível carregar as propostas.');
    }
  }

  function renderEditor(loaded, models, token) {
    let saved = loaded;
    let submitting = false;
    const contact = [saved.telefone, saved.email].filter(Boolean).map(escapeHtml).join(' · ');
    root.innerHTML = `
      <section class="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="break-words text-sm font-semibold text-neutral-900">Proposta para ${escapeHtml(saved.nome || 'cliente')}</h2>
            <p class="mt-1 break-all text-xs text-neutral-500">Protocolo ${escapeHtml(saved.leadId)}</p>
            ${contact ? `<p class="mt-1 break-all text-xs text-neutral-600">${contact}</p>` : ''}
            <p data-proposal-status class="mt-2 text-xs font-medium text-neutral-700"></p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-proposal-back class="${buttonClass}">Ver propostas salvas</button>
            <button type="button" data-proposal-reload class="${buttonClass}">Recarregar proposta</button>
          </div>
        </div>
        <div class="grid items-start gap-5 lg:grid-cols-2">
          <form data-proposal-form>
            <fieldset class="grid gap-3 disabled:opacity-60" data-proposal-fields>
              <div class="flex flex-col items-start gap-2 rounded-lg bg-neutral-50 p-3 sm:flex-row sm:items-end">
                <label class="w-full text-xs font-medium text-neutral-700">
                  Modelo
                  <select aria-label="Modelo de proposta" data-proposal-model class="${inputClass}">
                    ${models.map(model => `<option value="${escapeHtml(model.servico)}">${escapeHtml(model.servico)}</option>`).join('')}
                  </select>
                </label>
                <button type="button" data-proposal-apply class="${buttonClass} whitespace-nowrap bg-white">Aplicar ao serviço e itens</button>
              </div>
              <label class="text-xs font-medium text-neutral-700">Serviço
                <input id="proposal-service" name="servico" maxlength="100" class="${inputClass}">
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs font-medium text-neutral-700">Data do atendimento
                  <input id="proposal-date" name="data" type="date" class="${inputClass}">
                </label>
                <label class="text-xs font-medium text-neutral-700">Horário solicitado
                  <input id="proposal-time" name="horario" type="time" class="${inputClass}">
                </label>
                <label class="text-xs font-medium text-neutral-700">Cidade
                  <input id="proposal-city" name="cidade" maxlength="100" class="${inputClass}">
                </label>
                <label class="text-xs font-medium text-neutral-700">Quantidade de pessoas
                  <input id="proposal-people" name="numeroPessoas" maxlength="100" class="${inputClass}">
                </label>
              </div>
              <label class="text-xs font-medium text-neutral-700">Itens da proposta
                <textarea id="proposal-items" name="itens" rows="4" maxlength="3000" class="${inputClass}"></textarea>
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs font-medium text-neutral-700">Valor total (R$)
                  <input id="proposal-price" name="preco" inputmode="decimal" placeholder="0,00" maxlength="24" class="${inputClass}">
                </label>
                <label class="text-xs font-medium text-neutral-700">Validade da proposta
                  <input id="proposal-validity" name="validade" type="date" class="${inputClass}">
                </label>
              </div>
              <label class="text-xs font-medium text-neutral-700">Condições comerciais
                <textarea id="proposal-terms" name="condicoes" rows="3" maxlength="3000" class="${inputClass}"></textarea>
              </label>
              <div class="flex flex-wrap gap-2">
                <button type="submit" value="rascunho" class="${buttonClass}">Salvar rascunho</button>
                <button type="submit" value="pronta" class="${primaryButtonClass}">Marcar como pronta</button>
              </div>
            </fieldset>
          </form>
          <div class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <label for="proposal-preview" class="text-sm font-semibold text-neutral-900">Prévia em texto</label>
            <textarea id="proposal-preview" readonly rows="15" class="mt-2 w-full rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-800"></textarea>
            <button type="button" data-proposal-copy class="${buttonClass} mt-2 bg-white">Copiar proposta</button>
            <button type="button" data-proposal-contract class="${buttonClass} mt-2 bg-white" hidden>Preparar contrato</button>
            <p data-copy-hint class="mt-1 text-xs text-neutral-600"></p>
          </div>
        </div>
        <p data-proposal-feedback class="mt-3 text-sm" role="status" aria-live="polite"></p>
      </section>
    `;
    const form = root.querySelector('[data-proposal-form]');
    const fields = root.querySelector('[data-proposal-fields]');
    const selectModel = root.querySelector('[data-proposal-model]');
    const status = root.querySelector('[data-proposal-status]');
    const preview = root.querySelector('#proposal-preview');
    const copy = root.querySelector('[data-proposal-copy]');
    const contract = root.querySelector('[data-proposal-contract]');
    const copyHint = root.querySelector('[data-copy-hint]');
    const feedback = root.querySelector('[data-proposal-feedback]');
    const field = name => form.elements.namedItem(name);
    const editable = ['servico', 'data', 'horario', 'cidade', 'numeroPessoas', 'itens', 'condicoes', 'validade'];

    for (const name of editable) field(name).value = saved[name] || '';
    field('preco').value = Number.isSafeInteger(saved.precoCentavos) ? moneyInputFormat.format(saved.precoCentavos / 100) : '';
    if (models.some(model => model.servico === saved.servico)) selectModel.value = saved.servico;

    function edits() {
      const values = Object.fromEntries(editable.map(name => [name, field(name).value.trim()]));
      return { ...values, precoCentavos: parseMoneyCents(field('preco').value) };
    }

    function showFeedback(message, isError = false) {
      feedback.textContent = message;
      feedback.classList.toggle('text-rose-700', isError);
      feedback.classList.toggle('text-emerald-700', !isError);
    }

    function refresh() {
      const values = edits();
      const changed = Object.entries(values).some(([name, value]) => value !== saved[name]);
      status.textContent = saved.revision ? statusText(saved) : 'Rascunho ainda não salvo';
      preview.value = previewText(saved, values);
      copy.disabled = submitting || changed || saved.status !== 'pronta' || isExpired(saved);
      contract.hidden = !onContract || saved.status !== 'pronta';
      contract.disabled = submitting || changed;
      copyHint.textContent = copy.disabled && !submitting
        ? 'Salve a versão atual como pronta, com validade vigente, para copiar a proposta.'
        : '';
    }

    form.addEventListener('input', refresh);
    root.querySelector('[data-proposal-back]').addEventListener('click', loadList);
    root.querySelector('[data-proposal-reload]').addEventListener('click', () => openLead({ id: saved.leadId }));
    root.querySelector('[data-proposal-apply]').addEventListener('click', () => {
      const model = models.find(item => item.servico === selectModel.value);
      if (!model) return;
      field('servico').value = model.servico;
      field('itens').value = model.itens;
      refresh();
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submitting) return;
      const values = edits();
      const nextStatus = event.submitter?.value || 'rascunho';
      if (Number.isNaN(values.precoCentavos) || (nextStatus === 'pronta' && !values.precoCentavos)) {
        showFeedback('Informe o valor total em reais antes de concluir a proposta.', true);
        field('preco').focus();
        return;
      }
      if (nextStatus === 'pronta' && (!values.validade || values.validade < BRT_DATE.format(new Date()))) {
        showFeedback('Informe uma validade igual ou posterior a hoje.', true);
        field('validade').focus();
        return;
      }

      submitting = true;
      fields.disabled = true;
      showFeedback('');
      refresh();
      try {
        const result = await api(`${API_PATH}/${encodeURIComponent(saved.leadId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...values, status: nextStatus, revision: saved.revision })
        });
        if (token !== generation) return;
        saved = result.proposal;
        showFeedback(nextStatus === 'pronta' ? 'Proposta pronta para copiar.' : 'Rascunho salvo.');
      } catch (error) {
        if (token !== generation) return;
        showFeedback(error.message || 'Não foi possível salvar a proposta.', true);
      } finally {
        if (token === generation) {
          submitting = false;
          fields.disabled = false;
          refresh();
        }
      }
    });

    copy.addEventListener('click', async () => {
      if (copy.disabled) return;
      try {
        await navigator.clipboard.writeText(preview.value);
        if (token === generation) showFeedback('Texto da proposta copiado.');
      } catch {
        if (token !== generation) return;
        preview.select();
        showFeedback('Selecione a opção de copiar do seu dispositivo.');
      }
    });
    contract.addEventListener('click', () => onContract?.(saved.leadId));
    refresh();
  }

  async function openLead(lead) {
    if (!lead?.id) return;
    const token = ++generation;
    view = 'loading-editor';
    renderMessage('Preparando proposta…');
    try {
      const result = await api(`${API_PATH}/${encodeURIComponent(lead.id)}`);
      if (token !== generation) return;
      view = 'editor';
      renderEditor(result.proposal, result.modelos, token);
    } catch (error) {
      if (token !== generation) return;
      view = 'idle';
      renderMessage(error.message || 'Não foi possível abrir este pedido.');
    }
  }

  return {
    enter() {
      if (view === 'idle' || view === 'list') return loadList();
    },
    openLead,
    reset() {
      generation += 1;
      view = 'idle';
      root.replaceChildren();
    }
  };
}
