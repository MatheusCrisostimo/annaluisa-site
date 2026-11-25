import { listAgenda } from './agenda.js';
import { listFollowups } from './followup.js';
import { listLeads } from './lead-store.js';
import { listProposals } from './proposals.js';

const SAO_PAULO_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
const DATE_PATTERN = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const GROUPS = new Set(['1 pessoa', '2 a 3 pessoas', '4 ou mais pessoas']);
const EVENT_DATE_SERVICES = new Set(['Noiva', 'Maquiagem Social']);
const ORIGIN_LABELS = {
  site: 'Site', simulador: 'Simulador', whatsapp: 'WhatsApp', agendar: 'Agendamento', outros: 'Outras origens'
};
const SERVICE_LABELS = {
  noiva: 'Noiva',
  'maquiagem-social': 'Maquiagem Social',
  automaquiagem: 'Aula de Automaquiagem',
  corporativo: 'Soluções Corporativas',
  outros: 'Outros serviços'
};
const SERVICE_KEYS = new Map([
  ['Noiva', 'noiva'],
  ['Maquiagem Social', 'maquiagem-social'],
  ['Aula de Automaquiagem', 'automaquiagem'],
  ['Soluções Corporativas', 'corporativo'],
  ['Empresas / Corporativo', 'corporativo']
]);

function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !validDate(value.slice(0, 10)) || !TIME_PATTERN.test(value.slice(10))) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function selectedPeriod({ de, ate }) {
  if (de === undefined && ate === undefined) {
    const today = SAO_PAULO_DATE.format(new Date());
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 29);
    return { de: start.toISOString().slice(0, 10), ate: today };
  }
  if (!validDate(de) || !validDate(ate) || de > ate) return null;
  return { de, ate };
}

function completeEvent(lead) {
  const cityLength = typeof lead.cidade === 'string' ? lead.cidade.trim().length : 0;
  return cityLength >= 2 && cityLength <= 100 && GROUPS.has(lead.pessoas)
    && (!EVENT_DATE_SERVICES.has(lead.servico) || validDate(lead.data));
}

function buildCounts(counts, labels) {
  return Object.entries(labels).map(([chave, rotulo]) => ({ chave, rotulo, total: counts.get(chave) ?? 0 }));
}

function countIn(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function medianMinutes(durations) {
  if (!durations.length) return null;
  durations.sort((first, second) => first - second);
  const left = durations[Math.floor((durations.length - 1) / 2)];
  const right = durations[Math.floor(durations.length / 2)];
  return (left + (right - left) / 2) / 60_000;
}

function countStage(records, leadIds, predicate) {
  return new Set(records.filter(record => leadIds.has(record.leadId) && predicate(record))
    .map(record => record.leadId)).size;
}

function calculate(periodo, leads, proposals, contracts, agenda) {
  const originCounts = new Map();
  const serviceCounts = new Map();
  const leadIds = new Set();
  const durations = [];
  const pedidos = { recebidos: 0, pendentes: 0, comDadosEvento: 0 };
  for (const lead of leads) {
    const created = parseTimestamp(lead.createdAt);
    if (created === null) continue;
    const localDate = SAO_PAULO_DATE.format(created);
    if (localDate < periodo.de || localDate > periodo.ate) continue;

    leadIds.add(lead.id);
    pedidos.recebidos++;
    if (lead.status === 'pendente') pedidos.pendentes++;
    if (completeEvent(lead)) pedidos.comDadosEvento++;
    const repliedAt = parseTimestamp(lead.primeiroRespondidoEm || lead.respondidoEm);
    if (repliedAt !== null && repliedAt >= created) durations.push(repliedAt - created);
    countIn(originCounts, Object.hasOwn(ORIGIN_LABELS, lead.origem) ? lead.origem : 'outros');
    countIn(serviceCounts, SERVICE_KEYS.get(lead.servico) ?? 'outros');
  }

  return {
    pedidos,
    retorno: { amostra: durations.length, medianaMinutos: medianMinutes(durations) },
    etapas: {
      propostasProntas: countStage(proposals, leadIds, record => record.status === 'pronta'),
      contratosAssinados: countStage(contracts, leadIds, record => record.contratoStatus === 'assinado'),
      atendimentosConfirmados: countStage(agenda, leadIds, record => record.tipo === 'atendimento' && record.status === 'confirmado')
    },
    origens: buildCounts(originCounts, ORIGIN_LABELS),
    servicos: buildCounts(serviceCounts, SERVICE_LABELS)
  };
}

export function registerIndicatorRoutes(app, { verifyAdminAuth, leadError }) {
  app.get('/api/admin/indicadores', verifyAdminAuth, async (req, res) => {
    const periodo = selectedPeriod(req.query);
    if (!periodo) {
      return res.status(400).json({ success: false, error: 'Informe uma data inicial e uma data final válidas em ordem.' });
    }
    try {
      const [leads, proposals, contracts, agenda] = await Promise.all([
        listLeads(), listProposals(), listFollowups(), listAgenda()
      ]);
      return res.json({ success: true, periodo, ...calculate(periodo, leads, proposals, contracts, agenda) });
    } catch (error) {
      return leadError(res, error);
    }
  });
}
