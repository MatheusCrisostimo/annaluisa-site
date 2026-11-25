const API_PATH = '/api/admin/indicadores';
const wholeNumber = new Intl.NumberFormat('pt-BR');
const minutes = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const percentage = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
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

export function mountIndicators(root, { api }) {
  let generation = 0;
  let chosenPeriod = null;
  let mounted = false;
  let loading = false;

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
    mounted = true;
  }

  function message(text, isError = false) {
    const feedback = root.querySelector('[data-indicators-feedback]');
    feedback.textContent = text;
    feedback.classList.toggle('text-rose-700', isError);
    feedback.classList.toggle('text-neutral-600', !isError);
    feedback.hidden = !text;
  }

  function renderResult({ periodo, pedidos, retorno, etapas, origens, servicos }) {
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

      <div class="grid gap-4 lg:grid-cols-2">
        ${breakdown('Origem dos pedidos', origens, received)}
        ${breakdown('Serviços solicitados', servicos, received)}
      </div>
    `;
    result.hidden = false;
  }

  async function load(period) {
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
      message('');
    } catch (error) {
      if (token !== generation) return;
      message(error.message || 'Não foi possível carregar os indicadores. Tente novamente.', true);
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
      mounted = false;
      loading = false;
      root.replaceChildren();
    }
  };
}
