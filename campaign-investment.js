import { runRedis, useLocalMemory } from './lead-store.js';

const INVESTMENT_KEY_PREFIX = 'annaluisa:investimento-campanha:v1';
const localInvestments = new Map();

export const CAMPAIGN_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign'];

export function campaignKey(campaign) {
  return JSON.stringify(CAMPAIGN_FIELDS.map(field => campaign?.[field] ?? null));
}

function periodKey({ de, ate }) {
  return `${INVESTMENT_KEY_PREFIX}:${de}:${ate}`;
}

export async function listCampaignInvestments(period) {
  const key = periodKey(period);
  if (useLocalMemory()) return [...(localInvestments.get(key)?.values() ?? [])];
  const records = await runRedis('HVALS', key);
  return records.map(record => JSON.parse(record));
}

export async function saveCampaignInvestment(period, campaign, investimentoCentavos) {
  const key = periodKey(period);
  const field = campaignKey(campaign);

  if (useLocalMemory()) {
    const records = localInvestments.get(key) ?? new Map();
    if (investimentoCentavos === null) {
      records.delete(field);
      if (!records.size) localInvestments.delete(key);
      return;
    }
    records.set(field, { ...campaign, investimentoCentavos });
    localInvestments.set(key, records);
    return;
  }

  if (investimentoCentavos === null) {
    await runRedis('HDEL', key, field);
  } else {
    await runRedis('HSET', key, field, JSON.stringify({ ...campaign, investimentoCentavos }));
  }
}
