import { createHash } from 'node:crypto';
import { runRedis, useLocalMemory } from './lead-store.js';
import { getLocalProposal, PROPOSALS_KEY } from './proposals.js';

const FOLLOWUPS_KEY = 'annaluisa:acompanhamentos:v1';
const CONTRACT_STATUSES = ['a_enviar', 'enviado', 'assinado'];
const localFollowups = new Map();

const SAVE_FOLLOWUP = `
  local id, revision = ARGV[1], tonumber(ARGV[2])
  local raw = redis.call('HGET', KEYS[1], id)
  if raw then
    local current = cjson.decode(raw)
    if current.fingerprint == ARGV[3] and (current.revision == revision or current.revision == revision + 1) then
      return { 'ok', raw }
    end
    if current.revision ~= revision then return { 'stale' } end
  elseif revision ~= 0 then
    return { 'stale' }
  end

  if ARGV[4] ~= '' then
    local saved = redis.call('HGET', KEYS[2], id)
    if not saved then return { 'proposal_changed' } end
    local proposal = cjson.decode(saved)
    if proposal.status ~= 'pronta' or proposal.revision ~= tonumber(ARGV[4]) then
      return { 'proposal_changed' }
    end
  end

  redis.call('HSET', KEYS[1], id, ARGV[5])
  return { 'ok', ARGV[5] }
`;

function readyProposal(proposal) {
  return proposal?.status === 'pronta' && Number.isSafeInteger(proposal.revision) && proposal.revision > 0
    && Number.isSafeInteger(proposal.precoCentavos) && proposal.precoCentavos > 0;
}

function validOptionalDate(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validAmount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function successfulRetry(record, revision, fingerprint) {
  return record?.fingerprint === fingerprint && [revision, revision + 1].includes(record.revision);
}

async function loadFollowup(leadId) {
  if (useLocalMemory()) return localFollowups.get(leadId) ?? null;
  const result = await runRedis('HGET', FOLLOWUPS_KEY, leadId);
  return result ? JSON.parse(result) : null;
}

export async function listFollowups() {
  if (useLocalMemory()) return [...localFollowups.values()];
  const records = await runRedis('HVALS', FOLLOWUPS_KEY);
  return records.map(record => JSON.parse(record));
}

async function saveFollowup(record, revision, proposalRevision) {
  const { leadId, fingerprint } = record;
  if (useLocalMemory()) {
    const current = localFollowups.get(leadId);
    if (successfulRetry(current, revision, fingerprint)) return { record: current };
    if ((current?.revision ?? 0) !== revision) return { result: 'stale' };
    if (proposalRevision !== null) {
      const proposal = getLocalProposal(leadId);
      if (!readyProposal(proposal) || proposal.revision !== proposalRevision) return { result: 'proposal_changed' };
    }
    localFollowups.set(leadId, record);
    return { record };
  }

  const [result, saved] = await runRedis('EVAL', SAVE_FOLLOWUP, 2, FOLLOWUPS_KEY, PROPOSALS_KEY,
    leadId, revision, fingerprint, proposalRevision ?? '', JSON.stringify(record));
  if (result !== 'ok') return { result };
  return { record: JSON.parse(saved) };
}

function fromProposal(leadId, proposal) {
  return {
    leadId,
    nome: proposal.nome,
    servico: proposal.servico,
    dataEvento: proposal.data || '',
    contratoStatus: 'a_enviar',
    totalCentavos: proposal.precoCentavos,
    sinalCentavos: null,
    recebidoCentavos: 0,
    sinalVenceEm: '',
    saldoVenceEm: '',
    revision: 0,
    updatedAt: null,
    propostaRevision: proposal.revision
  };
}

function publicRecord({ fingerprint, ...record }) {
  return record;
}

function detailedRecord(record, lead, proposal) {
  const ready = readyProposal(proposal);
  return {
    ...publicRecord(record),
    telefone: typeof lead.telefone === 'string' ? lead.telefone : '',
    autorizaWhatsApp: lead.autorizaWhatsApp ?? null,
    propostaTotalAtualCentavos: ready ? proposal.precoCentavos : null,
    propostaRevisionAtual: ready ? proposal.revision : null
  };
}

function inputFor(body) {
  const { revision, contratoStatus, recebidoCentavos, propostaRevisionAtual } = body;
  const sinalCentavos = body.sinalCentavos ?? null;
  const sinalVenceEm = body.sinalVenceEm ?? '';
  const saldoVenceEm = body.saldoVenceEm ?? '';
  const atualizarValor = body.atualizarValor ?? false;

  if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) {
    return { error: 'Reabra o acompanhamento antes de salvar.' };
  }
  if (!CONTRACT_STATUSES.includes(contratoStatus) || typeof atualizarValor !== 'boolean') {
    return { error: 'Selecione uma situação válida para o contrato.' };
  }
  if ((sinalCentavos !== null && !validAmount(sinalCentavos)) || !validAmount(recebidoCentavos)) {
    return { error: 'Informe valores válidos com até duas casas decimais.' };
  }
  if (!validOptionalDate(sinalVenceEm) || !validOptionalDate(saldoVenceEm)) {
    return { error: 'Revise as datas de vencimento.' };
  }

  const needsProposal = revision === 0 || atualizarValor;
  if (needsProposal && (!Number.isSafeInteger(propostaRevisionAtual) || propostaRevisionAtual < 1)) {
    return { error: 'Reabra o acompanhamento para conferir o valor da proposta.' };
  }
  return {
    revision,
    proposalGuard: needsProposal ? propostaRevisionAtual : null,
    fields: { contratoStatus, sinalCentavos, recebidoCentavos, sinalVenceEm, saldoVenceEm },
    atualizarValor
  };
}

