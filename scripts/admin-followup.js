const API_PATH = '/api/admin/acompanhamento';
const BRT_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
const WHOLE_REAIS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const CONTRACT_STATUS = {
  a_enviar: 'Contrato a enviar',
  enviado: 'Aguardando assinatura',
  assinado: 'Contrato assinado'
};
const REMINDER_LABELS = {
  assinatura: 'Assinatura do contrato',
  sinal: 'Vencimento do sinal',
  saldo: 'Vencimento do saldo'
};
const buttonClass = 'min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50';
const primaryButtonClass = 'min-h-11 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50';
const inputClass = 'mt-1 block w-full min-h-11 rounded-lg border border-neutral-200 bg-white p-2.5 text-sm font-normal text-neutral-900';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : '';
}

function formatMoney(value) {
  const cents = BigInt(value);
  return `${WHOLE_REAIS.format(cents / 100n)},${String(cents % 100n).padStart(2, '0')}`;
}

function parseMoney(value, empty) {
  let amount = value.trim().replace(/^R\$\s*/, '');
  if (!amount) return empty;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(amount)) {
    amount = amount.replaceAll('.', '');
  }
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(amount)) return NaN;
  const [whole, fraction = ''] = amount.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : NaN;
}

function remaining(record) {
  return Math.max(0, record.totalCentavos - record.recebidoCentavos);
}

function signalPending(record) {
  return record.sinalCentavos !== null && record.sinalCentavos > record.recebidoCentavos;
}

function readyToConfirm(record) {
  return record.revision > 0 && record.contratoStatus === 'assinado'
    && record.sinalCentavos !== null && !signalPending(record);
}

function overdueDates(record, today) {
  const dates = [];
  if (signalPending(record) && record.sinalVenceEm && record.sinalVenceEm < today) dates.push(record.sinalVenceEm);
  if (remaining(record) > 0 && record.saldoVenceEm && record.saldoVenceEm < today) dates.push(record.saldoVenceEm);
  return dates.sort();
}

function badge(text, tone = 'neutral') {
  const styles = {
    neutral: 'bg-neutral-100 text-neutral-800',
    amber: 'bg-amber-100 text-amber-900',
    rose: 'bg-rose-100 text-rose-900',
    green: 'bg-emerald-100 text-emerald-900'
  };
  return `<span class="rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}">${escapeHtml(text)}</span>`;
}

function statusBadges(record, today) {
  const tags = [badge(CONTRACT_STATUS[record.contratoStatus])];
  if (signalPending(record) && record.sinalVenceEm) {
    tags.push(record.sinalVenceEm < today ? badge('Sinal vencido', 'rose') : badge('Sinal pendente', 'amber'));
  }
  if (remaining(record) > 0 && record.saldoVenceEm) {
    tags.push(record.saldoVenceEm < today ? badge('Saldo vencido', 'rose') : badge('Saldo pendente', 'amber'));
  }
  if (!remaining(record)) tags.push(badge('Pagamento quitado', 'green'));
  if (readyToConfirm(record)) tags.push(badge('Pronto para confirmar na agenda', 'green'));
  return tags.join('');
}

function remindersFor(record) {
  const reminders = {};
  if (!record.revision || record.autorizaWhatsApp !== true) return reminders;

  const firstName = (record.nome || '').trim().split(/\s+/)[0];
  const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!';
  if (record.contratoStatus === 'enviado') {
    reminders.assinatura = `${greeting} Você conseguiu revisar o contrato do seu atendimento? Fico à disposição se tiver alguma dúvida sobre a assinatura.`;
  }
  if (signalPending(record) && record.sinalVenceEm) {
    reminders.sinal = `${greeting} Passando para lembrar do sinal do seu atendimento, com vencimento em ${formatDate(record.sinalVenceEm)}. Se já tiver feito o pagamento, pode desconsiderar esta mensagem.`;
  } else if (remaining(record) > 0 && record.saldoVenceEm) {
    reminders.saldo = `${greeting} Passando para lembrar do saldo do seu atendimento, com vencimento em ${formatDate(record.saldoVenceEm)}. Se já tiver feito o pagamento, pode desconsiderar esta mensagem.`;
  }
  return reminders;
}

