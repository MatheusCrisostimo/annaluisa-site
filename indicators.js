import { listAgenda } from './agenda.js';
import { CAMPAIGN_FIELDS, campaignKey, listCampaignInvestments, saveCampaignInvestment } from './campaign-investment.js';
import { listFollowups } from './followup.js';
import { listLeads } from './lead-store.js';
import { listProposals } from './proposals.js';
import { normalizeCampaign } from './scripts/attribution.js';

const SAO_PAULO_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
const DATE_PATTERN = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const GROUPS = new Set(['1 pessoa', '2 a 3 pessoas', '4 ou mais pessoas']);
const EVENT_DATE_SERVICES = new Set(['Noiva', 'Maquiagem Social']);
const NO_CAMPAIGN_KEY = campaignKey(null);
const MAX_INVESTMENT_CENTS = 99_999_999_999;
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

function explicitPeriod({ de, ate }) {
  if (!validDate(de) || !validDate(ate) || de > ate) return null;
  return { de, ate };
}

function selectedPeriod({ de, ate }) {
  if (de === undefined && ate === undefined) {
    const today = SAO_PAULO_DATE.format(new Date());
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 29);
    return { de: start.toISOString().slice(0, 10), ate: today };
  }
  return explicitPeriod({ de, ate });
}

function investmentCampaign(values) {
  const campaign = normalizeCampaign(values);
  if (!campaign) return null;
  const valid = CAMPAIGN_FIELDS.every(field => {
    const value = values[field];
    return value == null || (typeof value === 'string' && (!value.trim() || Object.hasOwn(campaign, field)));
  });
  return valid ? campaign : null;
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

function collectStageLeadIds(records, leadIds, predicate) {
  return new Set(records.filter(record => leadIds.has(record.leadId) && predicate(record))
    .map(record => record.leadId));
}

function campaignRow(rows, storedCampaign) {
  const campaign = normalizeCampaign(storedCampaign);
  const utm_source = campaign?.utm_source ?? null;
  const utm_medium = campaign?.utm_medium ?? null;
  const utm_campaign = campaign?.utm_campaign ?? null;
  const key = campaignKey(campaign);
  if (!rows.has(key)) {
    rows.set(key, {
      utm_source, utm_medium, utm_campaign,
      pedidos: 0, comDadosEvento: 0, propostasProntas: 0, contratosAssinados: 0, atendimentosConfirmados: 0,
      investimentoCentavos: null, financeiro: null
    });
  }
  return rows.get(key);
}

function addCampaignFinances(followups, campaignByLeadId, signedLeadIds) {
  const totals = new Map();
  for (const { leadId, totalCentavos, recebidoCentavos } of followups) {
    const campaign = campaignByLeadId.get(leadId);
    if (!campaign || !Number.isSafeInteger(totalCentavos) || totalCentavos <= 0
      || !Number.isSafeInteger(recebidoCentavos) || recebidoCentavos < 0 || recebidoCentavos > totalCentavos) continue;

    if (!totals.has(campaign)) {
      totals.set(campaign, { contratadoCentavos: 0n, recebidoCentavos: 0n, saldoContratadoCentavos: 0n });
    }
    const finance = totals.get(campaign);
    const received = BigInt(recebidoCentavos);
    finance.recebidoCentavos += received;
    if (signedLeadIds.has(leadId)) {
      const contracted = BigInt(totalCentavos);
      finance.contratadoCentavos += contracted;
      finance.saldoContratadoCentavos += contracted - received;
    }
  }

  for (const [campaign, sum] of totals) {
    campaign.financeiro = Object.fromEntries(Object.entries(sum).map(([field, cents]) => [field, cents.toString()]));
  }
}

function sortedCampaigns(rows) {
  return [...rows.entries()].sort(([leftKey, left], [rightKey, right]) => {
    const untaggedOrder = Number(leftKey === NO_CAMPAIGN_KEY) - Number(rightKey === NO_CAMPAIGN_KEY);
    if (untaggedOrder) return untaggedOrder;
    if (left.pedidos !== right.pedidos) return right.pedidos - left.pedidos;
    return leftKey < rightKey ? -1 : Number(leftKey > rightKey);
  }).map(([, row]) => row);
}

function calculate(periodo, leads, proposals, followups, agenda, investments) {
  const originCounts = new Map();
  const serviceCounts = new Map();
  const campaigns = new Map();
  const campaignByLeadId = new Map();
  const durations = [];
  const pedidos = { recebidos: 0, pendentes: 0, comDadosEvento: 0 };
  for (const lead of leads) {
    const created = parseTimestamp(lead.createdAt);
    if (created === null) continue;
    const localDate = SAO_PAULO_DATE.format(created);
    if (localDate < periodo.de || localDate > periodo.ate) continue;

    const row = campaignRow(campaigns, lead.campanha);
    campaignByLeadId.set(lead.id, row);
    row.pedidos++;
    pedidos.recebidos++;
    if (lead.status === 'pendente') pedidos.pendentes++;
    if (completeEvent(lead)) {
      pedidos.comDadosEvento++;
      row.comDadosEvento++;
    }
    const repliedAt = parseTimestamp(lead.primeiroRespondidoEm || lead.respondidoEm);
    if (repliedAt !== null && repliedAt >= created) durations.push(repliedAt - created);
    countIn(originCounts, Object.hasOwn(ORIGIN_LABELS, lead.origem) ? lead.origem : 'outros');
    countIn(serviceCounts, SERVICE_KEYS.get(lead.servico) ?? 'outros');
  }

  const stageLeadIds = {
    propostasProntas: collectStageLeadIds(proposals, campaignByLeadId, record => record.status === 'pronta'),
    contratosAssinados: collectStageLeadIds(followups, campaignByLeadId, record => record.contratoStatus === 'assinado'),
    atendimentosConfirmados: collectStageLeadIds(agenda, campaignByLeadId, record => record.tipo === 'atendimento' && record.status === 'confirmado')
  };
  const etapas = {};
  for (const [stage, ids] of Object.entries(stageLeadIds)) {
    etapas[stage] = ids.size;
    for (const id of ids) campaignByLeadId.get(id)[stage]++;
  }
  addCampaignFinances(followups, campaignByLeadId, stageLeadIds.contratosAssinados);

  for (const investment of investments) {
    campaignRow(campaigns, investment).investimentoCentavos = investment.investimentoCentavos;
  }

  return {
    pedidos,
    retorno: { amostra: durations.length, medianaMinutos: medianMinutes(durations) },
    etapas,
    origens: buildCounts(originCounts, ORIGIN_LABELS),
    servicos: buildCounts(serviceCounts, SERVICE_LABELS),
    campanhas: sortedCampaigns(campaigns)
  };
}

export function registerIndicatorRoutes(app, { verifyAdminAuth, leadError }) {
  const path = '/api/admin/indicadores';
  app.get(path, verifyAdminAuth, async (req, res) => {
    const periodo = selectedPeriod(req.query);
    if (!periodo) {
      return res.status(400).json({ success: false, error: 'Informe uma data inicial e uma data final válidas em ordem.' });
    }
    try {
      const [leads, proposals, followups, agenda, investments] = await Promise.all([
        listLeads(), listProposals(), listFollowups(), listAgenda(), listCampaignInvestments(periodo)
      ]);
      return res.json({ success: true, periodo, ...calculate(periodo, leads, proposals, followups, agenda, investments) });
    } catch (error) {
      return leadError(res, error);
    }
  });

  app.put(`${path}/investimento`, verifyAdminAuth, async (req, res) => {
    const body = req.body ?? {};
    const periodo = explicitPeriod(body.periodo ?? {});
    const campanha = investmentCampaign(body.campanha);
    const { investimentoCentavos } = body;
    if (!periodo) {
      return res.status(400).json({ success: false, error: 'Informe o período exato do investimento, com datas válidas em ordem.' });
    }
    if (!campanha) {
      return res.status(400).json({ success: false, error: 'Informe pelo menos uma UTM válida e revise os campos preenchidos.' });
    }
    if (investimentoCentavos !== null && (!Number.isSafeInteger(investimentoCentavos)
      || investimentoCentavos < 0 || investimentoCentavos > MAX_INVESTMENT_CENTS)) {
      return res.status(400).json({ success: false, error: 'Informe o investimento em centavos inteiros, entre R$ 0,00 e R$ 999.999.999,99.' });
    }

    try {
      await saveCampaignInvestment(periodo, campanha, investimentoCentavos);
      return res.json({ success: true });
    } catch (error) {
      return leadError(res, error);
    }
  });
}
