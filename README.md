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
├── index.html              # Landing Page principal (Hero WebP, Sobre, Serviços, Kit, Portfólio, Depoimentos, FAQ)
├── agendar.html            # Fluxo dedicado de agendamento integrado a WhatsApp e API
├── admin.html              # Painel Administrativo de Gestão de Leads com exportação CSV
├── links.html              # Hub de links rápidos com design system luxo
├── links/
│   └── index.html          # Hub sincronizado para acessos diretos via /links/
├── manifest.webmanifest    # Manifesto PWA em conformidade com W3C
├── sw.js                   # Service Worker resiliente com Stale-While-Revalidate
├── robots.txt              # Regras de indexação para motores de busca
├── sitemap.xml             # Sitemap XML indexável
├── favicon.ico             # Favicon oficial
├── /images/
│   ├── anna-luisa-perfil.webp # Foto profissional da artista (37KB WebP)
│   ├── hero-800.webp       # Hero otimizado para mobile (WebP)
│   ├── hero-1200.webp      # Hero otimizado para tablets e laptops (WebP)
│   ├── hero-1600.webp      # Hero otimizado para desktop 4K (WebP)
│   ├── portfolio/          # Galeria convertida em WebP (93% mais leve)
│   │   ├── portfolio-01.webp ... portfolio-08.webp
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
- **Seção "Conheça a Artista"**: Foto de alta resolução e biografia ressaltando os 13 anos de experiência e a maestria em peles pretas sem acinzentar.
- **Diferenciais de Atendimento & Kit**: Marcas internacionais de prestígio (MAC, NARS, Fenty Beauty, Laura Mercier, Kryolan), biossegurança rigorosa e visagismo.
- **Badge de Avaliação Google Maps 5.0**: Prova social de nota máxima visível no topo dos depoimentos.
- **Portfólio com Filtros Dinâmicos**: Navegação ágil por categorias (*Todos, Noivas, Pele Negra, Social, Editorial*) com imagens em WebP ultraleves.
- **Header Responsivo & Menu Mobile**: Navegação completa em desktop e menu drawer moderno em celulares e tablets.
- **Painel Administrativo de Leads (`/admin`)**:
  - Consulta de orçamentos e agendamentos recebidos.
  - Botão direto para iniciar conversa no WhatsApp da cliente com mensagem pronta.
  - Exportação completa em planilha CSV compatível com Excel e Google Sheets.
  - Acesso protegido por senha (padrão: `anna2026`, configurável via variável de ambiente `ADMIN_PASSWORD`).
- **API Segura de Leads (`POST /api/leads`)**:
  - Validação estrita de inputs no servidor (nome, e-mail, telefone, serviço).
  - Proteção anti-bot com campo Honeypot.
  - Submissão assíncrona no frontend com feedback inline elegante (sem `window.alert`).
- **Deep Linking Resiliente para WhatsApp**:
  - Geração de mensagens contextuais estruturadas com fallbacks dinâmicos.
- **PWA e Suporte Offline**:
  - Manifesto W3C e Service Worker resiliente com Stale-While-Revalidate.

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

### Painel Administrativo
Acesse `http://localhost:3000/admin` e utilize a senha:
```text
anna2026
```
*(Para alterar a senha em produção, defina a variável `ADMIN_PASSWORD` no ambiente)*.
