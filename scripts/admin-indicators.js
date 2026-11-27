import { parseMoneyCents } from './admin-money.js';

const API_PATH = '/api/admin/indicadores';
const wholeNumber = new Intl.NumberFormat('pt-BR');
const minutes = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const percentage = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moneyInput = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const campaignFields = [
  ['utm_campaign', 'Campanha'], ['utm_source', 'Fonte'], ['utm_medium', 'Mídia']
];
const inputClass = 'mt-1 block w-full min-h-11 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-normal text-neutral-900';
const buttonClass = 'min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50';
const primaryButtonClass = 'min-h-11 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatDate(value) {
  return value.split('-').reverse().join('/');
}

function metric(id, label, value, note = '') {
  return `
    <div class="h-full rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
      <dt class="text-xs font-medium text-neutral-600">${escapeHtml(label)}</dt>
      <dd id="${id}" class="mt-1 text-xl font-semibold tabular-nums text-neutral-900 sm:text-2xl">${escapeHtml(value)}</dd>
      ${note}
    </div>
  `;
}

function rowsFor(items, base) {
  return `<ul class="mt-4 grid gap-4">
    ${items.map(({ rotulo, total }) => {
      const fraction = base ? total / base : 0;
      const width = Math.max(0, Math.min(100, fraction * 100));
      return `
        <li class="min-w-0">
          <div class="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
            <span class="break-words font-medium text-neutral-800">${escapeHtml(rotulo)}</span>
            <span class="shrink-0 tabular-nums text-neutral-700">${wholeNumber.format(total)}${base ? ` · ${percentage.format(fraction)}` : ''}</span>
          </div>
          <div aria-hidden="true" class="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div class="h-full rounded-full bg-neutral-700" style="width: ${width}%"></div>
          </div>
        </li>
      `;
    }).join('')}
  </ul>`;
}

function breakdown(title, values, total) {
  return `
    <section class="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 class="text-sm font-semibold text-neutral-900">${title}</h3>
      ${total ? rowsFor(values, total) : '<p class="mt-2 text-sm text-neutral-600">Sem pedidos no período.</p>'}
    </section>
  `;
}

function campaignMetrics(metrics, layout) {
  return `
    <dl class="grid grid-cols-2 gap-x-3 gap-y-2 ${layout}">
      ${metrics.map(([title, value]) => `
        <div class="min-w-0">
          <dt class="text-xs text-neutral-600">${title}</dt>
          <dd class="mt-0.5 break-words text-sm font-semibold tabular-nums text-neutral-900">${value}</dd>
        </div>
      `).join('')}
    </dl>`;
}

function formatCurrencyCents(value) {
  const cents = BigInt(value);
  const fraction = String(cents % 100n).padStart(2, '0');
  return currency.formatToParts(cents / 100n)
    .map(part => part.type === 'fraction' ? fraction : part.value).join('');
}

function campaignFinance({ financeiro, investimentoCentavos }) {
  if (!financeiro) return '';

  const { contratadoCentavos, recebidoCentavos, saldoContratadoCentavos } = financeiro;
  const amounts = [
    ['Valor de contratos assinados', formatCurrencyCents(contratadoCentavos)],
    ['Total recebido', formatCurrencyCents(recebidoCentavos)],
    ['Saldo de contratos assinados', formatCurrencyCents(saldoContratadoCentavos)]
  ];
  if (Number.isSafeInteger(investimentoCentavos) && investimentoCentavos > 0) {
    const spend = BigInt(investimentoCentavos);
    const receivedPerReal = (BigInt(recebidoCentavos) * 100n + spend / 2n) / spend;
    amounts.push(['Recebido por R$ 1 investido', formatCurrencyCents(receivedPerReal)]);
  }

  return `<div class="mt-3 border-t border-neutral-100 pt-3">${campaignMetrics(amounts, 'sm:grid-cols-4')}</div>`;
}

