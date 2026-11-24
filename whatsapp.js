import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { runRedis, useLocalMemory } from './lead-store.js';
import { WHATSAPP_GREETING, WHATSAPP_WEBHOOK_PATH } from './scripts/whatsapp-config.js';

const DAY = 24 * 60 * 60;
const QUIET_PERIOD = 14 * DAY;
const EVENT_TTL = 8 * DAY;
const MAX_MESSAGE_AGE = 23 * 60 * 60;
const MAX_OPT_OUT_AGE = 7 * DAY;
const MAX_FUTURE_SKEW = 5 * 60;
const OPT_OUT = new Set(['PARAR', 'SAIR', 'STOP', 'CANCELAR MENSAGENS']);
const HANDOFF = /^(?:ATENDIMENTO(?: HUMANO)?|HUMANO|(?:(?:QUERO|GOSTARIA DE) )?FALAR COM (?:A ANNA|UMA ATENDENTE|UM ATENDENTE))$/;
const PROTOCOL = /\bAL-[a-z0-9_-]{22}(?![a-z0-9_-])/i;
const PHONE = /^[1-9]\d{6,14}$/;

const localContacts = new Map();
const localEvents = new Map();
const localDiagnostics = new Map();
const rawBody = express.raw({ type: 'application/json', limit: '3mb', inflate: false });

const SET_DIAGNOSTIC = `
  local previous = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
  if tonumber(ARGV[2]) >= previous then
    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
    if ARGV[3] ~= '' then redis.call('HSET', KEYS[1], 'lastReplyStatus', ARGV[3]) end
  end
  return 1
`;

const CLAIM_BATCH = `
  local batch = cjson.decode(ARGV[1])
  local idle, dedupTtl, contactTtl = tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
  local replyEnabled = ARGV[5] == '1'
  local eventAt = tonumber(ARGV[6])
  local replies = {}

  for index, group in ipairs(batch) do
    local key = KEYS[group[1]]
    local existing = redis.call('GET', key)
    local state = { last = 0, stopped = false, choiceAt = 0 }
    if existing then state = cjson.decode(existing) end
    local previous = state.last
    local firstTime, suppressed
    for _, inbound in ipairs(group[2]) do
      if redis.call('SET', KEYS[inbound[1]], '1', 'NX', 'EX', dedupTtl) then
        local time, action = inbound[2], inbound[3]
        if not firstTime then firstTime = time end
        if action ~= 'text' then suppressed = true end
        if action == 'stop' or action == 'start' then
          if time > state.choiceAt or (time == state.choiceAt and action == 'stop') then
            state.stopped = action == 'stop'
            state.choiceAt = time
          end
        end
        state.last = math.max(state.last, time)
      end
    end
    if firstTime then
      if state.stopped then
        redis.call('SET', key, cjson.encode(state))
      else
        redis.call('SET', key, cjson.encode(state), 'EX', contactTtl)
      end
      if replyEnabled and not state.stopped and not suppressed and firstTime - previous >= idle then
        table.insert(replies, index)
      end
    end
  end

  local previousEventAt = tonumber(redis.call('HGET', KEYS[1], 'lastEventAt') or '0')
  if eventAt >= previousEventAt then redis.call('HSET', KEYS[1], 'lastEventAt', ARGV[6]) end
  return replies
`;

function configFromEnv() {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || '';
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || '';
  const rawPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '';
  const phoneId = /^[1-9]\d{0,29}$/.test(rawPhoneId) ? rawPhoneId : '';
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || '';
  const rawVersion = process.env.WHATSAPP_API_VERSION?.trim() || '';
  const apiVersion = /^v[1-9]\d*\.\d+$/.test(rawVersion) ? rawVersion : '';
  const requested = process.env.WHATSAPP_AUTOREPLY_ENABLED === 'true';
  const missingWebhook = Object.entries({
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: verifyToken,
    WHATSAPP_APP_SECRET: appSecret,
    WHATSAPP_PHONE_NUMBER_ID: phoneId
  }).filter(([, value]) => !value).map(([key]) => key);
  const missingReply = Object.entries({
    WHATSAPP_ACCESS_TOKEN: accessToken,
    WHATSAPP_API_VERSION: apiVersion
  }).filter(([, value]) => !value).map(([key]) => key);
  const enabled = requested && missingWebhook.length === 0 && missingReply.length === 0;
  const stage = process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'local');
  const scope = stage.replace(/[^a-z0-9_-]/gi, '_');
  const phoneScope = createHash('sha256').update(phoneId).digest('hex').slice(0, 24);
  const prefix = `annaluisa:whatsapp:v1:{${scope}:${phoneScope}}`;
  return { verifyToken, appSecret, phoneId, accessToken, apiVersion, requested, enabled, missingWebhook, missingReply, prefix };
}

