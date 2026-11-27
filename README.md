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
  - Contratos vinculados a propostas prontas com aceite confirmado no painel, modelo privado editável, prévia e PDF.
  - Acompanhamento por pedido do envio e da assinatura do contrato, do sinal e do saldo, com rascunhos de lembrete.
  - Diagnóstico do webhook e da primeira resposta automática do WhatsApp.
  - Indicadores por período com origem dos pedidos, dados do evento, tempo até o retorno e andamento comercial.
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

Em **Pedidos**, busque por nome, protocolo, e-mail ou telefone e filtre por situação e serviço. A ordem **Eventos mais próximos** prioriza as datas de hoje em diante, no fuso de São Paulo. Os pedidos com data anterior ou sem data ficam depois, em ordem de recebimento. Use **Pendentes** junto com essa ordem para organizar os retornos. A exportação CSV inclui a fila completa.

Depois de enviar um pedido pelos formulários do site, a cliente pode abrir **Acompanhar pedido** e guardar o link pessoal. A página exibe **Pedido recebido** ou **Resposta registrada**, conforme a situação da fila administrativa. A confirmação de reserva continua no atendimento da Anna. A consulta usa uma chave independente do protocolo. Apenas a verificação dessa chave fica no Redis. Os pedidos anteriores à implantação seguem disponíveis na fila.

### Preparar um contrato

Em **Contratos**, carregue a estrutura inicial ou cole o texto revisado da sua minuta. Use os campos de preenchimento indicados no painel para que o modelo fique reutilizável. Salve o modelo no ambiente em que será usado. Ele é privado e usa o Redis já conectado ao projeto.

Abra a proposta pronta ou o pedido correspondente e escolha a ação de contrato. Confirme o aceite, preencha os campos da minuta, revise a prévia e baixe o PDF. Os dados preenchidos nessa etapa e o PDF ficam fora da fila e não são gravados no Redis. Guarde o arquivo baixado.

Depois de preparar o contrato, abra **Acompanhamento** pelo pedido ou pelo contrato. Registre a situação da assinatura, os vencimentos e o total já recebido, incluindo o sinal. Se a negociação não tiver sinal separado, informe zero no campo do sinal. Os lembretes podem ser revisados no painel e enviados manualmente pelo WhatsApp.

### Configurar a triagem do WhatsApp

1. Use um número de teste da Meta para simular o primeiro contato. Para o número da Anna, confirme que a equipe consegue continuar a conversa recebida no WhatsApp Business com Coexistência, quando elegível, ou na caixa de entrada do provedor.
2. Configure `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` nas variáveis privadas do ambiente escolhido. Mantenha `WHATSAPP_AUTOREPLY_ENABLED=false` ao verificar o webhook. Configure na Meta o campo `messages` e uma URL acessível pela Meta terminada em `/api/whatsapp/webhook`. Para produção, use `https://annaluisamakeup.vercel.app/api/whatsapp/webhook`. Prévias protegidas pelo login da Vercel não recebem chamadas da Meta diretamente.
3. Depois de confirmar a data do último evento no painel em **WhatsApp**, configure `WHATSAPP_ACCESS_TOKEN` com a permissão `whatsapp_business_messaging` e `WHATSAPP_API_VERSION` com a versão suportada no seu app da Meta, no formato `v27.0`. No ambiente de teste, habilite a saudação e use outro telefone de destinatário cadastrado para simular um primeiro contato.
4. Para ativar, defina `WHATSAPP_AUTOREPLY_ENABLED=true` e faça um redeploy. A triagem responde ao primeiro texto após 14 dias sem contato e oferece o formulário de consulta. Ela reconhece protocolos, pedidos de atendimento humano e comandos de descadastramento. Consulte na aba **WhatsApp** o retorno da API.

A integração reaproveita o Redis. Os registros da triagem usam identificadores protegidos e datas de atividade. O painel apresenta os horários do webhook e o retorno da API.

[Webhooks do WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview) · [Onboarding com Coexistência](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) · [Tokens da Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens)

### Indicadores

O período usa a data de entrada de cada pedido no fuso de São Paulo. As etapas mostram a situação atual desses pedidos. Cada pedido com um ou mais atendimentos confirmados conta uma vez nesse indicador.

O tempo de retorno usa a primeira vez que o pedido foi marcado como respondido. Respostas antigas entram na mediana quando o registro ainda tem a data de retorno. Os indicadores de agenda, propostas e contratos acompanham os registros do painel.

Em **Pedidos por campanha**, compare os pedidos recebidos, a completude dos dados do evento e as etapas comerciais de cada combinação de `utm_source`, `utm_medium` e `utm_campaign`. A taxa de confirmação divide os pedidos com atendimento confirmado pelo total de pedidos da campanha no período. A linha **Sem UTMs** reúne os pedidos sem atribuição registrada.

Para acompanhar custos, aplique as mesmas datas do relatório de anúncios e use **Informar valor** na linha da campanha. Se ela ainda não tiver pedidos, use **Registrar investimento** com as UTMs do anúncio. Informe o gasto total em reais. O valor fica salvo para a combinação de UTMs e o intervalo exato, e pode ser editado depois. O painel divide o gasto pelos pedidos atribuídos e pelos pedidos com atendimento confirmado daquela campanha. Quando ainda não houver pedidos ou confirmações, o custo correspondente aparece como `—`.

Os valores financeiros por campanha vêm de **Acompanhamento**. O **Total recebido** inclui o sinal e os demais pagamentos informados, inclusive antes da assinatura. O valor contratado e o saldo a receber consideram contratos marcados como assinados. O filtro seleciona os pedidos pela data em que chegaram. Os valores refletem os registros atuais desses pedidos, inclusive quando um pagamento foi registrado depois do período. Com investimento maior que zero para as mesmas UTMs e datas, o painel também mostra o valor recebido por real investido.

### Página de noivas e conversões

A rota `/noivas` leva ao formulário com o serviço **Noiva** selecionado. Para atribuir uma campanha, use `utm_source`, `utm_medium` e `utm_campaign` na URL da campanha. Após a autorização de métricas, a campanha acompanha o pedido na mesma aba de navegação e aparece na fila e no CSV.

Valide no GA4 o evento `generate_lead` de um pedido salvo antes de importá-lo como conversão principal no Google Ads. `whatsapp_click` indica a abertura do canal e pode ser usado como ação secundária. As tags habilitadas carregam no domínio público após autorização de métricas.
