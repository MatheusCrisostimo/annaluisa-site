const LEADS_KEY = 'annaluisa:orcamentos:v1';
const STATUS_KEY = `${LEADS_KEY}:status`;

const localLeads = new Map();
const localStatus = new Map();

export class LeadStoreUnavailable extends Error {}

export async function runRedis(...command) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new LeadStoreUnavailable('Configure o armazenamento de orçamentos.');
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(5000)
    });
    const { result, error } = await response.json();
    if (!response.ok || error || result === undefined) throw new Error('Falha no armazenamento');
    return result;
  } catch {
    throw new LeadStoreUnavailable('O armazenamento de orçamentos está indisponível.');
  }
}

export function useLocalMemory() {
  return !process.env.VERCEL && process.env.NODE_ENV !== 'production'
    && !process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL;
}

export async function saveLead(lead) {
  if (useLocalMemory()) {
    if (localLeads.has(lead.id)) return false;
    localLeads.set(lead.id, lead);
    return true;
  }

  return (await runRedis('HSETNX', LEADS_KEY, lead.id, JSON.stringify(lead))) === 1;
}

export async function getLead(id) {
  if (useLocalMemory()) return localLeads.get(id) ?? null;
  const record = await runRedis('HGET', LEADS_KEY, id);
  return record ? JSON.parse(record) : null;
}

export async function getLeadStatus(id) {
  if (useLocalMemory()) return localStatus.get(id) ?? null;
  const record = await runRedis('HGET', STATUS_KEY, id);
  return record ? JSON.parse(record) : null;
}

export async function listLeads() {
  const local = useLocalMemory();
  const [records, entries] = local
    ? [[...localLeads.values()], [...localStatus.entries()]]
    : await Promise.all([
      runRedis('HVALS', LEADS_KEY).then(result => result.map(record => JSON.parse(record))),
      runRedis('HGETALL', STATUS_KEY).then(result => {
        const entries = [];
        for (let index = 0; index < result.length; index += 2) {
          entries.push([result[index], JSON.parse(result[index + 1])]);
        }
        return entries;
      })
    ]);

  const statuses = new Map(entries);
  return records.map(({ acompanhamentoHash, ...lead }) => ({
    status: 'pendente',
    ...lead,
    ...statuses.get(lead.id)
  }));
}

export async function setLeadStatus(id, status) {
  const update = {
    status,
    respondidoEm: status === 'respondido' ? new Date().toISOString() : null
  };

  if (useLocalMemory()) {
    if (!localLeads.has(id)) return null;
    const current = localStatus.get(id);
    if (current?.status === status) return current;
    update.primeiroRespondidoEm = current?.primeiroRespondidoEm || current?.respondidoEm || update.respondidoEm;
    localStatus.set(id, update);
    return update;
  }

  // Preserve the first response even if the request returns to the queue.
  const script = `
    if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return false end
    local raw = redis.call('HGET', KEYS[2], ARGV[1])
    local current = raw and cjson.decode(raw) or {}
    if current.status == ARGV[2] then return raw end
    local update = cjson.decode(ARGV[3])
    local firstAt = current.primeiroRespondidoEm
    if type(firstAt) ~= 'string' then firstAt = current.respondidoEm end
    if type(firstAt) ~= 'string' then firstAt = update.respondidoEm end
    update.primeiroRespondidoEm = firstAt
    local saved = cjson.encode(update)
    redis.call('HSET', KEYS[2], ARGV[1], saved)
    return saved
  `;
  const result = await runRedis('EVAL', script, 2, LEADS_KEY, STATUS_KEY, id, status, JSON.stringify(update));
  return result ? JSON.parse(result) : null;
}