function sameValue(left, right) {
  if (typeof left !== 'string' || !left || !right) return false;
  const provided = Buffer.from(left);
  const expected = Buffer.from(right);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function validSignature(body, header, appSecret) {
  if (typeof header !== 'string' || !/^sha256=[0-9a-f]{64}$/i.test(header)) return false;
  const provided = Buffer.from(header.slice(7), 'hex');
  const expected = createHmac('sha256', appSecret).update(body).digest();
  return timingSafeEqual(provided, expected);
}

function digest(config, purpose, value) {
  return createHmac('sha256', config.appSecret).update(`${purpose}:${value}`).digest('hex');
}

function actionFor(message) {
  if (message.type !== 'text' || typeof message.text?.body !== 'string') return 'other';
  const body = message.text.body.trim();
  const command = body.toLocaleUpperCase('pt-BR').replace(/\s+/g, ' ').replace(/[!?.]+$/, '').trimEnd();
  if (OPT_OUT.has(command)) return 'stop';
  if (command === 'INICIAR') return 'start';
  if (!body || HANDOFF.test(command) || PROTOCOL.test(body)) return 'other';
  return 'text';
}

function webhookGroups(payload, config, now) {
  const groups = new Map();
  let matched = false;
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return { matched, groups: [] };
  }

  for (const entry of payload.entry) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      const value = change?.value;
      if (change?.field !== 'messages' || value?.metadata?.phone_number_id !== config.phoneId) continue;
      if (value.messaging_product && value.messaging_product !== 'whatsapp') continue;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      if (messages.length || (Array.isArray(value.statuses) && value.statuses.length)) matched = true;
      const businessNumber = typeof value.metadata.display_phone_number === 'string'
        ? value.metadata.display_phone_number.replace(/\D/g, '') : '';
      for (const message of messages) {
        const from = message?.from;
        if (typeof from !== 'string' || !PHONE.test(from) || from === businessNumber) continue;
        if (typeof message.id !== 'string' || !message.id || typeof message.type !== 'string' || !message.type) continue;
        if (!['number', 'string'].includes(typeof message.timestamp) || !/^\d{1,15}$/.test(String(message.timestamp))) continue;
        const timestamp = Number(message.timestamp);
        const action = actionFor(message);
        const maxAge = action === 'stop' ? MAX_OPT_OUT_AGE : MAX_MESSAGE_AGE;
        if (timestamp < now - maxAge || timestamp > now + MAX_FUTURE_SKEW) continue;
        let group = groups.get(from);
        if (!group) {
          group = { from, key: `${config.prefix}:contact:${digest(config, 'contact', from)}`, events: [] };
          groups.set(from, group);
        }
        const key = `${config.prefix}:event:${digest(config, 'event', message.id)}`;
        group.events.push({ key, timestamp, action });
      }
    }
  }

  for (const group of groups.values()) group.events.sort((first, second) => first.timestamp - second.timestamp);
  return { matched, groups: [...groups.values()] };
}

function rememberLocal(key, field, time, status = '') {
  const current = localDiagnostics.get(key) ?? {};
  if (time >= (current[field] ?? 0)) {
    current[field] = time;
    if (status) current.lastReplyStatus = status;
    localDiagnostics.set(key, current);
  }
}

async function remember(config, field, time, status = '') {
  const key = `${config.prefix}:diagnostics`;
  if (useLocalMemory()) {
    rememberLocal(key, field, time, status);
    return;
  }
  await runRedis('EVAL', SET_DIAGNOSTIC, 1, key, field, time, status);
}

function claimLocal(diagnosticsKey, groups, enabled, eventAt) {
  const now = Math.floor(eventAt / 1000);
  const contactTtl = QUIET_PERIOD + MAX_FUTURE_SKEW;
  const replies = [];
  for (const [key, expiry] of localEvents) if (expiry <= now) localEvents.delete(key);
  for (const [key, state] of localContacts) if (!state.stopped && state.expires <= now) localContacts.delete(key);

  for (const group of groups) {
    const state = localContacts.get(group.key) ?? { last: 0, stopped: false, choiceAt: 0 };
    const previous = state.last;
    let firstTime = null;
    let suppressed = false;
    for (const event of group.events) {
      if (localEvents.has(event.key)) continue;
      localEvents.set(event.key, now + EVENT_TTL);
      firstTime ??= event.timestamp;
      if (event.action !== 'text') suppressed = true;
      if (event.action === 'stop' || event.action === 'start') {
        if (event.timestamp > state.choiceAt || (event.timestamp === state.choiceAt && event.action === 'stop')) {
          state.stopped = event.action === 'stop';
          state.choiceAt = event.timestamp;
        }
      }
      state.last = Math.max(state.last, event.timestamp);
    }
    if (firstTime === null) continue;
    state.expires = now + contactTtl;
    localContacts.set(group.key, state);
    if (enabled && !state.stopped && !suppressed && firstTime - previous >= QUIET_PERIOD) replies.push(group.from);
  }
  rememberLocal(diagnosticsKey, 'lastEventAt', eventAt);
  return replies;
}