function campaignRow(campaign, index) {
  const { utm_source: source, utm_medium: medium, utm_campaign: name } = campaign;
  const label = name ?? (source || medium ? 'Campanha sem nome' : 'Sem UTMs');
  const origin = source || medium ? `${source ?? '—'} / ${medium ?? '—'}` : '';
  const hasInvestment = Number.isSafeInteger(campaign.investimentoCentavos);
  const investment = campaign.investimentoCentavos / 100;
  const confirmed = wholeNumber.format(campaign.atendimentosConfirmados);
  const rate = campaign.pedidos ? percentage.format(campaign.atendimentosConfirmados / campaign.pedidos) : '';
  const counts = [
    ['Pedidos', wholeNumber.format(campaign.pedidos)],
    ['Com dados do evento', wholeNumber.format(campaign.comDadosEvento)],
    ['Propostas prontas', wholeNumber.format(campaign.propostasProntas)],
    ['Contratos assinados', wholeNumber.format(campaign.contratosAssinados)],
    ['Atendimentos confirmados', rate ? `${confirmed} (${rate})` : confirmed]
  ];
  const costs = hasInvestment ? [
    ['Investimento informado', currency.format(investment)],
    ['Custo por pedido atribuído', campaign.pedidos ? currency.format(investment / campaign.pedidos) : '—'],
    ['Custo por atendimento confirmado', campaign.atendimentosConfirmados
      ? currency.format(investment / campaign.atendimentosConfirmados) : '—']
  ] : [];

  return `
    <li class="grid min-w-0 gap-3 rounded-xl border border-neutral-200 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
      <div class="min-w-0">
        <h4 class="break-words text-sm font-semibold text-neutral-900">${escapeHtml(label)}</h4>
        ${origin ? `<p class="mt-1 break-words text-xs text-neutral-600">${escapeHtml(origin)}</p>` : ''}
        ${name || source || medium ? `<button type="button" data-edit-investment="${index}" class="${buttonClass} mt-2">${hasInvestment ? 'Editar valor' : 'Informar valor'}</button>` : ''}
      </div>
      <div class="min-w-0">
        ${campaignMetrics(counts, 'sm:grid-cols-5')}
        ${hasInvestment ? `<div class="mt-3 border-t border-neutral-100 pt-3">${campaignMetrics(costs, 'sm:grid-cols-3')}</div>` : ''}
        ${campaignFinance(campaign)}
      </div>
    </li>
  `;
}

function campaignBreakdown(campaigns) {
  return `
    <section class="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 id="campaign-indicators-title" tabindex="-1" class="text-sm font-semibold text-neutral-900">Pedidos por campanha</h3>
        <button type="button" data-edit-investment="new" class="${buttonClass}">Registrar investimento</button>
      </div>
      ${campaigns.length ? `
        <p class="mt-1 text-xs text-neutral-600">Os custos consideram pedidos com UTMs registradas após o aceite de cookies de métricas.</p>
        <p class="mt-1 text-xs text-neutral-600">Os valores financeiros vêm do Acompanhamento salvo dos pedidos recebidos no período.</p>
        <ul class="mt-4 grid gap-2">${campaigns.map(campaignRow).join('')}</ul>
      ` : '<p class="mt-2 text-sm text-neutral-600">Sem pedidos no período.</p>'}
    </section>
  `;
}

function investmentDialog() {
  return `
    <dialog data-investment-dialog aria-labelledby="investment-title" class="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl backdrop:bg-neutral-900/50 sm:p-6">
      <h3 id="investment-title" class="text-lg font-semibold text-neutral-900">Investimento da campanha</h3>
      <p data-investment-period class="mt-1 text-sm font-medium text-neutral-700"></p>
      <p class="mt-1 text-sm text-neutral-600">Use as mesmas UTMs do anúncio e o gasto total nessas datas.</p>
      <form data-investment-form class="mt-4">
        <fieldset class="grid min-w-0 gap-3 sm:grid-cols-2">
          ${campaignFields.map(([name, label]) => `
            <label class="min-w-0 text-xs font-medium text-neutral-700">${label} (${name})
              <input name="${name}" type="text" maxlength="80" class="${inputClass} read-only:bg-neutral-100">
            </label>
          `).join('')}
          <label class="min-w-0 text-xs font-medium text-neutral-700">Investimento (R$)
            <input name="valor" type="text" inputmode="decimal" required class="${inputClass}" placeholder="0,00" autofocus>
          </label>
          <div class="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" class="${primaryButtonClass}">Salvar investimento</button>
            <button type="button" data-investment-remove class="${buttonClass}">Remover valor</button>
            <button type="button" data-investment-close class="${buttonClass}">Cancelar</button>
          </div>
        </fieldset>
        <p data-investment-error class="mt-2 text-sm text-rose-700" role="status" hidden></p>
      </form>
    </dialog>`;
}

