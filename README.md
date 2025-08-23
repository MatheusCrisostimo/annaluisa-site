# 💄 Anna Luísa — Site Oficial

Site institucional da maquiadora **Anna Luísa**, especialista em peles pretas, noivas, eventos e atendimento corporativo.  
Projeto otimizado para **UX, CX e UI**, com foco em **SEO local**, **tráfego pago** e **performance**.

---

## 🌐 Estrutura do projeto
/
├─ index.html # Página principal
├─ agendar.html # Página com Calendly (agendamento online)
├─ manifest.webmanifest # Manifest PWA (ícones + nome + cor tema)
├─ sw.js # Service Worker (cache offline básico)
├─ robots.txt # SEO: regras de indexação
├─ sitemap.xml # SEO: sitemap para Google/Bing
├─ .nojekyll # Evita processamento no GitHub Pages
├─ favicon.ico # Ícone padrão do site
├─ /images # Imagens otimizadas em WebP
│ ├─ hero-480.webp
│ ├─ hero-960.webp
│ ├─ hero-1600.webp
│ ├─ logo.png
│ ├─ corporate-01.webp ...
│ └─ icons/ # Ícones PWA
│ ├─ icon-192.png
│ ├─ icon-512.png
│ ├─ icon-maskable-192.png
│ └─ icon-maskable-512.png
├─ /docs # Documentos institucionais
│ ├─ midia-kit.pdf
│ ├─ politica-privacidade.html
│ └─ termos-de-uso.html
├─ /scripts
│ └─ analytics.js # GA4 + Meta Pixel (eventos customizados)
└─ /.github/workflows # CI/CD automações
├─ link-check.yml # Verifica links quebrados
├─ lighthouse.yml # Audita performance/acessibilidade
└─ touch-sitemap-date.yml # Atualiza <lastmod> no sitemap

---

## 🚀 Funcionalidades

- **Design responsivo** (Tailwind CSS)
- **Lightbox acessível** para portfólio
- **Vídeos do Instagram** (embed sob demanda)
- **Formulário com proteção anti-spam** (FormSubmit + honeypot)
- **CTA do WhatsApp** com tracking GA4 + Pixel
- **Atendimento corporativo** (mídia kit em PDF)
- **SEO local** (Schema.org MakeupArtist + LocalBusiness + FAQPage)
- **PWA**: instalar como app no celular
- **CI/CD**: GitHub Actions para garantir qualidade
- **LGPD**: banner de cookies + controle de consentimento

---

## 📊 Integrações de Marketing

- **Google Analytics 4**  
  Configure seu ID em `index.html` → `G-XXXXXXX`.

- **Meta Pixel**  
  Configure seu ID em `index.html` → `YOUR_PIXEL_ID`.

- Eventos rastreados:
  - cliques em WhatsApp (`whatsapp_click`)
  - envio de formulário (`lead_submit`)
  - scroll 25%
  - abertura de imagens do portfólio
  - clique em "Avaliações no Google"

---

## 🛠 Como rodar localmente

```bash
git clone https://github.com/MatheusCrisostimo/annaluisa-site.git
cd annaluisa-site
# abrir index.html no navegador
