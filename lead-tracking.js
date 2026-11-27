import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { getLead, getLeadStatus } from './lead-store.js';

const PROTOCOL = /^AL-[A-Za-z0-9_-]{22}$/;
const TRACKING_KEY = /^[0-9a-f]{64}$/;

export function trackingDigest(key) {
  if (typeof key !== 'string' || !TRACKING_KEY.test(key)) return null;
  return createHash('sha256').update(key).digest('hex');
}

export function matchesTrackingDigest(stored, digest) {
  if (typeof stored !== 'string' || !TRACKING_KEY.test(stored) || !digest) return false;
  return timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(digest, 'hex'));
}

export function privateHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function unavailable(res) {
  return res.status(404).json({ success: false, error: 'Este link de acompanhamento está indisponível.' });
}

export function registerLeadTracking(app, { leadError }) {
  app.all('/api/pedido/status',
    (req, res, next) => {
      privateHeaders(res);
      if (req.method !== 'POST' || !req.is('application/json')) return unavailable(res);
      next();
    },
    express.json({ limit: '2kb' }),
    async (req, res) => {
      const { protocolo, chaveAcompanhamento } = req.body ?? {};
      const digest = trackingDigest(chaveAcompanhamento);
      if (typeof protocolo !== 'string' || !PROTOCOL.test(protocolo) || !digest) return unavailable(res);

      try {
        const lead = await getLead(protocolo);
        if (!matchesTrackingDigest(lead?.acompanhamentoHash, digest)) return unavailable(res);
        const current = await getLeadStatus(protocolo);
        const status = (current?.status ?? lead.status) === 'respondido' ? 'respondido' : 'pendente';
        return res.json({ success: true, status });
      } catch (error) {
        return leadError(res, error);
      }
    },
    (_error, _req, res, _next) => unavailable(res)
  );
}
