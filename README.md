# 💄 Anna Luísa — Site Oficial & Plataforma de Atendimento

Plataforma institucional e comercial de alta conversão da maquiadora **Anna Luísa**, profissional com 13 anos de carreira em Palhoça e Grande Florianópolis (SC), com especialidade em peles pretas, noivas, formaturas, produções corporativas e cursos de automaquiagem.

O projeto foi modernizado com foco em **arquitetura limpa**, **segurança**, **estética de luxo sóbria**, **SEO local de alta relevância**, **conformidade com a LGPD** e **performance**.

---

## 🌐 Estrutura do Projeto

```text
/
├── server.js               # Servidor Node.js (Express) com rotas limpas, headers de segurança e API
├── package.json            # Configurações de scripts e dependências npm
├── metadata.json           # Metadados da aplicação AI Studio
├── .env.example            # Variáveis de ambiente
├── index.html              # Landing Page principal (Hero WebP, Serviços, Portfólio, Depoimentos, FAQ)
├── agendar.html            # Fluxo dedicado de agendamento integrado a WhatsApp e API
├── links.html              # Hub de links rápidos com design system luxo
├── links/
│   └── index.html          # Hub sincronizado para acessos diretos via /links/
├── manifest.webmanifest    # Manifesto PWA em conformidade com W3C
├── sw.js                   # Service Worker resiliente com Stale-While-Revalidate
├── robots.txt              # Regras de indexação para motores de busca
├── sitemap.xml             # Sitemap XML indexável
├── favicon.ico             # Favicon oficial
├── /images/
│   ├── hero-800.webp       # Hero otimizado para mobile (WebP)
│   ├── hero-1200.webp      # Hero otimizado para tablets e laptops (WebP)
│   ├── hero-1600.webp      # Hero otimizado para desktop 4K (WebP)
│   ├── og-cover.jpg        # Imagem oficial para OpenGraph e Twitter Cards (1200x630)
│   ├── logo.png            # Logo oficial da marca
│   └── icons/
│       ├── icon-192.png    # Ícone PWA 192x192
│       └── icon-512.png    # Ícone PWA 512x512
├── /docs/
│   ├── midia-kit.pdf       # Mídia kit corporativo
│   ├── politica-privacidade.html # Política de Privacidade (LGPD)
│   └── termos-de-uso.html  # Termos e Condições de Uso
└── /scripts/
    └── analytics.js        # Módulo ESM para GA4, Meta Pixel e tracking de conversão
```

---

## 🚀 Funcionalidades & Arquitetura

- **Design System Luxo/Sóbrio**: Paleta personalizada em preto absoluto (`#171717`), off-white (`#fcfbfa`) e toques de nude/dourado (`#dfc1a4`).
- **Hero Responsivo com `<picture>` e WebP**: Imagens comprimidas e responsivas com srcset e fallbacks progressivos.
- **API Segura de Leads (`POST /api/leads`)**:
  - Validação estrita de inputs no servidor (nome, e-mail, telefone, serviço).
  - Proteção anti-bot com campo Honeypot.
  - Armazenamento em memória com identificador único (`lead_...`).
  - Submissão assíncrona no frontend com feedback inline elegante (sem `window.alert`).
- **Deep Linking Resiliente para WhatsApp**:
  - Geração de mensagens contextuais estruturadas.
  - Fallback automático com ancoragem dinâmica para compatibilidade com bloqueadores de pop-up e contêineres iFrame.
- **PWA e Suporte Offline**:
  - Manifesto W3C válido sem comentários em JSON.
  - Service Worker resiliente com instalação `Promise.allSettled`, garantindo que eventuais falhas parciais não quebrem o cache offline.
- **SEO & Dados Estruturados**:
  - Schemas JSON-LD: `MakeupArtist`, `LocalBusiness`, `FAQPage`.
  - Tags OpenGraph e Twitter Cards completos apontando para `og-cover.jpg`.
- **Privacidade & LGPD**:
  - Banner de consentimento com suporte a Google Consent Mode v2 e armazenamento local das preferências.

---

## 🛠 Como Executar

### Pré-requisitos
- Node.js 20+ ou 22
- npm

### Instalação
```bash
npm install
```

### Desenvolvimento
```bash
npm run dev
```
A aplicação estará disponível em `http://localhost:3000`.

### Verificação de Saúde
```bash
curl http://localhost:3000/api/health
```

### Submissão de Teste na API de Leads
```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{"nome":"Teste Lead","email":"lead@example.com","telefone":"(48) 99999-9999","servico":"Noiva","detalhes":"Teste de agendamento"}'
```
