const GROUP_SIZES = new Set(['1 pessoa', '2 a 3 pessoas', '4 ou mais pessoas']);
const WORD_LIST = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' });

function plainText(value, min, max) {
  if (typeof value !== 'string') return '';
  const text = value.trim().replace(/\s+/gu, ' ');
  return text.length >= min && text.length <= max ? text : '';
}

function eventDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return value.split('-').reverse().join('/');
}

export function replyDrafts(lead) {
  const name = plainText(lead.nome, 1, 120).split(' ')[0];
  const protocol = typeof lead.id === 'string' && /^[a-z0-9_-]{1,128}$/i.test(lead.id) ? lead.id : '';
  const service = plainText(lead.servico, 1, 100);
  const cityText = plainText(lead.cidade, 2, 100);
  const city = /\p{L}/u.test(cityText) ? cityText : '';
  const people = GROUP_SIZES.has(lead.pessoas) ? lead.pessoas : '';
  const date = eventDate(lead.data);
  const time = typeof lead.horario === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(lead.horario) ? lead.horario : '';

  const greeting = name ? `Olá, ${name}! Aqui é a Anna Luísa.` : 'Olá! Aqui é a Anna Luísa.';
  const serviceContext = service ? ` para ${service.toLocaleLowerCase('pt-BR')}` : '';
  const request = `${greeting}\n\nRecebi seu pedido de orçamento${serviceContext}${protocol ? ` (protocolo ${protocol})` : ''}.`;
  const missing = [];
  if (!city) missing.push('a cidade do atendimento');
  if (!people) missing.push('a quantidade de pessoas');
  if (!date && /noiva|social|formatura/i.test(service)) missing.push('a data desejada');

  const details = [
    service,
    date && `Data desejada em ${date}`,
    time && `Pronta às ${time}`,
    city && `Atendimento em ${city}`,
    people
  ].filter(Boolean);

  return {
    suggested: missing.length ? 'dados' : 'retorno',
    drafts: {
      retorno: `${request} Vou verificar os detalhes do atendimento e te retorno por aqui.`,
      dados: missing.length
        ? `${request}\n\nVocê pode me informar ${WORD_LIST.format(missing)}?`
        : `${request}\n\nTem mais algum detalhe que gostaria de acrescentar ao pedido?`,
      revisar: details.length
        ? `${request}\n\nVocê pode conferir os detalhes do pedido e me avisar se quiser ajustar algo?\n\n${details.map(detail => `• ${detail}`).join('\n')}`
        : `${request} Você pode conferir os dados que enviou e me avisar se quiser ajustar algum detalhe?`
    }
  };
}

export function whatsAppLink(telefone, text) {
  const digits = String(telefone || '').replace(/\D/g, '');
  const phone = /^\d{10,11}$/.test(digits) ? `55${digits}` : digits;
  if (!/^55\d{10,11}$/.test(phone) || typeof text !== 'string' || !text.trim()) return '';
  const url = new URL(`https://wa.me/${phone}`);
  url.searchParams.set('text', text);
  return url.href;
}
