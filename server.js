import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
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

// In-memory lead storage (keeps track of recent submissions during runtime)
const leads = [];

// Healthcheck endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    service: 'Anna Luísa — Maquiadora Web Platform'
  });
});

// Lead Submission API
app.post('/api/leads', (req, res) => {
  try {
    const { nome, email, telefone, servico, detalhes, _honey } = req.body;

    // Honeypot bot protection
    if (_honey) {
      console.warn('[Leads API] Honeypot triggered, dropping submission quietly.');
      return res.status(200).json({ success: true, message: 'Solicitação recebida com sucesso.' });
    }

    // Sanitization and trimming
    const cleanNome = typeof nome === 'string' ? nome.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanTelefone = typeof telefone === 'string' ? telefone.trim() : '';
    const cleanServico = typeof servico === 'string' ? servico.trim() : 'Maquiagem Social';
    const cleanDetalhes = typeof detalhes === 'string' ? detalhes.trim() : '';

    // Basic validation
    if (!cleanNome || cleanNome.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Por favor, informe seu nome completo.'
      });
    }

    if (!cleanEmail && !cleanTelefone) {
      return res.status(400).json({
        success: false,
        error: 'Informe um e-mail ou telefone para contato.'
      });
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Por favor, informe um endereço de e-mail válido.'
      });
    }

    const leadRecord = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: new Date().toISOString(),
      nome: cleanNome,
      email: cleanEmail,
      telefone: cleanTelefone,
      servico: cleanServico,
      detalhes: cleanDetalhes,
      ip: req.ip || req.headers['x-forwarded-for'] || 'local'
    };

    leads.push(leadRecord);
    if (leads.length > 500) leads.shift(); // keep memory bounded

    console.log(`[Leads API] Novo lead cadastrado com sucesso: [${leadRecord.id}] ${cleanNome} (${cleanServico})`);

    return res.status(201).json({
      success: true,
      message: 'Sua solicitação de orçamento foi enviada com sucesso! Anna Luísa responderá em breve.',
      leadId: leadRecord.id
    });
  } catch (err) {
    console.error('[Leads API Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Ocorreu um erro interno ao processar seu pedido. Por favor, tente novamente ou contate pelo WhatsApp.'
    });
  }
});

// Admin Authentication & Lead Management
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'anna2026';

function verifyAdminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key || req.body?.key;
  if (key !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Acesso não autorizado. Chave inválida.' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, message: 'Autenticado com sucesso' });
  }
  return res.status(401).json({ success: false, error: 'Senha incorreta.' });
});

app.get('/api/admin/leads', verifyAdminAuth, (req, res) => {
  res.json({
    success: true,
    count: leads.length,
    leads: [...leads].reverse()
  });
});

app.get('/api/admin/leads/export', (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_PASSWORD) {
    return res.status(401).send('Não autorizado');
  }

  const headers = ['ID', 'Data_Hora', 'Nome', 'Telefone', 'Email', 'Servico', 'Detalhes'];
  const rows = leads.map(l => [
    l.id,
    `"${l.createdAt}"`,
    `"${(l.nome || '').replace(/"/g, '""')}"`,
    `"${(l.telefone || '').replace(/"/g, '""')}"`,
    `"${(l.email || '').replace(/"/g, '""')}"`,
    `"${(l.servico || '').replace(/"/g, '""')}"`,
    `"${(l.detalhes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=leads-annaluisa-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(csvContent);
});

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
