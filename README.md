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
  - Fila de consultas com protocolo, dados do evento e status pendente ou respondido.
  - Agenda com atendimentos e bloqueios. O painel verifica sobreposições incluindo o tempo de deslocamento informado.
  - Propostas por pedido com modelos de texto editáveis, valor, validade e prévia para compartilhar.
  - Botão direto para iniciar conversa no WhatsApp da cliente com mensagem pronta.
  - Exportação completa em planilha CSV compatível com Excel e Google Sheets.
  - Acesso protegido pela senha configurada em `ADMIN_PASSWORD`.
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
cp .env.example .env
node --env-file=.env server.js
```
A aplicação estará disponível em `http://localhost:3000`.

### Fila de orçamentos

Defina `ADMIN_PASSWORD` no ambiente para acessar `http://localhost:3000/admin`. Sem Redis, o modo local usa memória para testes e esvazia a fila ao reiniciar.

No projeto Vercel, conecte um banco Redis da Upstash, configure `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` e uma senha nova em `ADMIN_PASSWORD` antes de publicar. A integração também aceita `KV_REST_API_URL` e `KV_REST_API_TOKEN`. Use um banco separado para Preview e dados fictícios. Na Vercel, o formulário confirma o pedido somente depois de salvá-lo no banco.

Opcionalmente, preencha `LEAD_REPLY_TIME` com o prazo de retorno combinado com a Anna, por exemplo, `em até 1 dia útil`. A saudação do WhatsApp Business pode apontar para `https://annaluisamakeup.vercel.app/?origem=whatsapp#orcamento`.