export function mountFollowup(root, { api }) {
  let generation = 0;
  let view = 'idle';

  function showMessage(message) {
    root.innerHTML = '<p class="rounded-xl border border-neutral-100 bg-white p-5 text-sm text-neutral-600" role="status"></p>';
    root.firstElementChild.textContent = message;
  }

  function showError(error, retry, lead) {
    view = 'error';
    root.innerHTML = `
      <section class="rounded-xl border border-neutral-100 bg-white p-5">
        <p role="alert" class="text-sm text-rose-700"></p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" data-followup-retry class="${buttonClass}">Tentar novamente</button>
          ${lead ? `<button type="button" data-followup-list class="${buttonClass}">Ver acompanhamentos</button>` : ''}
        </div>
      </section>
    `;
    root.querySelector('[role="alert"]').textContent = lead && error.status === 409
      ? 'Salve a proposta deste pedido como pronta para iniciar o acompanhamento.'
      : error.message || 'Não foi possível acessar o acompanhamento.';
    root.querySelector('[data-followup-retry]').addEventListener('click', retry);
    root.querySelector('[data-followup-list]')?.addEventListener('click', loadList);
  }

  function renderList(records) {
    view = 'list';
    const today = BRT_DATE.format(new Date());
    const entries = records.map(record => ({ record, overdue: overdueDates(record, today)[0] || '' }));
    entries.sort((first, second) => {
      if (Boolean(first.overdue) !== Boolean(second.overdue)) return first.overdue ? -1 : 1;
      return first.overdue.localeCompare(second.overdue) || second.record.updatedAt.localeCompare(first.record.updatedAt);
    });
    const overdueCount = entries.filter(item => item.overdue).length;
    const rows = entries.map(({ record }) => `
      <li class="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <h3 class="break-words text-sm font-semibold text-neutral-900">${escapeHtml(record.nome)}</h3>
          <p class="mt-1 break-words text-xs text-neutral-600">${escapeHtml(record.servico)}${record.dataEvento ? ` · ${escapeHtml(formatDate(record.dataEvento))}` : ''}</p>
          <p class="mt-1 break-all text-xs text-neutral-500">Protocolo ${escapeHtml(record.leadId)}</p>
          <div class="mt-2 flex flex-wrap gap-1.5">${statusBadges(record, today)}</div>
          <p class="mt-2 text-xs text-neutral-700">Saldo em aberto: R$ ${formatMoney(remaining(record))}</p>
        </div>
        <button type="button" data-followup-lead="${escapeHtml(record.leadId)}" class="${buttonClass} sm:shrink-0">Abrir acompanhamento</button>
      </li>
    `).join('');
    root.innerHTML = `
      <section class="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-neutral-900">Contratos e pagamentos</h2>
            <p class="mt-1 text-xs text-neutral-600">${overdueCount === 1 ? '1 pedido com pagamento vencido' : `${overdueCount} pedidos com pagamento vencido`}</p>
          </div>
          <button type="button" data-followup-refresh class="${buttonClass}">Atualizar</button>
        </div>
        ${rows ? `<ul class="grid gap-2">${rows}</ul>` : '<p class="text-sm text-neutral-600">Abra um pedido com proposta pronta para iniciar o acompanhamento.</p>'}
      </section>
    `;
    root.querySelector('[data-followup-refresh]').addEventListener('click', loadList);
    root.querySelectorAll('[data-followup-lead]').forEach(button => {
      button.addEventListener('click', () => openLead({ id: button.dataset.followupLead }));
    });
  }

  async function loadList() {
    const token = ++generation;
    view = 'loading';
    showMessage('Carregando acompanhamentos…');
    try {
      const result = await api(API_PATH);
      if (token === generation) renderList(result.acompanhamentos);
    } catch (error) {
      if (token === generation) showError(error, loadList);
    }
  }

  function renderEditor(record, token) {
    view = 'editor';
    const latest = record.propostaTotalAtualCentavos;
    const canAdopt = record.revision > 0 && Number.isSafeInteger(latest) && latest !== record.totalCentavos;
    const reminderChoices = remindersFor(record);
    const reminderOptions = Object.keys(reminderChoices);
    const contact = record.telefone ? `<p class="mt-1 break-words text-xs text-neutral-600">WhatsApp ${escapeHtml(record.telefone)}</p>` : '';
    root.innerHTML = `
      <section class="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="break-words text-sm font-semibold text-neutral-900">Acompanhamento de ${escapeHtml(record.nome)}</h2>
            <p class="mt-1 break-all text-xs text-neutral-500">Protocolo ${escapeHtml(record.leadId)}</p>
            <p class="mt-1 break-words text-xs text-neutral-600">${escapeHtml(record.servico)}${record.dataEvento ? ` · ${escapeHtml(formatDate(record.dataEvento))}` : ''}</p>
            ${contact}
            ${record.revision ? `<div class="mt-2 flex flex-wrap gap-1.5">${statusBadges(record, BRT_DATE.format(new Date()))}</div>` : ''}
          </div>
          <button type="button" data-followup-list class="${buttonClass}">Ver acompanhamentos</button>
        </div>
        <div class="grid items-start gap-5 lg:grid-cols-2">
          <form data-followup-form>
            <fieldset data-followup-fields class="grid gap-3 disabled:opacity-60">
              <label class="text-xs font-medium text-neutral-700">Situação do contrato
                <select id="followup-contract-status" name="contratoStatus" class="${inputClass}">
                  ${Object.entries(CONTRACT_STATUS).map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join('')}
                </select>
              </label>
              ${canAdopt ? `
                <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p>A proposta atual passou para <strong>R$ ${formatMoney(latest)}</strong>. O acompanhamento está em <strong>R$ ${formatMoney(record.totalCentavos)}</strong>.</p>
                  <label class="mt-2 flex items-start gap-2">
                    <input id="followup-adopt-total" name="atualizarValor" type="checkbox" class="mt-0.5 h-4 w-4 accent-neutral-900">
                    <span>Usar o valor da proposta atual</span>
                  </label>
                </div>
              ` : ''}
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs font-medium text-neutral-700">Sinal combinado (R$)
                  <input id="followup-signal" name="sinal" inputmode="decimal" maxlength="24" class="${inputClass}" aria-describedby="followup-signal-help">
                  <span id="followup-signal-help" class="mt-1 block font-normal text-neutral-600">Em branco, a definir. Preencha 0,00 quando não houver sinal.</span>
                </label>
                <label class="text-xs font-medium text-neutral-700">Vencimento do sinal
                  <input id="followup-signal-date" name="sinalVenceEm" type="date" class="${inputClass}">
                </label>
                <label class="text-xs font-medium text-neutral-700">Total recebido até agora (R$)
                  <input id="followup-paid" name="recebido" inputmode="decimal" maxlength="24" class="${inputClass}" aria-describedby="followup-paid-help">
                  <span id="followup-paid-help" class="mt-1 block font-normal text-neutral-600">Some todos os pagamentos, incluindo o sinal.</span>
                </label>
                <label class="text-xs font-medium text-neutral-700">Vencimento do saldo
                  <input id="followup-balance-date" name="saldoVenceEm" type="date" class="${inputClass}">
                </label>
              </div>
              <div class="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <dl class="grid gap-2 text-sm text-neutral-900">
                  <div class="flex flex-wrap justify-between gap-2"><dt>Valor total</dt><dd id="followup-total" class="font-semibold"></dd></div>
                  <div class="flex flex-wrap justify-between gap-2"><dt>Saldo em aberto</dt><dd id="followup-balance" class="font-semibold"></dd></div>
                </dl>
              </div>
              <div><button type="submit" class="${primaryButtonClass}">Salvar acompanhamento</button></div>
            </fieldset>
            <p data-followup-feedback role="status" aria-live="polite" class="mt-3 text-sm"></p>
          </form>
          <div class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 class="text-sm font-semibold text-neutral-900">Lembretes</h3>
            ${reminderOptions.length ? `
              <label class="mt-3 block text-xs font-medium text-neutral-700">Tipo de lembrete
                <select id="followup-reminder-type" class="${inputClass}">
                  ${reminderOptions.map(key => `<option value="${key}">${escapeHtml(REMINDER_LABELS[key])}</option>`).join('')}
                </select>
              </label>
              <label class="mt-3 block text-xs font-medium text-neutral-700">Prévia editável
                <textarea id="followup-reminder-text" rows="5" class="${inputClass}"></textarea>
              </label>
              <button type="button" data-followup-copy class="${buttonClass} mt-2 bg-white">Copiar lembrete</button>
              <p data-followup-reminder-hint class="mt-2 text-xs text-neutral-600">Revise o texto antes de copiar para o WhatsApp.</p>
            ` : `<p class="mt-2 text-xs text-neutral-600">${record.autorizaWhatsApp === true
              ? 'Os lembretes aparecem após registrar um contrato aguardando assinatura ou um pagamento pendente com vencimento.'
              : 'Lembretes pelo WhatsApp exigem autorização de contato no pedido.'}</p>`}
            <p data-followup-copy-feedback role="status" aria-live="polite" class="mt-2 text-xs text-neutral-700"></p>
          </div>
        </div>
      </section>
    `;

    const form = root.querySelector('[data-followup-form]');
    const fields = root.querySelector('[data-followup-fields]');
    const listButton = root.querySelector('[data-followup-list]');
    const message = root.querySelector('[data-followup-feedback]');
    const displayTotal = root.querySelector('#followup-total');
    const displayBalance = root.querySelector('#followup-balance');
    const reminderType = root.querySelector('#followup-reminder-type');
    const reminderText = root.querySelector('#followup-reminder-text');
    const copy = root.querySelector('[data-followup-copy]');
    const reminderHint = root.querySelector('[data-followup-reminder-hint]');
    const copyMessage = root.querySelector('[data-followup-copy-feedback]');
    const field = name => form.elements.namedItem(name);
    let saving = false;

    field('contratoStatus').value = record.contratoStatus;
    field('sinal').value = record.sinalCentavos === null ? '' : formatMoney(record.sinalCentavos);
    field('recebido').value = formatMoney(record.recebidoCentavos);
    for (const date of ['sinalVenceEm', 'saldoVenceEm']) field(date).value = record[date];
    if (reminderType) reminderText.value = reminderChoices[reminderType.value];

    function currentValues() {
      return {
        contratoStatus: field('contratoStatus').value,
        sinalCentavos: parseMoney(field('sinal').value, null),
        recebidoCentavos: parseMoney(field('recebido').value, 0),
        sinalVenceEm: field('sinalVenceEm').value,
        saldoVenceEm: field('saldoVenceEm').value,
        atualizarValor: canAdopt && field('atualizarValor').checked
      };
    }

    function refresh() {
      const { atualizarValor, ...values } = currentValues();
      const total = atualizarValor ? latest : record.totalCentavos;
      const dirty = atualizarValor || Object.entries(values).some(([key, value]) => value !== record[key]);
      displayTotal.textContent = `R$ ${formatMoney(total)}`;
      displayBalance.textContent = Number.isNaN(values.recebidoCentavos)
        ? '—'
        : `R$ ${formatMoney(remaining({ totalCentavos: total, recebidoCentavos: values.recebidoCentavos }))}`;
      fields.disabled = saving;
      listButton.disabled = saving;
      if (copy) {
        const hold = saving || dirty;
        reminderType.disabled = hold;
        reminderText.readOnly = hold;
        copy.disabled = hold || !reminderText.value.trim();
        reminderHint.textContent = dirty
          ? 'Salve os dados atualizados para usar os lembretes.'
          : 'Revise o texto antes de copiar para o WhatsApp.';
      }
    }

    listButton.addEventListener('click', loadList);
    form.addEventListener('input', () => {
      message.textContent = '';
      refresh();
    });
    reminderType?.addEventListener('change', () => {
      reminderText.value = reminderChoices[reminderType.value];
      copyMessage.textContent = '';
      refresh();
    });
    reminderText?.addEventListener('input', refresh);
    copy?.addEventListener('click', async () => {
      if (copy.disabled) return;
      try {
        await navigator.clipboard.writeText(reminderText.value.trim());
        if (token === generation) copyMessage.textContent = 'Lembrete copiado.';
      } catch {
        if (token !== generation) return;
        reminderText.select();
        copyMessage.textContent = 'O texto foi selecionado. Use a opção de copiar do seu dispositivo.';
      }
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving) return;
      const { atualizarValor, ...values } = currentValues();
      const total = atualizarValor ? latest : record.totalCentavos;
      const invalid = [['sinal', values.sinalCentavos], ['recebido', values.recebidoCentavos]]
        .find(([, value]) => Number.isNaN(value) || (value !== null && value > total));
      if (invalid) {
        message.className = 'mt-3 text-sm text-rose-700';
        message.textContent = 'Informe valores em reais, com até duas casas decimais e até o valor total.';
        field(invalid[0]).focus();
        return;
      }

      const payload = { revision: record.revision, ...values };
      if (atualizarValor) payload.atualizarValor = true;
      if (!record.revision || atualizarValor) payload.propostaRevisionAtual = record.propostaRevisionAtual;
      saving = true;
      message.textContent = '';
      refresh();
      try {
        const result = await api(`${API_PATH}/${encodeURIComponent(record.leadId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (token !== generation) return;
        renderEditor(result.acompanhamento, token);
        const savedMessage = root.querySelector('[data-followup-feedback]');
        savedMessage.classList.add('text-emerald-700');
        savedMessage.textContent = 'Acompanhamento salvo.';
      } catch (error) {
        if (token !== generation) return;
        message.className = 'mt-3 text-sm text-rose-700';
        message.textContent = error.message || 'Não foi possível salvar o acompanhamento.';
      } finally {
        if (token === generation) {
          saving = false;
          refresh();
        }
      }
    });
    refresh();
  }

  async function openLead(lead) {
    if (!lead?.id) return;
    const token = ++generation;
    view = 'loading';
    showMessage('Carregando acompanhamento…');
    try {
      const result = await api(`${API_PATH}/${encodeURIComponent(lead.id)}`);
      if (token === generation) renderEditor(result.acompanhamento, token);
    } catch (error) {
      if (token === generation) showError(error, () => openLead(lead), lead);
    }
  }

  return {
    enter() {
      if (view === 'idle' || view === 'error' || view === 'list') return loadList();
    },
    openLead,
    reset() {
      generation += 1;
      view = 'idle';
      root.replaceChildren();
    }
  };
}
