import { randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { LeadStoreUnavailable, getLead, listLeads, saveLead, setLeadStatus } from './lead-store.js';
import { registerAgendaRoutes } from './agenda.js';
import { getProposal, registerProposalRoutes } from './proposals.js';
import { registerContractRoutes } from './contracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Parsers for JSON and URL-encoded forms
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));


// Healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    service: 'Anna Luísa — Maquiadora Web Platform'
  });
});

const ORIGENS = ['site', 'simulador', 'agendar', 'whatsapp'];
const SERVICOS = ['Maquiagem Social', 'Noiva', 'Aula de Automaquiagem', 'Soluções Corporativas'];
const GRUPOS = ['1 pessoa', '2 a 3 pessoas', '4 ou mais pessoas'];
const LOCAIS = ['A Domicílio (Sua Residência)', 'Hotel / Espaço do Evento', 'A definir'];
const ITENS_NOIVA = ['Maquiagem', 'Penteado', 'Prévia', 'Acompanhamento'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validDate(value) {
  const parsed = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

function leadError(res, error) {
  if (error instanceof LeadStoreUnavailable) {
    console.error('[Orçamentos]', error.message);
    return res.status(503).json({
      success: false,
      error: 'Não foi possível acessar a fila de orçamentos. Tente novamente em instantes.'
    });
  }

  console.error('[Orçamentos] Erro ao processar a operação.');
  return res.status(500).json({ success: false, error: 'Ocorreu um erro. Tente novamente.' });
}

app.post('/api/leads', async (req, res) => {
  const body = req.body ?? {};
  if (body._honey) {
    return res.status(400).json({ success: false, error: 'Não foi possível processar a solicitação.' });
  }

  const nome = clean(body.nome);
  const email = clean(body.email);
  const telefone = clean(body.telefone);
  const servico = clean(body.servico) || 'Maquiagem Social';
  const detalhes = clean(body.detalhes);
  const origem = clean(body.origem);
  const data = clean(body.data);
  const horario = clean(body.horario);
  const cidade = clean(body.cidade);
  const pessoas = clean(body.pessoas);
  const tipoLocal = clean(body.tipoLocal);
  const itensNoiva = Array.isArray(body.itensNoiva) && servico === 'Noiva'
    ? ITENS_NOIVA.filter(item => body.itensNoiva.includes(item))
    : [];
  const autorizouWhatsApp = ['sim', 'on'].includes(body.autorizaWhatsApp);
  const submissionId = clean(body.submissionId);
  const invalid = error => res.status(400).json({ success: false, error });

  if (nome.length < 2 || nome.length > 120) return invalid('Informe seu nome completo.');
  if (!email && !telefone) return invalid('Informe um e-mail ou telefone para contato.');
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return invalid('Informe um endereço de e-mail válido.');
  }
  if (telefone.length > 30 || detalhes.length > 2000 || servico.length > 100) {
    return invalid('Revise o telefone, o serviço e os detalhes da solicitação.');
  }
  if (submissionId && !UUID.test(submissionId)) return invalid('Recarregue a página e tente novamente.');

  // Keep accepting submissions from older pages still open or cached.
  if (origem) {
    const normalizedService = servico === 'Empresas / Corporativo' ? 'Soluções Corporativas' : servico;
    if (!ORIGENS.includes(origem) || !SERVICOS.includes(normalizedService)) {
      return invalid('Selecione um serviço válido.');
    }
    if (!/^[1-9]\d{9,10}$/.test(telefone.replace(/\D/g, ''))) {
      return invalid('Informe um número de WhatsApp com DDD.');
    }
    if (!autorizouWhatsApp) return invalid('Autorize o retorno sobre este pedido pelo WhatsApp.');
    if ((!data && ['Noiva', 'Maquiagem Social'].includes(servico)) || (data && !validDate(data))) {
      return invalid('Informe uma data válida para o evento.');
    }
    if (horario && !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) {
      return invalid('Informe um horário válido.');
    }
    if (cidade.length < 2 || cidade.length > 100) return invalid('Informe a cidade do atendimento.');
    if (!GRUPOS.includes(pessoas)) return invalid('Selecione a quantidade de pessoas.');
    if (tipoLocal && !LOCAIS.includes(tipoLocal)) return invalid('Selecione um tipo de local válido.');
  }

  const protocol = `AL-${Buffer.from((submissionId || randomUUID()).replaceAll('-', ''), 'hex').toString('base64url')}`;
  const lead = {
    id: protocol,
    createdAt: new Date().toISOString(),
    nome, email, telefone, servico, detalhes,
    origem: origem || 'site',
    data, horario, cidade, pessoas, tipoLocal, itensNoiva,
    autorizaWhatsApp: origem ? autorizouWhatsApp : null
  };

  try {
    const created = await saveLead(lead);
    return res.status(created ? 201 : 200).json({
      success: true,
      message: 'Sua solicitação de orçamento foi recebida.',
      leadId: protocol,
      prazoRetorno: clean(process.env.LEAD_REPLY_TIME)
    });
  } catch (error) {
    return leadError(res, error);
  }
});

app.use('/api/admin', (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

function authorized(key) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || typeof key !== 'string') return false;
  const received = Buffer.from(key);
  const expected = Buffer.from(password);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function verifyAdminAuth(req, res, next) {
  if (!authorized(req.get('x-admin-key'))) {
    return res.status(401).json({ success: false, error: 'Acesso não autorizado.' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (authorized(req.body?.password)) {
    return res.json({ success: true, message: 'Autenticado com sucesso.' });
  }
  return res.status(401).json({ success: false, error: 'Senha incorreta.' });
});

async function orderedLeads() {
  const entries = await listLeads();
  return entries.sort((first, second) => {
    if (first.status !== second.status) return first.status === 'pendente' ? -1 : 1;
    if (first.status === 'respondido') {
      return (second.respondidoEm || second.createdAt).localeCompare(first.respondidoEm || first.createdAt);
    }
    return first.createdAt.localeCompare(second.createdAt);
  });
}

app.get('/api/admin/leads', verifyAdminAuth, async (req, res) => {
  try {
    const leads = await orderedLeads();
    return res.json({ success: true, count: leads.length, leads });
  } catch (error) {
    return leadError(res, error);
  }
});

app.patch('/api/admin/leads/:id', verifyAdminAuth, async (req, res) => {
  const status = req.body?.status;
  if (status !== 'respondido' && status !== 'pendente') {
    return res.status(400).json({ success: false, error: 'Situação inválida.' });
  }

  try {
    const updated = await setLeadStatus(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
    }
    return res.json({ success: true, ...updated });
  } catch (error) {
    return leadError(res, error);
  }
});

function csvCell(value) {
  const text = String(value ?? '');
  const cell = /^\s*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${cell.replaceAll('"', '""')}"`;
}

app.get('/api/admin/leads/export', verifyAdminAuth, async (req, res) => {
  try {
    const leads = await orderedLeads();
    const headers = [
      'ID', 'Data_Hora', 'Nome', 'Telefone', 'Email', 'Servico', 'Detalhes', 'Data_Evento',
      'Hora_Evento', 'Cidade', 'Pessoas', 'Tipo_Local', 'Itens_Noiva', 'Origem', 'Status',
      'Respondido_Em', 'Autoriza_WhatsApp'
    ];
    const rows = leads.map(lead => [
      lead.id, lead.createdAt, lead.nome, lead.telefone, lead.email, lead.servico, lead.detalhes,
      lead.data, lead.horario, lead.cidade, lead.pessoas, lead.tipoLocal,
      Array.isArray(lead.itensNoiva) ? lead.itensNoiva.join(', ') : '',
      lead.origem, lead.status, lead.respondidoEm,
      lead.autorizaWhatsApp === true ? 'Sim' : ''
    ].map(csvCell).join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=leads-annaluisa-${new Date().toISOString().slice(0, 10)}.csv`);
    return res.send(csvContent);
  } catch (error) {
    return leadError(res, error);
  }
});

const adminRoutes = { verifyAdminAuth, leadError, getLead };
registerAgendaRoutes(app, adminRoutes);
registerProposalRoutes(app, adminRoutes);
registerContractRoutes(app, { ...adminRoutes, getProposal });

// Admin Panel Clean Routes
app.get(['/admin', '/admin/leads'], (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve static files with html extension fallback
app.use(express.static(__dirname, {
  extensions: ['html', 'htm']
}));

// Route helpers for clean URLs
app.get('/links', (req, res) => {
  res.sendFile(path.join(__dirname, 'links', 'index.html'));
});

app.get('/agendar', (req, res) => {
  res.sendFile(path.join(__dirname, 'agendar.html'));
});

app.get('/midia-kit', (req, res) => {
  res.sendFile(path.join(__dirname, 'midia-kit.html'));
});

// Single Page fallback for extensionless routes
app.get('*', (req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).send('Not Found');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server only when directly run (e.g. node server.js) and not in serverless (Vercel)
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('server.js') ||
  process.argv[1].endsWith('server.ts')
);

if (isDirectRun && !process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}

export default app;