async function claimReplies(config, groups, eventAt) {
  const diagnosticsKey = `${config.prefix}:diagnostics`;
  if (useLocalMemory()) return claimLocal(diagnosticsKey, groups, config.enabled, eventAt);
  const keys = [diagnosticsKey];
  const batch = groups.map(group => {
    const groupIndex = keys.push(group.key);
    const events = group.events.map(event => [keys.push(event.key), event.timestamp, event.action]);
    return [groupIndex, events];
  });
  const indices = await runRedis(
    'EVAL', CLAIM_BATCH, keys.length, ...keys, JSON.stringify(batch), QUIET_PERIOD, EVENT_TTL,
    QUIET_PERIOD + MAX_FUTURE_SKEW, config.enabled ? '1' : '0', eventAt
  );
  return indices.map(index => groups[index - 1].from);
}

async function sendReply(config, from) {
  try {
    const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: from,
        type: 'text',
        text: { body: WHATSAPP_GREETING }
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return 'failed';
    const data = await response.json();
    return typeof data.messages?.[0]?.id === 'string' && data.messages[0].id.trim() ? 'accepted' : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function readDiagnostics(config) {
  const key = `${config.prefix}:diagnostics`;
  if (useLocalMemory()) return localDiagnostics.get(key) ?? {};
  const fields = await runRedis('HGETALL', key);
  const values = {};
  for (let index = 0; index < fields.length; index += 2) values[fields[index]] = fields[index + 1];
  return values;
}

function asIso(time) {
  const value = Number(time);
  if (!Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function registerWhatsAppWebhook(app) {
  app.get(WHATSAPP_WEBHOOK_PATH, async (req, res) => {
    const config = configFromEnv();
    const { 'hub.mode': mode, 'hub.verify_token': verifyToken, 'hub.challenge': challenge } = req.query;
    res.set('Cache-Control', 'no-store');
    if (mode !== 'subscribe' || !sameValue(verifyToken, config.verifyToken) || typeof challenge !== 'string' || !challenge) {
      return res.sendStatus(403);
    }
    await remember(config, 'lastVerifiedAt', Date.now()).catch(() => {});
    return res.type('text/plain').send(challenge);
  });

  app.post(WHATSAPP_WEBHOOK_PATH, (req, res, next) => {
    rawBody(req, res, error => {
      if (error) return res.sendStatus(error.status || 400);
      return next();
    });
  }, async (req, res) => {
    const config = configFromEnv();
    if (!config.appSecret || !config.phoneId) return res.sendStatus(503);
    if (!Buffer.isBuffer(req.body)) return res.sendStatus(415);
    if (!validSignature(req.body, req.get('x-hub-signature-256'), config.appSecret)) return res.sendStatus(401);

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.sendStatus(400);
    }
    const eventAt = Date.now();
    const { matched, groups } = webhookGroups(payload, config, Math.floor(eventAt / 1000));
    if (!matched) return res.sendStatus(200);

    let recipients;
    try {
      recipients = await claimReplies(config, groups, eventAt);
    } catch {
      // An unclaimed message can safely be retried. A completed claim still prevents duplicates.
      return res.sendStatus(config.enabled ? 503 : 200);
    }
    let latestReply;
    await Promise.all(recipients.map(async recipient => {
      const status = await sendReply(config, recipient);
      latestReply = { time: Date.now(), status };
    }));
    if (latestReply) await remember(config, 'lastReplyAt', latestReply.time, latestReply.status).catch(() => {});
    return res.sendStatus(200);
  });
}

export function registerWhatsAppAdmin(app, { verifyAdminAuth, leadError }) {
  app.get('/api/admin/whatsapp', verifyAdminAuth, async (_req, res) => {
    const config = configFromEnv();
    try {
      const status = await readDiagnostics(config);
      return res.json({
        success: true,
        config: {
          requested: config.requested,
          enabled: config.enabled,
          missingWebhook: config.missingWebhook,
          missingReply: config.missingReply
        },
        webhook: {
          lastVerifiedAt: asIso(status.lastVerifiedAt),
          lastEventAt: asIso(status.lastEventAt),
          lastReplyAt: asIso(status.lastReplyAt),
          lastReplyStatus: ['accepted', 'failed', 'unknown'].includes(status.lastReplyStatus) ? status.lastReplyStatus : null
        }
      });
    } catch (error) {
      return leadError(res, error);
    }
  });
}
