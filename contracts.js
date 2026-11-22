import PDFDocument from 'pdfkit';
import { runRedis, useLocalMemory } from './lead-store.js';
import { CONTRACT_FIELDS, STARTER_CONTRACT, contractTokens } from './scripts/contract-fields.js';

const MODEL_KEY = 'annaluisa:contratos:modelo:v1';
const EMPTY_MODEL = { texto: '', revision: 0 };
const MINIMUM_FIELDS = ['cliente_nome', 'prestadora_nome', 'servicos', 'valor_total'];
const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g;
const MAX_TEMPLATE_LENGTH = 24_000;
const MAX_CONTRACT_LENGTH = 80_000;
const BRT_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
const WHOLE_REAIS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
let localModel = EMPTY_MODEL;

const SAVE_MODEL = `
  local current = redis.call('GET', KEYS[1])
  local revision = tonumber(ARGV[1])
  if current then
    local existing = cjson.decode(current)
    if existing.texto == ARGV[2] and (existing.revision == revision or existing.revision == revision + 1) then
      return current
    end
    if existing.revision ~= revision then return false end
  elseif revision ~= 0 then
    return false
  end
  redis.call('SET', KEYS[1], ARGV[3])
  return ARGV[3]
`;

async function loadModel() {
  if (useLocalMemory()) return localModel;
  const current = await runRedis('GET', MODEL_KEY);
  return current ? JSON.parse(current) : EMPTY_MODEL;
}

async function saveModel(texto, revision) {
  const next = { texto, revision: revision + 1 };
  if (useLocalMemory()) {
    if (localModel.texto === texto && [revision, revision + 1].includes(localModel.revision)) return localModel;
    if (localModel.revision !== revision) return null;
    localModel = next;
    return next;
  }

  const saved = await runRedis('EVAL', SAVE_MODEL, 1, MODEL_KEY, revision, texto, JSON.stringify(next));
  return saved ? JSON.parse(saved) : null;
}

function cleanText(value) {
  return value.replace(/\r\n?/g, '\n').replaceAll('\t', '    ').normalize('NFC').trim();
}

// Helvetica uses WinAnsi. Refuse text that would be missing or corrupted in the PDF.
function canRender(value) {
  return /^[\n\x20-\x7e\u00a0-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/u.test(value);
}

function validateModel(texto) {
  if (!texto || texto.length > MAX_TEMPLATE_LENGTH) return 'Informe um modelo de até 24.000 caracteres.';
  if (texto.includes('[[') || texto.includes(']]')) return 'Substitua os trechos de orientação entre colchetes pelo texto do contrato.';
  if (/[{}]/.test(texto.replace(TOKEN, ''))) return 'Revise as chaves dos campos. Use o formato {{nome_do_campo}}.';
  if (!canRender(texto)) return 'O modelo tem caracteres que a fonte do PDF não consegue exibir.';

  const tokens = contractTokens(texto);
  const unknown = tokens.find(token => !Object.hasOwn(CONTRACT_FIELDS, token));
  if (unknown) return `O campo “${unknown}” não está disponível neste modelo.`;
  const missing = MINIMUM_FIELDS.filter(field => !tokens.includes(field));
  if (missing.length) return `Inclua no modelo os campos ${missing.map(field => `{{${field}}}`).join(', ')}.`;
  return null;
}

function currencyFromCents(amount) {
  const cents = BigInt(amount);
  const reais = WHOLE_REAIS.format(cents / 100n);
  return `R$ ${reais},${String(cents % 100n).padStart(2, '0')}`;
}

function defaultsFor(proposal, leadId) {
  return {
    ...Object.fromEntries(Object.keys(CONTRACT_FIELDS).map(key => [key, ''])),
    cliente_nome: proposal.nome,
    servico: proposal.servico,
    valor_total: currencyFromCents(proposal.precoCentavos),
    proposta_protocolo: leadId,
    servicos: proposal.itens,
    data_evento: proposal.data,
    hora_pronta: proposal.horario,
    cidade_evento: proposal.cidade,
    condicoes_pagamento: proposal.condicoes,
    data_emissao: BRT_DATE.format(new Date())
  };
}

function dateForContract(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value.split('-').reverse().join('/');
}

function buildContract(model, defaults, inputs) {
  const fields = Object.create(null);
  for (const key of contractTokens(model)) {
    const field = CONTRACT_FIELDS[key];
    const raw = field.source === 'input' && Object.hasOwn(inputs, key) ? inputs[key] : defaults[key];
    const value = typeof raw === 'string' ? cleanText(raw) : '';
    if (!value) return { error: `Preencha “${field.label}”.`, campo: key };
    if (value.length > field.max || (field.kind === 'text' && value.includes('\n'))) {
      return { error: `Revise o tamanho e o formato do campo “${field.label}”.`, campo: key };
    }
    if (!canRender(value)) {
      return { error: `O campo “${field.label}” contém caracteres que a fonte do PDF não consegue exibir.`, campo: key };
    }
    if (field.kind === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      return { error: `Informe um horário válido em “${field.label}”.`, campo: key };
    }
    fields[key] = field.kind === 'date' ? dateForContract(value) : value;
    if (!fields[key]) return { error: `Informe uma data válida em “${field.label}”.`, campo: key };
  }

  let length = model.length;
  for (const [placeholder, key] of model.matchAll(TOKEN)) length += fields[key].length - placeholder.length;
  if (length > MAX_CONTRACT_LENGTH) return { error: 'O contrato preenchido ficou muito longo. Revise o modelo e os detalhes.' };
  return { texto: model.replace(TOKEN, (_, key) => fields[key]) };
}

async function contractContext(leadId, getLead, getProposal) {
  if (!(await getLead(leadId))) return { error: 'Solicitação não encontrada.', status: 404 };
  const [proposal, modelo] = await Promise.all([getProposal(leadId), loadModel()]);
  if (proposal?.status !== 'pronta' || !Number.isSafeInteger(proposal.revision) || proposal.revision < 1
    || !Number.isSafeInteger(proposal.precoCentavos) || proposal.precoCentavos < 1) {
    return { error: 'Salve a proposta como pronta antes de preparar o contrato.', status: 409 };
  }
  return { modelo, proposalRevision: proposal.revision, valores: defaultsFor(proposal, leadId) };
}

function sendError(res, status, error, extra = {}) {
  return res.status(status).json({ success: false, error, ...extra });
}

function writePdfText(pdf, texto) {
  for (const section of texto.split(/(?=^#{1,2} +\S)/m)) {
    const heading = section.match(/^(#{1,2}) +([^\n]+)(?:\n|$)/);
    if (heading) {
      const title = heading[1] === '#';
      pdf.font('Helvetica-Bold').fontSize(title ? 19 : 13);
      const height = pdf.heightOfString(heading[2]) + 18;
      if (pdf.y + height > pdf.page.height - pdf.page.margins.bottom) pdf.addPage();
      pdf.text(heading[2], { align: title ? 'center' : 'left' }).moveDown(0.35);
    }
    const body = (heading ? section.slice(heading[0].length) : section).trim();
    if (body) pdf.font('Helvetica').fontSize(11).text(body, { lineGap: 3 }).moveDown(0.7);
  }
}

function makePdf(texto) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 56,
      info: { Title: 'Contrato de Prestação de Serviços' }
    });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.once('end', () => resolve(Buffer.concat(chunks)));
    pdf.once('error', reject);
    writePdfText(pdf, texto);
    pdf.end();
  });
}

