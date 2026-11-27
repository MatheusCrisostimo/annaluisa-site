const PAGE_SIZE = 20;
const SERVICE_ORDER = new Intl.Collator('pt-BR');
const SAO_PAULO_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
const DATE_PATTERN = /^(?!0000)\d{4}-\d{2}-\d{2}$/;

export function displayService(lead) {
  return typeof lead.servico === 'string' && lead.servico.trim() ? lead.servico.trim() : 'Geral';
}

export function queueServices(leads) {
  return [...new Set(leads.map(displayService))].sort(SERVICE_ORDER.compare);
}

function searchable(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR').replace(/\s+/gu, ' ').trim();
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function matchesPhone(lead, queryDigits) {
  if (!queryDigits) return false;
  const phone = digits(lead.telefone);
  const international = /^\d{10,11}$/.test(phone) ? `55${phone}` : phone;
  return international.includes(queryDigits);
}

function upcomingDate(value, today) {
  if (typeof value !== 'string' || value < today || !DATE_PATTERN.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function entryTime(value) {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : Infinity;
}

function sortByDate(items, order, now) {
  const today = order === 'eventos' ? SAO_PAULO_DATE.format(now) : '';
  const dated = items.map(item => ({
    item,
    event: today ? upcomingDate(item.data, today) : '',
    entry: entryTime(item.createdAt)
  }));
  dated.sort((left, right) => {
    if (left.event !== right.event) {
      if (!left.event) return 1;
      if (!right.event) return -1;
      return left.event < right.event ? -1 : 1;
    }
    return left.entry === right.entry ? 0 : left.entry - right.entry;
  });
  return dated.map(record => record.item);
}

export function queuePage(leads, { query = '', status = 'todos', service = '', order = 'fila', page = 1 } = {}, now = new Date()) {
  const term = searchable(query);
  const queryDigits = /^[+().\-\s\d]+$/u.test(term) ? digits(term) : '';
  const filtered = leads.filter(lead => {
    const leadStatus = lead.status === 'respondido' ? 'respondido' : 'pendente';
    if ((status === 'pendente' || status === 'respondido') && leadStatus !== status) return false;
    if (service && displayService(lead) !== service) return false;
    if (!term) return true;
    return [lead.nome, lead.id, lead.email].some(value => searchable(value).includes(term))
      || matchesPhone(lead, queryDigits);
  });

  const sorted = order === 'antigos' || order === 'eventos' ? sortByDate(filtered, order, now) : filtered;
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number(page);
  const current = Number.isNaN(requested) ? 1 : Math.min(pages, Math.max(1, Math.floor(requested)));
  const start = (current - 1) * PAGE_SIZE;
  return { items: sorted.slice(start, start + PAGE_SIZE), total, page: current, pages };
}
