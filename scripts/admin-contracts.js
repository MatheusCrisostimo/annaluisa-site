import { CONTRACT_FIELDS, contractTokens } from './contract-fields.js';

const API_PATH = '/api/admin/contratos';
const MODEL_PATH = `${API_PATH}/modelo`;
const buttonClass = 'rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50';
const primaryButtonClass = 'rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50';
const inputClass = 'mt-1 block w-full rounded-lg border border-neutral-200 bg-white p-2.5 text-sm font-normal text-neutral-900';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function feedback(element, message = '', isError = false) {
  element.textContent = message;
  element.classList.toggle('text-rose-700', isError);
  element.classList.toggle('text-emerald-700', !isError);
}

function readableValue(value, kind) {
  return kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split('-').reverse().join('/')
    : value;
}

export function mountContracts(root, { api, download }) {
  let generation = 0;
  let view = 'idle';

  function showLoading(message) {
    root.innerHTML = '<p class="rounded-xl border border-neutral-100 bg-white p-5 text-sm text-neutral-600" role="status"></p>';
    root.firstElementChild.textContent = message;
  }

  function showError(error, retry, lead) {
    view = 'error';
    root.innerHTML = `
      <section class="rounded-xl border border-neutral-100 bg-white p-5">
        <p role="alert" class="text-sm text-rose-700"></p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" data-contract-retry class="${buttonClass}">Tentar novamente</button>
          ${lead ? `<button type="button" data-contract-model class="${buttonClass}">Editar modelo</button>` : ''}
        </div>
      </section>
    `;
    root.querySelector('[role="alert"]').textContent = lead && error.status === 409
      ? 'Abra a proposta deste pedido, salve-a como pronta e confirme o aceite da cliente antes de preparar o contrato.'
      : error.message || 'Não foi possível carregar o contrato.';
    root.querySelector('[data-contract-retry]').addEventListener('click', retry);
    root.querySelector('[data-contract-model]')?.addEventListener('click', () => openModel(lead));
  }

  function renderModel(result, token, lead) {
    let model = result.modelo;
    view = 'model';
    const fieldRows = Object.entries(CONTRACT_FIELDS).map(([name, field]) => `
      <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 px-3 py-2">
        <div class="min-w-0">
          <p class="text-xs font-medium text-neutral-700">${escapeHtml(field.label)}</p>
          <code class="break-all text-xs text-neutral-600">{{${escapeHtml(name)}}}</code>
        </div>
        <div class="flex flex-wrap gap-1">
          <button type="button" data-token="${escapeHtml(name)}" data-token-action="insert" aria-label="Inserir ${escapeHtml(field.label)}" class="${buttonClass}">Inserir</button>
          <button type="button" data-token="${escapeHtml(name)}" data-token-action="copy" aria-label="Copiar campo ${escapeHtml(field.label)}" class="${buttonClass}">Copiar</button>
        </div>
      </li>
    `).join('');

    root.innerHTML = `
      <section class="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-neutral-900">Modelo de contrato</h2>
            <p class="mt-1 text-xs text-neutral-600" data-model-status></p>
          </div>
          <button type="button" data-model-reload class="${buttonClass}">Recarregar modelo salvo</button>
        </div>
        <p class="mb-3 text-sm text-neutral-700">Cole no editor as cláusulas revisadas no Word. Troque os dados específicos da cliente, do evento e da negociação pelos campos disponíveis. Remova as instruções do esqueleto marcadas com <code>[[...]]</code>.</p>
        ${lead ? '<p class="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-model-lead></p>' : ''}
        <div class="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
          <form data-model-form>
            <label for="contract-template" class="text-xs font-medium text-neutral-700">Texto do modelo</label>
            <textarea id="contract-template" name="texto" required rows="18" maxlength="24000" class="${inputClass} font-mono"></textarea>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="submit" data-model-save class="${primaryButtonClass}">Salvar modelo</button>
              ${lead ? `<button type="button" data-model-return class="${buttonClass}">Voltar para o contrato</button>` : ''}
            </div>
            <p data-model-feedback role="status" aria-live="polite" class="mt-3 text-sm"></p>
          </form>
          <details data-token-list class="rounded-xl border border-neutral-200 p-4">
            <summary class="cursor-pointer text-sm font-semibold text-neutral-900">Campos disponíveis</summary>
            <p class="my-2 text-xs text-neutral-600">Insira um campo na posição do cursor ou copie para colar no texto.</p>
            <ul class="grid gap-2">${fieldRows}</ul>
          </details>
        </div>
        ${lead ? '' : '<p class="mt-4 text-xs text-neutral-600">Abra um pedido com proposta pronta para preencher e revisar o contrato.</p>'}
      </section>
    `;

    const text = root.querySelector('#contract-template');
    const form = root.querySelector('[data-model-form]');
    const saveButton = root.querySelector('[data-model-save]');
    const reloadButton = root.querySelector('[data-model-reload]');
    const returnButton = root.querySelector('[data-model-return]');
    const leadNote = root.querySelector('[data-model-lead]');
    const status = root.querySelector('[data-model-status]');
    const message = root.querySelector('[data-model-feedback]');
    let saving = false;
    text.value = model.revision ? model.texto : result.inicial || '';

    function refresh() {
      status.textContent = model.revision ? 'Modelo salvo' : 'Modelo ainda não salvo';
      saveButton.disabled = saving;
      reloadButton.disabled = saving;
      if (returnButton) {
        returnButton.disabled = saving || !model.revision;
        leadNote.textContent = model.revision
          ? 'Depois de revisar o modelo, você pode retomar o contrato deste pedido.'
          : 'Salve o modelo para continuar com o contrato deste pedido.';
      }
    }

    reloadButton.addEventListener('click', () => openModel(lead));
    returnButton?.addEventListener('click', () => openLead(lead));
    root.querySelector('[data-token-list]').addEventListener('click', async event => {
      const button = event.target.closest('button[data-token]');
      if (!button || saving) return;
      const fieldToken = `{{${button.dataset.token}}}`;
      if (button.dataset.tokenAction === 'insert') {
        text.setRangeText(fieldToken, text.selectionStart, text.selectionEnd, 'end');
        text.focus();
        return;
      }
      try {
        await navigator.clipboard.writeText(fieldToken);
        if (token === generation) feedback(message, 'Campo copiado.');
      } catch {
        if (token === generation) feedback(message, `Copie o campo diretamente da lista ${fieldToken}`, true);
      }
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving) return;
      const texto = text.value.trim();
      if (!texto || texto.includes('[[') || texto.includes(']]')) {
        feedback(message, 'Substitua as instruções marcadas com [[...]] pelo texto revisado e tente salvar novamente.', true);
        return;
      }

      saving = true;
      text.readOnly = true;
      feedback(message);
      refresh();
      try {
        const response = await api(MODEL_PATH, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto, revision: model.revision })
        });
        if (token !== generation) return;
        model = response.modelo;
        text.value = model.texto;
        feedback(message, 'Modelo salvo.');
      } catch (error) {
        if (token === generation) feedback(message, error.message || 'Não foi possível salvar o modelo.', true);
      } finally {
        if (token === generation) {
          saving = false;
          text.readOnly = false;
          refresh();
        }
      }
    });
    refresh();
  }

  async function openModel(lead) {
    const token = ++generation;
    view = 'loading';
    showLoading('Carregando modelo…');
    try {
      const result = await api(MODEL_PATH);
      if (token === generation) renderModel(result, token, lead);
    } catch (error) {
      if (token === generation) showError(error, () => openModel(lead));
    }
  }

  function renderContract(result, token, lead) {
    view = 'contract';
    const { modelo, valores, proposalRevision, leadId } = result;
    const included = contractTokens(modelo.texto);
    const fromProposal = included.filter(name => CONTRACT_FIELDS[name]?.source === 'proposal');
    const editable = included.filter(name => CONTRACT_FIELDS[name]?.source === 'input');
    const details = fromProposal.map(name => {
      const { kind, label } = CONTRACT_FIELDS[name];
      const value = readableValue(valores[name], kind);
      return `<div>
        <dt class="text-xs font-medium text-neutral-700">${escapeHtml(label)}</dt>
        <dd class="mt-0.5 whitespace-pre-wrap break-words text-sm text-neutral-900">${escapeHtml(value || 'A preencher na proposta')}</dd>
      </div>`;
    }).join('');
    const inputs = editable.map(name => {
      const { kind, label, max } = CONTRACT_FIELDS[name];
      const attributes = `name="${escapeHtml(name)}" id="contract-field-${escapeHtml(name)}" required class="${inputClass}"`;
      const control = kind === 'long'
        ? `<textarea ${attributes} rows="3" maxlength="${max}"></textarea>`
        : `<input ${attributes} type="${kind}" ${kind === 'text' ? `maxlength="${max}"` : ''}>`;
      return `<label class="text-xs font-medium text-neutral-700 ${kind === 'long' ? 'sm:col-span-2' : ''}" for="contract-field-${escapeHtml(name)}">${escapeHtml(label)}${control}</label>`;
    }).join('');

    root.innerHTML = `
      <section class="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-neutral-900">Preparar contrato</h2>
            <p class="mt-1 break-all text-xs text-neutral-500">Protocolo ${escapeHtml(leadId)}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-contract-reload class="${buttonClass}">Recarregar dados</button>
            <button type="button" data-contract-model class="${buttonClass}">Editar modelo</button>
          </div>
        </div>
        <div class="grid items-start gap-5 lg:grid-cols-2">
          <div class="grid gap-4">
            ${details ? `
              <div class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <h3 class="mb-3 text-sm font-semibold text-neutral-900">Dados da proposta</h3>
                <dl class="grid gap-3">${details}</dl>
              </div>
            ` : ''}
            <form data-contract-form>
              <fieldset data-contract-fields class="grid gap-4 disabled:opacity-60">
                ${inputs ? `
                  <div>
                    <h3 class="mb-2 text-sm font-semibold text-neutral-900">Dados do contrato</h3>
                    <div class="grid gap-3 sm:grid-cols-2">${inputs}</div>
                  </div>
                ` : ''}
                <label class="flex items-start gap-2 text-sm text-neutral-800">
                  <input type="checkbox" id="contract-accepted" name="aceitou" required class="mt-0.5 h-4 w-4 rounded border-neutral-300">
                  <span>Confirmei o aceite da proposta</span>
                </label>
                <div>
                  <button type="submit" data-contract-generate class="${buttonClass}">Gerar prévia</button>
                </div>
              </fieldset>
            </form>
          </div>
          <div class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <label for="contract-preview" class="text-sm font-semibold text-neutral-900">Prévia do contrato</label>
            <textarea id="contract-preview" readonly rows="16" class="${inputClass}" placeholder="A prévia aparece após o preenchimento e a confirmação do aceite."></textarea>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" data-contract-pdf disabled class="${primaryButtonClass}">Baixar PDF</button>
              <span data-contract-preview-note class="text-xs text-neutral-600"></span>
            </div>
          </div>
        </div>
        <p data-contract-feedback role="status" aria-live="polite" class="mt-3 text-sm"></p>
      </section>
    `;

    const form = root.querySelector('[data-contract-form]');
    const fields = root.querySelector('[data-contract-fields]');
    const message = root.querySelector('[data-contract-feedback]');
    const preview = root.querySelector('#contract-preview');
    const pdfButton = root.querySelector('[data-contract-pdf]');
    const previewNote = root.querySelector('[data-contract-preview-note]');
    const modelButton = root.querySelector('[data-contract-model]');
    const reloadButton = root.querySelector('[data-contract-reload]');
    const field = name => form.elements.namedItem(name);
    let busy = false;
    let previewPayload = null;
    for (const name of editable) field(name).value = valores[name] || '';

    function refresh() {
      fields.disabled = busy;
      modelButton.disabled = busy;
      reloadButton.disabled = busy;
      pdfButton.disabled = busy || !previewPayload;
    }

    function requestOptions(payload) {
      return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      };
    }

    form.addEventListener('input', () => {
      if (previewPayload) previewNote.textContent = 'Dados alterados. Gere uma nova prévia para baixar.';
      previewPayload = null;
      preview.value = '';
      feedback(message);
      refresh();
    });
    modelButton.addEventListener('click', () => openModel(lead));
    reloadButton.addEventListener('click', () => openLead(lead));

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !field('aceitou').checked) return;
      const payload = {
        proposalRevision,
        templateRevision: modelo.revision,
        aceitou: true,
        valores: Object.fromEntries(editable.map(name => [name, field(name).value.trim()]))
      };
      busy = true;
      feedback(message);
      refresh();
      try {
        const response = await api(`${API_PATH}/${encodeURIComponent(leadId)}/previa`, requestOptions(payload));
        if (token !== generation) return;
        preview.value = response.texto;
        previewPayload = payload;
        previewNote.textContent = 'Confira o texto antes de baixar.';
        feedback(message, 'Prévia gerada.');
      } catch (error) {
        if (token === generation) feedback(message, error.message || 'Não foi possível gerar a prévia.', true);
      } finally {
        if (token === generation) {
          busy = false;
          refresh();
        }
      }
    });

    pdfButton.addEventListener('click', async () => {
      if (busy || !previewPayload) return;
      busy = true;
      feedback(message);
      refresh();
      try {
        const blob = await download(`${API_PATH}/${encodeURIComponent(leadId)}/pdf`, requestOptions(previewPayload));
        if (token !== generation) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const fileProtocol = String(leadId).replace(/[^\w-]/g, '');
        link.href = url;
        link.download = `contrato-${fileProtocol || 'anna-luisa'}.pdf`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        feedback(message, 'Download iniciado.');
      } catch (error) {
        if (token === generation) feedback(message, error.message || 'Não foi possível baixar o PDF.', true);
      } finally {
        if (token === generation) {
          busy = false;
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
    showLoading('Carregando contrato…');
    try {
      const result = await api(`${API_PATH}/${encodeURIComponent(lead.id)}`);
      if (token !== generation) return;
      if (!result.modelo.revision) {
        const model = await api(MODEL_PATH);
        if (token === generation) renderModel(model, token, lead);
        return;
      }
      renderContract(result, token, lead);
    } catch (error) {
      if (token === generation) showError(error, () => openLead(lead), lead);
    }
  }

  return {
    enter() {
      if (view === 'idle' || view === 'error') return openModel();
    },
    openLead,
    reset() {
      generation += 1;
      view = 'idle';
      root.replaceChildren();
    }
  };
}
