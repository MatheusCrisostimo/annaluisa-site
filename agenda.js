import { randomUUID } from 'node:crypto';
import { runRedis, useLocalMemory } from './lead-store.js';

const AGENDA_KEY = 'annaluisa:agenda:v1';
const localAgenda = new Map();
const MINUTE = 60_000;
const MINUTES_PER_DAY = 1440;
const MEETING_TYPES = ['atendimento', 'bloqueio'];
const STATUSES = ['provisorio', 'confirmado', 'cancelado'];

const updateAgenda = `
  local id, version = ARGV[1], ARGV[2]
  local existing = redis.call('HGET', KEYS[1], id)
  if version ~= '' then
    if not existing then return { 'missing' } end
    if cjson.decode(existing).version ~= tonumber(version) then return { 'stale' } end
  elseif existing then
    return { 'stale' }
  end

  local wanted = cjson.decode(ARGV[3])
  if wanted.status ~= 'cancelado' then
    local agenda = redis.call('HVALS', KEYS[1])
    for _, value in ipairs(agenda) do
      local item = cjson.decode(value)
      if item.id ~= id and item.status ~= 'cancelado'
        and wanted.inicioMinutos < item.fimComDeslocamentoMinutos
        and item.inicioMinutos < wanted.fimComDeslocamentoMinutos then
        return { 'conflict', value }
      end
    end
  end
  redis.call('HSET', KEYS[1], id, ARGV[3])
  return { 'ok' }
`;

// The agenda uses wall time for Greater Florianópolis. UTC here provides a
// numerical axis for comparing local dates and times without host timezone rules.
function wallTimeMinutes(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== value) return null;
  return date.getTime() / MINUTE;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function present(record) {
  const { inicioMinutos, fimComDeslocamentoMinutos, ...entry } = record;
  return entry;
}

function overlapping(first, second) {
  return first.inicioMinutos < second.fimComDeslocamentoMinutos
    && second.inicioMinutos < first.fimComDeslocamentoMinutos;
}

async function listAgenda() {
  if (useLocalMemory()) return [...localAgenda.values()];
  const records = await runRedis('HVALS', AGENDA_KEY);
  return records.map(record => JSON.parse(record));
}

async function getAppointment(id) {
  if (useLocalMemory()) return localAgenda.get(id);
  const record = await runRedis('HGET', AGENDA_KEY, id);
  return record ? JSON.parse(record) : null;
}

async function saveAppointment(record, version) {
  if (!useLocalMemory()) {
    const [result, conflict] = await runRedis(
      'EVAL', updateAgenda, 1, AGENDA_KEY, record.id, version === undefined ? '' : String(version), JSON.stringify(record)
    );
    return { result, conflict: conflict ? JSON.parse(conflict) : null };
  }

  // This path completes synchronously so validation and mutation cannot interleave.
  const current = localAgenda.get(record.id);
  if (version !== undefined && !current) return { result: 'missing' };
  if (current?.version !== version) return { result: 'stale' };
  if (record.status !== 'cancelado') {
    const conflict = [...localAgenda.values()].find(item => (
      item.id !== record.id && item.status !== 'cancelado' && overlapping(record, item)
    ));
    if (conflict) return { result: 'conflict', conflict };
  }
  localAgenda.set(record.id, record);
  return { result: 'ok' };
}

function validate(input) {
  const inicio = clean(input.inicio);
  const fim = clean(input.fim);
  const inicioMinutos = wallTimeMinutes(inicio);
  const fimMinutos = wallTimeMinutes(fim);
  const deslocamentoMinutos = input.deslocamentoMinutos ?? 0;
  const titulo = clean(input.titulo);
  const cidade = clean(input.cidade);
  const notas = clean(input.notas);
  const tipo = input.tipo;
  const status = input.status;

  if (!MEETING_TYPES.includes(tipo)) return { error: 'Escolha atendimento ou bloqueio.' };
  if (!STATUSES.includes(status) || (tipo === 'bloqueio' && status === 'provisorio')) {
    return { error: 'Escolha uma situação válida para o compromisso.' };
  }
  if (!titulo || titulo.length > 160) return { error: 'Informe um título de até 160 caracteres.' };
  if (cidade.length > 100 || notas.length > 2000) return { error: 'Revise a cidade e as observações.' };
  if (inicioMinutos === null || fimMinutos === null || fimMinutos <= inicioMinutos) {
    return { error: 'Informe o início e um horário de término posterior.' };
  }
  if (!Number.isSafeInteger(deslocamentoMinutos) || deslocamentoMinutos < 0
      || !Number.isSafeInteger(fimMinutos + deslocamentoMinutos)) {
    return { error: 'Informe minutos inteiros para o deslocamento.' };
  }

  return {
    fields: { inicio, fim, inicioMinutos, fimComDeslocamentoMinutos: fimMinutos + deslocamentoMinutos,
      deslocamentoMinutos, titulo, cidade, notas, tipo, status }
  };
}