export function mountIndicators(root, { api }) {
  let generation = 0;
  let chosenPeriod = null;
  let mounted = false;
  let loading = false;
  let investmentPeriod = null;

  function render() {
    root.innerHTML = `
      <section class="grid gap-4" aria-labelledby="indicators-title">
        <div>
          <h2 id="indicators-title" class="text-xl font-semibold text-neutral-900">Indicadores</h2>
          <p class="mt-1 text-sm text-neutral-600">Pedidos recebidos nas datas selecionadas, pelo horário de São Paulo.</p>
        </div>

        <form data-indicators-filter class="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <fieldset data-indicators-fields class="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label class="min-w-0 text-xs font-medium text-neutral-700">Data inicial
              <input id="indicators-from" name="de" type="date" required class="${inputClass}">
            </label>
            <label class="min-w-0 text-xs font-medium text-neutral-700">Data final
              <input id="indicators-to" name="ate" type="date" required class="${inputClass}">
            </label>
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="${primaryButtonClass}">Aplicar período</button>
              <button type="button" data-indicators-default class="${buttonClass}">Últimos 30 dias</button>
            </div>
          </fieldset>
          <p data-indicators-feedback class="mt-2 text-sm text-neutral-600" role="status" aria-live="polite"></p>
        </form>

        <div data-indicators-results class="grid gap-4" hidden></div>
        ${investmentDialog()}
      </section>
    `;
    const form = root.querySelector('[data-indicators-filter]');
    const from = root.querySelector('#indicators-from');
    const to = root.querySelector('#indicators-to');
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!from.value || !to.value) return;
      if (from.value > to.value) {
        message('Informe uma data final igual ou posterior à data inicial.', true);
        to.focus();
        return;
      }
      load({ de: from.value, ate: to.value });
    });
    root.querySelector('[data-indicators-default]').addEventListener('click', () => load(null));
    const dialog = root.querySelector('[data-investment-dialog]');
    const investmentForm = dialog.querySelector('[data-investment-form]');
    investmentForm.addEventListener('submit', event => {
      event.preventDefault();
      const cents = parseMoneyCents(investmentForm.elements.valor.value);
      if (!Number.isSafeInteger(cents)) {
        investmentError(dialog, 'Informe um valor em reais, como 120,50.');
        investmentForm.elements.valor.focus();
        return;
      }
      saveInvestment(dialog, cents, 'Investimento salvo.');
    });
    dialog.querySelector('[data-investment-remove]').addEventListener('click', () => {
      saveInvestment(dialog, null, 'Investimento removido.');
    });
    dialog.querySelector('[data-investment-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { if (loading) event.preventDefault(); });
    mounted = true;
  }

  function message(text, isError = false) {
    const feedback = root.querySelector('[data-indicators-feedback]');
    feedback.textContent = text;
    feedback.classList.toggle('text-rose-700', isError);
    feedback.classList.toggle('text-neutral-600', !isError);
    feedback.hidden = !text;
  }

  function investmentError(dialog, text) {
    const feedback = dialog.querySelector('[data-investment-error]');
    feedback.textContent = text;
    feedback.hidden = !text;
  }

  function openInvestment(periodo, campaign) {
    if (loading) return;
    const dialog = root.querySelector('[data-investment-dialog]');
    const form = dialog.querySelector('[data-investment-form]');
    const hasInvestment = Number.isSafeInteger(campaign?.investimentoCentavos);
    investmentPeriod = periodo;
    dialog.querySelector('[data-investment-period]').textContent = `${formatDate(periodo.de)} a ${formatDate(periodo.ate)}`;
    for (const [name] of campaignFields) {
      form.elements[name].value = campaign?.[name] ?? '';
      form.elements[name].readOnly = Boolean(campaign);
    }
    form.elements.valor.value = hasInvestment ? moneyInput.format(campaign.investimentoCentavos / 100) : '';
    dialog.querySelector('[data-investment-remove]').hidden = !hasInvestment;
    investmentError(dialog, '');
    dialog.showModal();
    form.elements[campaign ? 'valor' : 'utm_campaign'].focus();
  }

  async function saveInvestment(dialog, investimentoCentavos, doneMessage) {
    if (loading || !investmentPeriod) return;
    const periodo = investmentPeriod;
    const form = dialog.querySelector('[data-investment-form]');
    const campanha = Object.fromEntries(campaignFields.map(([name]) => [name, form.elements[name].value.trim()]));
    const fields = form.querySelector('fieldset');
    const token = ++generation;
    loading = true;
    fields.disabled = true;
    investmentError(dialog, '');
    try {
      await api(`${API_PATH}/investimento`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo, campanha, investimentoCentavos })
      });
      if (token !== generation) return;
      dialog.close();
    } catch (error) {
      if (token === generation) {
        const failure = error.status >= 500 ? 'Não foi possível salvar o investimento. Tente novamente.' : error.message;
        investmentError(dialog, failure || 'Não foi possível salvar o investimento.');
      }
      return;
    } finally {
      if (token === generation) {
        fields.disabled = false;
        loading = false;
      }
    }
    await load(periodo, doneMessage);
  }

  function renderResult({ periodo, pedidos, retorno, etapas, origens, servicos, campanhas = [] }) {
    const result = root.querySelector('[data-indicators-results]');
    const received = pedidos.recebidos;
    const sample = retorno.amostra;
    const sampleText = sample === 1 ? '1 pedido com retorno registrado' : `${wholeNumber.format(sample)} pedidos com retorno registrado`;
    const median = sample && Number.isFinite(retorno.medianaMinutos)
      ? `${minutes.format(retorno.medianaMinutos)} min` : 'Sem registros';
    const counts = [
      { rotulo: 'Propostas prontas', total: etapas.propostasProntas },
      { rotulo: 'Contratos assinados', total: etapas.contratosAssinados },
      { rotulo: 'Pedidos com atendimento confirmado', total: etapas.atendimentosConfirmados }
    ];
    result.innerHTML = `
      <div>
        <p id="indicators-period" class="text-sm font-medium text-neutral-700">Resultados de ${escapeHtml(formatDate(periodo.de))} a ${escapeHtml(formatDate(periodo.ate))}</p>
        ${received ? '' : '<p class="mt-1 text-sm text-neutral-600">Nenhum pedido recebido no período selecionado.</p>'}
      </div>

      <div class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <dl>${metric('indicators-received', 'Pedidos recebidos', wholeNumber.format(received))}</dl>
        <dl>${metric('indicators-pending', 'Pedidos pendentes', wholeNumber.format(pedidos.pendentes))}</dl>
        <dl>${metric('indicators-complete', 'Com dados do evento', wholeNumber.format(pedidos.comDadosEvento),
          '<dd class="mt-1 text-xs text-neutral-600">Cidade, número de pessoas e data quando aplicável.</dd>')}</dl>
        <dl>${metric('indicators-median', 'Tempo mediano de retorno', median,
          `<dd id="indicators-response-sample" class="mt-1 text-xs text-neutral-600">${escapeHtml(sampleText)}</dd>`)}</dl>
      </div>
      <p class="text-xs text-neutral-600">O tempo de retorno vai do recebimento do pedido à primeira marcação como respondido no painel.</p>

      <section class="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 class="text-sm font-semibold text-neutral-900">Etapas atuais dos pedidos</h3>
        <p class="mt-1 text-xs text-neutral-600">Um pedido pode aparecer em mais de uma etapa.</p>
        ${rowsFor(counts, received)}
      </section>

      ${campaignBreakdown(campanhas)}

      <div class="grid gap-4 lg:grid-cols-2">
        ${breakdown('Origem dos pedidos', origens, received)}
        ${breakdown('Serviços solicitados', servicos, received)}
      </div>
    `;
    for (const button of result.querySelectorAll('[data-edit-investment]')) {
      button.addEventListener('click', () => openInvestment(periodo, campanhas[button.dataset.editInvestment]));
    }
    result.hidden = false;
  }

  async function load(period, doneMessage = '') {
    if (loading) return;
    if (!mounted) render();
    const token = ++generation;
    const controls = root.querySelector('[data-indicators-fields]');
    loading = true;
    controls.disabled = true;
    message('Carregando indicadores…');
    try {
      const query = period ? `?${new URLSearchParams(period)}` : '';
      const result = await api(API_PATH + query);
      if (token !== generation) return;
      renderResult(result);
      root.querySelector('#indicators-from').value = result.periodo.de;
      root.querySelector('#indicators-to').value = result.periodo.ate;
      chosenPeriod = period;
      message(doneMessage);
      if (doneMessage) root.querySelector('#campaign-indicators-title').focus({ preventScroll: true });
    } catch (error) {
      if (token !== generation) return;
      const failure = error.message || 'Não foi possível carregar os indicadores. Tente novamente.';
      message([doneMessage, failure].filter(Boolean).join(' '), true);
    } finally {
      if (token === generation) {
        controls.disabled = false;
        loading = false;
      }
    }
  }

  return {
    enter() {
      return load(chosenPeriod);
    },
    reset() {
      generation += 1;
      chosenPeriod = null;
      investmentPeriod = null;
      mounted = false;
      loading = false;
      root.replaceChildren();
    }
  };
}
