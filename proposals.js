import { createHash } from 'node:crypto';
import { runRedis, useLocalMemory } from './lead-store.js';

const PROPOSALS_KEY = 'annaluisa:propostas:v1';
const localProposals = new Map();
const BRT_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
const EDITABLE_TEXT_FIELDS = {
  servico: 100,
  cidade: 100,
  numeroPessoas: 100,
  itens: 3000,
  condicoes: 3000
};
const PRESETS = [
  { servico: 'Noiva', itens: 'Serviços de noiva a detalhar conforme a produção solicitada.' },
  { servico: 'Maquiagem Social', itens: 'Maquiagem social para a ocasião informada.' },
  { servico: 'Aula de Automaquiagem', itens: 'Aula prática de automaquiagem. Conteúdo e duração a combinar.' },
  { servico: 'Soluções Corporativas', itens: 'Atendimento de maquiagem para o projeto informado. Equipe e cronograma a combinar.' }
];
const BRIDAL_ITEMS = {
  Maquiagem: 'Maquiagem de noiva',
  Penteado: 'Penteado de noiva',
  Prévia: 'Prévia da produção',
  Acompanhamento: 'Acompanhamento no evento. Horário e escopo a combinar.'
};

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validDate(value) {
  const parsed = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

function matchingPreset(service) {
  if (/noiva/i.test(service)) return PRESETS[0];
  if (/aula|automaquiagem/i.test(service)) return PRESETS[2];
  if (/empresa|corporativ/i.test(service)) return PRESETS[3];
  if (/social|formatura/i.test(service)) return PRESETS[1];
  return null;
}

function proposalFromLead(lead) {
  const servico = clean(lead.servico);
  const preset = matchingPreset(servico);
  const selected = preset === PRESETS[0] && Array.isArray(lead.itensNoiva)
    ? Object.entries(BRIDAL_ITEMS).filter(([item]) => lead.itensNoiva.includes(item)).map(([, text]) => text).join('\n')
    : '';
  const modelos = PRESETS.map(model => model === PRESETS[0] && selected ? { ...model, itens: selected } : model);
  const proposal = {
    leadId: lead.id,
    nome: clean(lead.nome),
    email: clean(lead.email),
    telefone: clean(lead.telefone),
    servico,
    cidade: clean(lead.cidade),
    numeroPessoas: clean(lead.pessoas),
    data: validDate(lead.data) ? lead.data : '',
    horario: /^([01]\d|2[0-3]):[0-5]\d$/.test(lead.horario) ? lead.horario : '',
    itens: selected || preset?.itens || '',
    condicoes: '',
    precoCentavos: null,
    validade: '',
    status: 'rascunho',
    revision: 0,
    updatedAt: null
  };
  return { proposal, modelos };
}

function sanitizeEdit(body, current) {
  const edit = {};
  for (const [field, maxLength] of Object.entries(EDITABLE_TEXT_FIELDS)) {
    const value = body[field] ?? current[field];
    if (typeof value !== 'string' || value.trim().length > maxLength) {
      return { error: 'Revise o tamanho dos campos de texto da proposta.' };
    }
    edit[field] = value.trim();
  }

  const data = body.data ?? current.data;
  const horario = body.horario ?? current.horario;
  const validade = body.validade ?? current.validade;
  if (typeof data !== 'string' || (data && !validDate(data))) {
    return { error: 'Informe uma data válida para o atendimento.' };
  }
  if (typeof horario !== 'string' || (horario && !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario))) {
    return { error: 'Informe um horário válido para o atendimento.' };
  }
  if (typeof validade !== 'string' || (validade && !validDate(validade))) {
    return { error: 'Informe uma data de validade válida.' };
  }

  const precoCentavos = Object.hasOwn(body, 'precoCentavos') ? body.precoCentavos : current.precoCentavos;
  if (precoCentavos !== null && (!Number.isSafeInteger(precoCentavos) || precoCentavos < 0)) {
    return { error: 'Informe um valor total em reais, com até duas casas decimais.' };
  }

  const status = body.status;
  if (status !== 'rascunho' && status !== 'pronta') {
    return { error: 'Selecione uma situação válida para a proposta.' };
  }
  if (status === 'pronta') {
    if (!edit.servico || !edit.itens) return { error: 'Preencha o serviço e os itens da proposta.' };
    if (!precoCentavos) return { error: 'Informe o valor total antes de marcar a proposta como pronta.' };
    if (!validade || validade < BRT_DATE.format(new Date())) {
      return { error: 'Informe uma validade igual ou posterior a hoje.' };
    }
  }
  return { edit: { ...edit, data, horario, validade, precoCentavos, status } };
}

