export function parseMoneyCents(raw) {
  let normalized = raw.trim().replace(/^R\$\s*/, '');
  if (!normalized) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(normalized)) {
    normalized = normalized.replaceAll('.', '');
  }
  if (!/^\d+([.,]\d{1,2})?$/.test(normalized)) return NaN;
  const [whole, decimals = ''] = normalized.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : NaN;
}