function replyError(res, status, error) {
  return res.status(status).json({ success: false, error });
}

export function registerFollowupRoutes(app, { verifyAdminAuth, leadError, getLead, getProposal }) {
  const path = '/api/admin/acompanhamento';

  app.get(path, verifyAdminAuth, async (_req, res) => {
    try {
      const records = await listFollowups();
      records.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)
        || first.leadId.localeCompare(second.leadId));
      return res.json({ success: true, acompanhamentos: records.map(publicRecord) });
    } catch (error) {
      return leadError(res, error);
    }
  });

  app.get(`${path}/:leadId`, verifyAdminAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const lead = await getLead(leadId);
      if (!lead) return replyError(res, 404, 'Solicitação não encontrada.');
      const [saved, proposal] = await Promise.all([loadFollowup(leadId), getProposal(leadId)]);
      if (!saved && !readyProposal(proposal)) {
        return replyError(res, 409, 'Salve a proposta como pronta para iniciar o acompanhamento.');
      }
      const acompanhamento = detailedRecord(saved ?? fromProposal(leadId, proposal), lead, proposal);
      return res.json({ success: true, acompanhamento });
    } catch (error) {
      return leadError(res, error);
    }
  });

  app.put(`${path}/:leadId`, verifyAdminAuth, async (req, res) => {
    const input = inputFor(req.body ?? {});
    if (input.error) return replyError(res, 400, input.error);
    const { revision, fields, proposalGuard, atualizarValor } = input;

    try {
      const { leadId } = req.params;
      const lead = await getLead(leadId);
      if (!lead) return replyError(res, 404, 'Solicitação não encontrada.');
      const [saved, proposal] = await Promise.all([loadFollowup(leadId), getProposal(leadId)]);
      const fingerprint = createHash('sha256').update(JSON.stringify({ fields, proposalGuard, atualizarValor })).digest('hex');
      if (successfulRetry(saved, revision, fingerprint)) {
        return res.json({ success: true, acompanhamento: detailedRecord(saved, lead, proposal) });
      }
      if ((saved?.revision ?? 0) !== revision) {
        return replyError(res, 409, 'O acompanhamento foi alterado. Reabra o registro antes de salvar.');
      }
      if (proposalGuard !== null && (!readyProposal(proposal) || proposal.revision !== proposalGuard)) {
        return replyError(res, 409, 'A proposta mudou ou deixou de estar pronta. Reabra o registro para conferir o valor.');
      }

      const base = saved ?? fromProposal(leadId, proposal);
      const totalCentavos = atualizarValor ? proposal.precoCentavos : base.totalCentavos;
      if (fields.sinalCentavos > totalCentavos || fields.recebidoCentavos > totalCentavos) {
        return replyError(res, 400, 'O sinal e o total recebido devem ser iguais ou inferiores ao valor total.');
      }
      const record = {
        ...base, ...fields, totalCentavos, fingerprint,
        propostaRevision: atualizarValor ? proposalGuard : base.propostaRevision,
        revision: revision + 1,
        updatedAt: new Date().toISOString()
      };
      const result = await saveFollowup(record, revision, proposalGuard);
      if (result.result === 'proposal_changed') {
        return replyError(res, 409, 'A proposta mudou ou deixou de estar pronta. Reabra o registro para conferir o valor.');
      }
      if (result.result === 'stale') {
        return replyError(res, 409, 'O acompanhamento foi alterado. Reabra o registro antes de salvar.');
      }
      return res.json({ success: true, acompanhamento: detailedRecord(result.record, lead, proposal) });
    } catch (error) {
      return leadError(res, error);
    }
  });
}