const SAVE_PROPOSAL_SCRIPT = `
  local raw = redis.call('HGET', KEYS[1], ARGV[1])
  local revision = tonumber(ARGV[2])
  if raw then
    local current = cjson.decode(raw)
    if current.fingerprint == ARGV[3] and (current.revision == revision or current.revision == revision + 1) then
      return raw
    end
    if current.revision ~= revision then return false end
  elseif revision ~= 0 then
    return false
  end
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
  return ARGV[4]
`;

async function loadProposal(leadId) {
  if (useLocalMemory()) return localProposals.get(leadId) ?? null;
  const result = await runRedis('HGET', PROPOSALS_KEY, leadId);
  return result ? JSON.parse(result) : null;
}

async function saveProposal(record, revision) {
  const { leadId, fingerprint } = record;
  if (useLocalMemory()) {
    const current = localProposals.get(leadId);
    if (current?.fingerprint === fingerprint && [revision, revision + 1].includes(current.revision)) {
      return current;
    }
    if ((current?.revision ?? 0) !== revision) return null;
    localProposals.set(leadId, record);
    return record;
  }
  const saved = await runRedis('EVAL', SAVE_PROPOSAL_SCRIPT, 1, PROPOSALS_KEY, leadId, revision, fingerprint, JSON.stringify(record));
  return saved ? JSON.parse(saved) : null;
}

function publicFields({ fingerprint, ...proposal }) {
  return proposal;
}

export function registerProposalRoutes(app, { verifyAdminAuth, leadError, getLead }) {
  const path = '/api/admin/propostas';
  app.get(path, verifyAdminAuth, async (req, res) => {
    try {
      const records = useLocalMemory()
        ? [...localProposals.values()]
        : (await runRedis('HVALS', PROPOSALS_KEY)).map(record => JSON.parse(record));
      records.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
      const proposals = records.map(({ leadId, nome, servico, status, updatedAt, validade, precoCentavos }) => ({
        leadId, nome, servico, status, updatedAt, validade, precoCentavos
      }));
      return res.json({ success: true, proposals });
    } catch (error) {
      return leadError(res, error);
    }
  });

  app.get(`${path}/:leadId`, verifyAdminAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const lead = await getLead(leadId);
      if (!lead) return res.status(404).json({ success: false, error: 'Solicitação não encontrada.' });
      const { proposal, modelos } = proposalFromLead(lead);
      const saved = await loadProposal(leadId);
      return res.json({ success: true, proposal: saved ? publicFields(saved) : proposal, modelos });
    } catch (error) {
      return leadError(res, error);
    }
  });

  app.put(`${path}/:leadId`, verifyAdminAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const body = req.body ?? {};
      const { revision } = body;
      if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) {
        return res.status(400).json({ success: false, error: 'Reabra a proposta antes de salvar.' });
      }

      const lead = await getLead(leadId);
      if (!lead) return res.status(404).json({ success: false, error: 'Solicitação não encontrada.' });
      const current = (await loadProposal(leadId)) ?? proposalFromLead(lead).proposal;
      const { edit, error } = sanitizeEdit(body, current);
      if (error) return res.status(400).json({ success: false, error });

      const record = {
        ...current,
        ...edit,
        revision: revision + 1,
        updatedAt: new Date().toISOString(),
        fingerprint: createHash('sha256').update(JSON.stringify(edit)).digest('hex')
      };
      const saved = await saveProposal(record, revision);
      if (!saved) {
        return res.status(409).json({
          success: false,
          error: 'Outra versão da proposta foi salva. Consulte a versão atual antes de editar novamente.'
        });
      }
      return res.json({ success: true, proposal: publicFields(saved) });
    } catch (error) {
      return leadError(res, error);
    }
  });
}
