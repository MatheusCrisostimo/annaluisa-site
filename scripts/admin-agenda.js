const AGENDA_API = '/api/admin/agenda';
const FIELD = 'w-full min-h-11 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-700';
const BUTTON = 'min-h-11 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50';
const PRIMARY = 'min-h-11 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50';
const DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});

function today() {
  const fields = Object.fromEntries(DATE_PARTS.formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function dateAfter(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function showDate(day) {
  return day.split('-').reverse().join('/');
}

function showTimeRange(startValue, endValue) {
  const [startDate, startTime] = startValue.split('T');
  const [endDate, endTime] = endValue.split('T');
  const end = startDate === endDate ? endTime : `${showDate(endDate)}, ${endTime}`;
  return `${showDate(startDate)}, ${startTime} – ${end}`;
}

function node(tag, className, text) {
  const result = document.createElement(tag);
  result.className = className;
  if (text) result.textContent = text;
  return result;
}

function renderEntry(entry, busy) {
  const item = node('li', 'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5');
  const content = node('div', 'min-w-0');
  const title = node('h3', 'break-words text-sm font-semibold text-neutral-900', entry.titulo);
  const interval = node('p', 'mt-1 text-sm text-neutral-700', showTimeRange(entry.inicio, entry.fim));
  const details = [];
  if (entry.cidade) details.push(entry.cidade);
  if (entry.deslocamentoMinutos) details.push(`${entry.deslocamentoMinutos} min de deslocamento após`);
  if (entry.leadId) details.push(`Pedido ${entry.leadId}`);
  content.append(title, interval);
  if (details.length) content.append(node('p', 'mt-1 break-words text-xs text-neutral-600', details.join(' · ')));
  if (entry.notas) content.append(node('p', 'mt-1 whitespace-pre-wrap break-words text-xs text-neutral-600', entry.notas));

  const actions = node('div', 'flex flex-wrap items-center gap-2 sm:shrink-0');
  const canceled = entry.status === 'cancelado';
  const status = {
    provisorio: ['Provisório', 'bg-amber-50 text-amber-900'],
    confirmado: [entry.tipo === 'bloqueio' ? 'Bloqueado' : 'Confirmado', 'bg-emerald-50 text-emerald-900'],
    cancelado: ['Cancelado', 'bg-neutral-100 text-neutral-700']
  }[entry.status];
  actions.append(node('span', `rounded-full px-2.5 py-1 text-xs font-medium ${status[1]}`, status[0]));
  const edit = node('button', BUTTON, canceled ? 'Reabrir' : 'Editar');
  edit.type = 'button';
  edit.dataset.action = 'editar';
  edit.dataset.id = entry.id;
  edit.disabled = busy;
  edit.setAttribute('aria-label', `${edit.textContent} ${entry.titulo}`);
  actions.append(edit);

  if (!canceled) {
    const cancel = node('button', BUTTON, 'Cancelar');
    cancel.type = 'button';
    cancel.dataset.action = 'cancelar';
    cancel.dataset.id = entry.id;
    cancel.disabled = busy;
    cancel.setAttribute('aria-label', `Cancelar ${entry.titulo}`);
    actions.append(cancel);
  }

  item.append(content, actions);
  return item;
}

export function mountAgenda(root, { api }) {
  root.innerHTML = `
    <section class="space-y-4" aria-labelledby="agendaTitle">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="agendaTitle" class="text-xl font-semibold text-neutral-900">Agenda</h2>
          <p class="mt-1 text-sm text-neutral-600">Horários de Florianópolis. Compromissos ativos e deslocamentos ocupam a agenda.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-agenda-new="atendimento" class="${PRIMARY}">Novo atendimento</button>
          <button type="button" data-agenda-new="bloqueio" class="${BUTTON}">Bloquear horário</button>
        </div>
      </div>

      <section data-agenda-edit hidden class="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5" aria-labelledby="agendaEditTitle">
        <h3 id="agendaEditTitle" class="font-semibold text-neutral-900" tabindex="-1">Novo compromisso</h3>
        <p data-agenda-linked class="mt-1 break-words text-sm text-neutral-600" hidden></p>
        <form data-agenda-form class="mt-4">
          <fieldset data-agenda-fields class="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="space-y-1 text-sm font-medium text-neutral-800 sm:col-span-2">
              <span>Título</span>
              <input name="titulo" class="${FIELD}" required maxlength="160" />
            </label>
            <label class="space-y-1 text-sm font-medium text-neutral-800">
              <span>Tipo</span>
              <select name="tipo" class="${FIELD}">
                <option value="atendimento">Atendimento</option>
                <option value="bloqueio">Bloqueio</option>
              </select>
            </label>
            <label data-agenda-status class="space-y-1 text-sm font-medium text-neutral-800">
              <span>Situação</span>
              <select name="status" class="${FIELD}">
                <option value="provisorio">Provisório</option>
                <option value="confirmado">Confirmado</option>
              </select>
            </label>
            <label class="space-y-1 text-sm font-medium text-neutral-800">
              <span>Data de início</span>
              <input name="inicioData" type="date" class="${FIELD}" required />
            </label>
            <label class="space-y-1 text-sm font-medium text-neutral-800">
              <span>Hora de início</span>
              <input name="inicioHora" type="time" class="${FIELD}" required />
            </label>
            <label class="space-y-1 text-sm font-medium text-neutral-800">
              <span>Data de término, se for outro dia</span>
              <input name="fimData" type="date" class="${FIELD}" />
            </label>
            <label class="space-y-1 text-sm font-medium text-neutral-800">
              <span>Hora de término</span>
              <input name="fimHora" type="time" class="${FIELD}" required />
            </label>
            <label class="space-y-1 text-sm font-medium text-neutral-800 sm:col-span-2">
              <span>Cidade (opcional)</span>
              <input name="cidade" class="${FIELD}" maxlength="100" />
            </label>
            <label class="space-y-1 text-sm font-medium text-neutral-800 sm:col-span-2">
              <span>Deslocamento após o término (minutos)</span>
              <input name="deslocamentoMinutos" type="number" min="0" step="1" value="0" class="${FIELD}" />
            </label>
            <label class="space-y-1 text-sm font-medium text-neutral-800 sm:col-span-2 lg:col-span-4">
              <span>Observações (opcional)</span>
              <textarea name="notas" maxlength="2000" rows="2" class="${FIELD}"></textarea>
            </label>
            <div class="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" class="${PRIMARY}">Salvar horário</button>
              <button type="button" data-agenda-close class="${BUTTON}">Fechar</button>
            </div>
          </fieldset>
        </form>
        <p data-agenda-edit-error class="mt-3 text-sm text-rose-800" role="alert" hidden></p>
      </section>

      <section class="overflow-hidden rounded-xl border border-neutral-200 bg-white" aria-label="Compromissos no período">
        <form data-agenda-filter class="flex flex-wrap items-end gap-3 border-b border-neutral-200 p-4 sm:p-5">
          <label class="flex-1 space-y-1 text-sm font-medium text-neutral-800 sm:flex-none">
            <span>De</span>
            <input name="de" type="date" class="${FIELD}" required />
          </label>
          <label class="flex-1 space-y-1 text-sm font-medium text-neutral-800 sm:flex-none">
            <span>Até</span>
            <input name="ate" type="date" class="${FIELD}" required />
          </label>
          <label class="flex min-h-11 items-center gap-2 text-sm text-neutral-800">
            <input name="incluirCancelados" type="checkbox" value="1" class="h-4 w-4 accent-neutral-900" />
            Mostrar cancelados
          </label>
          <button type="submit" class="${BUTTON}">Filtrar</button>
        </form>
        <p data-agenda-notice class="border-b border-neutral-200 px-4 py-3 text-sm sm:px-5" role="status" hidden></p>
        <p data-agenda-state class="px-4 py-4 text-sm text-neutral-600 sm:px-5" role="status"></p>
        <ul data-agenda-list class="divide-y divide-neutral-100"></ul>
      </section>
    </section>
  `;

  const filter = root.querySelector('[data-agenda-filter]');
  const list = root.querySelector('[data-agenda-list]');
  const listState = root.querySelector('[data-agenda-state]');
  const notice = root.querySelector('[data-agenda-notice]');
  const editor = root.querySelector('[data-agenda-edit]');
  const editorTitle = root.querySelector('#agendaEditTitle');
  const editorError = root.querySelector('[data-agenda-edit-error]');
  const linkInfo = root.querySelector('[data-agenda-linked]');
  const editorFields = root.querySelector('[data-agenda-fields]');
  const form = root.querySelector('[data-agenda-form]');
  const fields = form.elements;
  const typeField = fields.namedItem('tipo');
  const statusField = root.querySelector('[data-agenda-status]');
  let loading = null;
  let saving = null;
  let entries = [];
  let entry = null;
  let leadId = '';

  function showMessage(target, message) {
    target.textContent = message;
    target.hidden = !message;
  }

  function setPeriod(day) {
    filter.elements.de.value = day;
    filter.elements.ate.value = dateAfter(day, 29);
  }

  function ensureDateVisible(day) {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    if (!filter.elements.de.value || day < filter.elements.de.value || day > filter.elements.ate.value) {
      setPeriod(day);
    }
  }

  function updateType() {
    statusField.hidden = typeField.value === 'bloqueio';
    typeField.disabled = Boolean(leadId);
  }

  function clearEditor() {
    entry = null;
    leadId = '';
    form.reset();
    showMessage(linkInfo, '');
    showMessage(editorError, '');
    updateType();
    editor.hidden = true;
  }

  function syncSaving() {
    const busy = saving !== null;
    editorFields.disabled = busy;
    root.querySelectorAll('[data-agenda-new], [data-agenda-list] button').forEach(button => {
      button.disabled = busy;
    });
  }

  async function enter() {
    if (!filter.elements.de.value || !filter.elements.ate.value) setPeriod(today());
    loading?.abort();
    const request = new AbortController();
    loading = request;
    entries = [];
    list.replaceChildren();
    showMessage(listState, 'Carregando compromissos…');

    try {
      const query = new URLSearchParams(new FormData(filter));
      const { compromissos } = await api(`${AGENDA_API}?${query}`, { signal: request.signal });
      if (loading !== request) return;
      if (!Array.isArray(compromissos)) throw new Error('A resposta do servidor não contém a agenda.');
      entries = compromissos;
      list.replaceChildren(...entries.map(item => renderEntry(item, Boolean(saving))));
      showMessage(listState, entries.length ? '' : 'Nenhum compromisso neste período.');
    } catch (error) {
      if (loading === request) showMessage(listState, error.message || 'Não foi possível carregar a agenda.');
    } finally {
      if (loading === request) loading = null;
    }
  }

  function showEditor(title) {
    editorTitle.textContent = title;
    editor.hidden = false;
    editorTitle.focus();
  }

  function openLead(lead) {
    if (saving) return;
    clearEditor();
    leadId = lead.id;
    typeField.value = 'atendimento';
    fields.titulo.value = [lead.servico, lead.nome].filter(Boolean).join(' · ').slice(0, 160);
    fields.inicioData.value = lead.data || '';
    fields.cidade.value = lead.cidade || '';
    const requested = lead.horario ? ` Cliente precisa estar pronta às ${lead.horario}.` : '';
    showMessage(linkInfo, `Pedido ${lead.id}.${requested}`);
    updateType();
    showEditor('Novo atendimento');
    ensureDateVisible(fields.inicioData.value);
    return enter();
  }

  function openEntry(current) {
    clearEditor();
    entry = current;
    leadId = current.leadId;
    typeField.value = current.tipo;
    fields.titulo.value = current.titulo;
    fields.status.value = current.status === 'cancelado' ? 'provisorio' : current.status;
    const [startDate, startTime] = current.inicio.split('T');
    const [endDate, endTime] = current.fim.split('T');
    fields.inicioData.value = startDate;
    fields.inicioHora.value = startTime;
    fields.fimData.value = startDate === endDate ? '' : endDate;
    fields.fimHora.value = endTime;
    fields.deslocamentoMinutos.value = current.deslocamentoMinutos;
    fields.cidade.value = current.cidade;
    fields.notas.value = current.notas;
    showMessage(linkInfo, leadId ? `Pedido ${leadId}.` : '');
    updateType();
    showEditor(current.status === 'cancelado' ? 'Reabrir horário' : 'Editar horário');
  }

  async function save(body, current, cancel = false) {
    if (saving) return;
    const request = new AbortController();
    saving = request;
    syncSaving();
    showMessage(editorError, '');
    showMessage(notice, '');

    try {
      const { compromisso } = await api(current ? `${AGENDA_API}/${encodeURIComponent(current.id)}` : AGENDA_API, {
        method: current ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current ? { ...body, version: current.version } : body),
        signal: request.signal
      });
      if (saving !== request) return;
      if (cancel) {
        if (entry?.id === current.id) clearEditor();
      } else {
        ensureDateVisible(compromisso.inicio.slice(0, 10));
        clearEditor();
      }
      showMessage(notice, cancel ? 'Compromisso cancelado. Horário liberado.' : 'Horário salvo na agenda.');
      await enter();
    } catch (error) {
      if (saving !== request) return;
      showMessage(cancel ? notice : editorError, error.message || 'Não foi possível salvar o horário.');
      if (error.status === 409) await enter();
    } finally {
      if (saving === request) {
        saving = null;
        syncSaving();
      }
    }
  }

  filter.addEventListener('submit', event => {
    event.preventDefault();
    showMessage(notice, '');
    enter();
  });

  root.querySelectorAll('[data-agenda-new]').forEach(button => {
    button.addEventListener('click', () => {
      clearEditor();
      typeField.value = button.dataset.agendaNew;
      updateType();
      showEditor(typeField.value === 'bloqueio' ? 'Bloquear horário' : 'Novo atendimento');
    });
  });
  root.querySelector('[data-agenda-close]').addEventListener('click', clearEditor);
  typeField.addEventListener('change', updateType);

  form.addEventListener('submit', event => {
    event.preventDefault();
    const date = fields.inicioData.value;
    const endDate = fields.fimData.value || date;
    save({
      titulo: fields.titulo.value,
      tipo: typeField.value,
      status: typeField.value === 'bloqueio' ? 'confirmado' : fields.status.value,
      inicio: `${date}T${fields.inicioHora.value}`,
      fim: `${endDate}T${fields.fimHora.value}`,
      cidade: fields.cidade.value,
      notas: fields.notas.value,
      deslocamentoMinutos: Number(fields.deslocamentoMinutos.value),
      leadId
    }, entry);
  });

  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    const current = entries.find(item => item.id === button?.dataset.id);
    if (!current || saving) return;
    if (button.dataset.action === 'editar') openEntry(current);
    else save({ status: 'cancelado' }, current, true);
  });

  function reset() {
    loading?.abort();
    saving?.abort();
    loading = null;
    saving = null;
    entries = [];
    filter.reset();
    list.replaceChildren();
    showMessage(listState, '');
    showMessage(notice, '');
    clearEditor();
    syncSaving();
  }

  return { enter, openLead, reset };
}
