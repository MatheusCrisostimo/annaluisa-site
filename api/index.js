import app from '../server.js';

// Express parses request bodies, including the raw body signed by Meta.
export const config = { helpers: false };

export default function handler(req, res) {
  return app(req, res);
}