function replyAfterSave(res, outcome, record, status) {
  switch (outcome.result) {
    case 'ok':
      return res.status(status).json({ success: true, compromisso: present(record) });
    case 'missing':
      return res.status(404).json({ success: false, error: 'Compromisso não encontrado.' });
    case 'stale':
      return res.status(409).json({
        success: false, codigo: 'desatualizado',
        error: 'O compromisso já foi alterado. Abra a versão atual e revise as mudanças.'
      });
    case 'conflict':
      return res.status(409).json({
        success: false, codigo: 'conflito', conflito: present(outcome.conflict),
        error: `Este horário conflita com “${outcome.conflict.titulo}”, considerando o tempo de deslocamento.`
      });
    default:
      throw new Error('Resultado inesperado ao salvar na agenda.');
  }
}

export function registerAgendaRoutes(app, { verifyAdminAuth, leadError, getLead }) {
  const path = '/api/admin/agenda';

  app.get(path, verifyAdminAuth, async (req, res) => {
    const { de, ate, incluirCancelados } = req.query;
    const periodStart = wallTimeMinutes(`${de}T00:00`);
    const periodEnd = wallTimeMinutes(`${ate}T00:00`);
    if (periodStart === null || periodEnd === null || periodStart > periodEnd) {
      return res.status(400).json({ success: false, error: 'Informe um período válido.' });
    }

    try {
      const period = { inicioMinutos: periodStart, fimComDeslocamentoMinutos: periodEnd + MINUTES_PER_DAY };
      const compromissos = (await listAgenda())
        .filter(item => (item.status !== 'cancelado' || incluirCancelados === '1') && overlapping(item, period))
        .sort((first, second) => first.inicioMinutos - second.inicioMinutos || first.fim.localeCompare(second.fim))
        .map(present);
      return res.json({ success: true, compromissos });
    } catch (error) {
      return leadError(res, error);
    }
  });

  app.post(path, verifyAdminAuth, async (req, res) => {
    const body = req.body ?? {};
    const leadId = clean(body.leadId);
    if (leadId.length > 128 || (leadId && body.tipo !== 'atendimento')) {
      return res.status(400).json({ success: false, error: 'Vincule a solicitação a um atendimento.' });
    }
    const status = body.status ?? (body.tipo === 'bloqueio' ? 'confirmado' : 'provisorio');
    if (status === 'cancelado') {
      return res.status(400).json({ success: false, error: 'Escolha uma situação ativa para criar o compromisso.' });
    }

    try {
      const lead = leadId ? await getLead(leadId) : null;
      if (leadId && !lead) return res.status(404).json({ success: false, error: 'Solicitação não encontrada.' });
      const { fields, error } = validate({
        ...body, status, titulo: body.titulo ?? lead?.nome, cidade: body.cidade ?? lead?.cidade
      });
      if (error) return res.status(400).json({ success: false, error });
      const now = new Date().toISOString();
      const record = { ...fields, id: randomUUID(), leadId, version: 1, createdAt: now, updatedAt: now };
      return replyAfterSave(res, await saveAppointment(record), record, 201);
    } catch (error) {
      return leadError(res, error);
    }
  });

  app.patch(`${path}/:id`, verifyAdminAuth, async (req, res) => {
    const body = req.body ?? {};
    if (!Number.isSafeInteger(body.version) || body.version < 1) {
      return res.status(400).json({ success: false, error: 'Abra a versão atual do compromisso para editar.' });
    }

    try {
      const current = await getAppointment(req.params.id);
      if (!current) return replyAfterSave(res, { result: 'missing' });
      if (current.version !== body.version) return replyAfterSave(res, { result: 'stale' });
      if (current.leadId && body.tipo && body.tipo !== 'atendimento') {
        return res.status(400).json({ success: false, error: 'O compromisso vinculado precisa continuar como atendimento.' });
      }

      const { fields, error } = validate({ ...current, ...body });
      if (error) return res.status(400).json({ success: false, error });
      const record = { ...current, ...fields, version: current.version + 1, updatedAt: new Date().toISOString() };
      return replyAfterSave(res, await saveAppointment(record, body.version), record, 200);
    } catch (error) {
      return leadError(res, error);
    }
  });
}