export function registerContractRoutes(app, { verifyAdminAuth, leadError, getLead, getProposal }) {
  const path = '/api/admin/contratos';

  app.get(`${path}/modelo`, verifyAdminAuth, async (_req, res) => {
    try {
      return res.json({ success: true, modelo: await loadModel(), inicial: STARTER_CONTRACT });
    } catch (error) {
      return leadError(res, error);
    }
  });

  app.put(`${path}/modelo`, verifyAdminAuth, async (req, res) => {
    const { texto, revision } = req.body ?? {};
    if (typeof texto !== 'string' || !Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) {
      return sendError(res, 400, 'Abra o modelo antes de salvar o texto.');
    }
    const clean = cleanText(texto);
    const invalid = validateModel(clean);
    if (invalid) return sendError(res, 400, invalid);

    try {
      const modelo = await saveModel(clean, revision);
      if (!modelo) return sendError(res, 409, 'Outra versão do modelo foi salva. Reabra o modelo antes de editar novamente.');
      return res.json({ success: true, modelo });
    } catch (error) {
      return leadError(res, error);
    }
  });

  app.get(`${path}/:leadId`, verifyAdminAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const context = await contractContext(leadId, getLead, getProposal);
      if (context.error) return sendError(res, context.status, context.error);
      return res.json({ success: true, leadId, ...context });
    } catch (error) {
      return leadError(res, error);
    }
  });

  async function prepare(req, res, format) {
    const { aceitou, proposalRevision, templateRevision, valores } = req.body ?? {};
    if (aceitou !== true) return sendError(res, 400, 'Confirme o aceite da proposta antes de preparar o contrato.');
    if (!valores || typeof valores !== 'object' || Array.isArray(valores)) {
      return sendError(res, 400, 'Informe os dados do contrato.');
    }

    try {
      const { leadId } = req.params;
      const context = await contractContext(leadId, getLead, getProposal);
      if (context.error) return sendError(res, context.status, context.error);
      const { modelo } = context;
      if (!modelo.revision) return sendError(res, 409, 'Salve o modelo de contrato antes de preencher a minuta.');
      if (proposalRevision !== context.proposalRevision || templateRevision !== modelo.revision) {
        return sendError(res, 409, 'A proposta ou o modelo foi atualizado. Reabra o contrato antes de continuar.');
      }
      const invalid = validateModel(modelo.texto);
      if (invalid) return sendError(res, 409, invalid);
      const result = buildContract(modelo.texto, context.valores, valores);
      if (result.error) return sendError(res, 400, result.error, result.campo ? { campo: result.campo } : {});
      if (format === 'preview') return res.json({ success: true, texto: result.texto });

      const pdf = await makePdf(result.texto);
      const id = leadId.replace(/[^a-z0-9_-]/gi, '');
      res.type('application/pdf');
      res.attachment(id ? `contrato-${id}.pdf` : 'contrato.pdf');
      return res.send(pdf);
    } catch (error) {
      return leadError(res, error);
    }
  }

  app.post(`${path}/:leadId/previa`, verifyAdminAuth, (req, res) => prepare(req, res, 'preview'));
  app.post(`${path}/:leadId/pdf`, verifyAdminAuth, (req, res) => prepare(req, res, 'pdf'));
}
