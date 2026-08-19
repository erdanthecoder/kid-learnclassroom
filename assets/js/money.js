/* Vaultline — every number the screens show is worked out here.
 *
 * The one rule that keeps this honest: a wallet's balance is never stored. It
 * is always recomputed from its starting amount plus every record that touches
 * it, so editing or deleting a record can never leave a balance out of step. */

import * as Store from './store.js';

export function currency(code) {
  return Store.get().currencies.find((c) => c.code === code) || null;
}

function anchorRate(code) {
  const c = currency(code);
  return c && c.rate > 0 ? c.rate : 1;
}

/* How much one unit of `code` is worth in the currency shown in totals. */
export function rateInBase(code, base = Store.get().baseCurrency) {
  return anchorRate(code) / anchorRate(base);
}

export function convert(amount, from, to = Store.get().baseCurrency) {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  return amount * (anchorRate(from) / anchorRate(to));
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

export function decimalsFor(code) {
  return ZERO_DECIMAL.has(code) ? 0 : 2;
}

export function format(amount, code) {
  const digits = decimalsFor(code);
  let text;
  try {
    text = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(amount);
  } catch (err) {
    text = amount.toFixed(digits);
  }
  return `${text} ${code}`;
}

export function formatBase(amount) {
  return format(amount, Store.get().baseCurrency);
}

/* Short form for tight spaces: 1.2M, 45.3k */
export function compact(amount, code = Store.get().baseCurrency) {
  const abs = Math.abs(amount);
  if (abs >= 1e6) return `${(amount / 1e6).toFixed(1)}M ${code}`;
  if (abs >= 10000) return `${(amount / 1000).toFixed(1)}k ${code}`;
  return format(amount, code);
}

export function wallet(id) {
  return Store.get().wallets.find((w) => w.id === id) || null;
}

export function balanceOf(walletId) {
  const w = wallet(walletId);
  if (!w) return 0;
  let total = w.opening;
  for (const t of Store.get().transactions) {
    if (t.type === 'expense' && t.walletId === walletId) total -= t.amount;
    else if (t.type === 'income' && t.walletId === walletId) total += t.amount;
    else if (t.type === 'transfer') {
      if (t.walletId === walletId) total -= t.amount;
      if (t.toWalletId === walletId) total += (t.received || t.amount);
    }
  }
  return total;
}

export function totals() {
  const out = { total: 0, cash: 0, card: 0, cashWallets: 0, cardWallets: 0, byCurrency: {} };
  for (const w of Store.get().wallets) {
    const raw = balanceOf(w.id);
    const inBase = convert(raw, w.currency);
    out.total += inBase;
    if (w.kind === 'card') { out.card += inBase; out.cardWallets += 1; }
    else { out.cash += inBase; out.cashWallets += 1; }

    if (!out.byCurrency[w.currency]) {
      out.byCurrency[w.currency] = { currency: w.currency, raw: 0, base: 0, cash: 0, card: 0 };
    }
    const bucket = out.byCurrency[w.currency];
    bucket.raw += raw;
    bucket.base += inBase;
    if (w.kind === 'card') bucket.card += raw; else bucket.cash += raw;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* time ranges                                                         */
/* ------------------------------------------------------------------ */

function asDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfRange(range, now = new Date()) {
  if (range === 'all') return null;
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  const days = parseInt(range, 10);
  if (!days) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

export function inRange(dateStr, range, now = new Date()) {
  const from = startOfRange(range, now);
  if (!from) return true;
  return asDate(dateStr) >= from;
}

function inMonth(dateStr, offset = 0, now = new Date()) {
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const d = asDate(dateStr);
  return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
}

function baseAmount(t) {
  const w = wallet(t.walletId);
  return convert(t.amount, w ? w.currency : Store.get().baseCurrency);
}

/* ------------------------------------------------------------------ */
/* spending                                                            */
/* ------------------------------------------------------------------ */

/* Transfers are deliberately never counted: moving your own money from a card
   into your pocket is not spending. */
export function expensesIn(range) {
  return Store.get().transactions.filter((t) => t.type === 'expense' && inRange(t.date, range));
}

export function spendingByCategory(range) {
  const map = new Map();
  for (const t of expensesIn(range)) {
    const key = t.category || 'Uncategorised';
    if (!map.has(key)) map.set(key, { label: key, base: 0, count: 0, places: new Map() });
    const row = map.get(key);
    const value = baseAmount(t);
    row.base += value;
    row.count += 1;
    if (t.place) row.places.set(t.place, (row.places.get(t.place) || 0) + value);
  }
  return [...map.values()].map((row) => {
    const top = [...row.places.entries()].sort((a, b) => b[1] - a[1])[0];
    return { ...row, topPlace: top ? top[0] : '' };
  }).sort((a, b) => b.base - a.base);
}

export function spendingByPlace(range) {
  const map = new Map();
  for (const t of expensesIn(range)) {
    const key = t.place || t.category || 'Unnamed';
    if (!map.has(key)) map.set(key, { label: key, base: 0, count: 0 });
    const row = map.get(key);
    row.base += baseAmount(t);
    row.count += 1;
  }
  return [...map.values()].sort((a, b) => b.base - a.base);
}

export function spentInRange(range) {
  return expensesIn(range).reduce((sum, t) => sum + baseAmount(t), 0);
}

export function earnedInRange(range) {
  return Store.get().transactions
    .filter((t) => t.type === 'income' && inRange(t.date, range))
    .reduce((sum, t) => sum + baseAmount(t), 0);
}

/* ------------------------------------------------------------------ */
/* budgets                                                             */
/* ------------------------------------------------------------------ */

export function budgetProgress(now = new Date()) {
  const state = Store.get();
  const spentByCategory = new Map();
  for (const t of state.transactions) {
    if (t.type !== 'expense' || !inMonth(t.date, 0, now)) continue;
    const key = t.category || 'Uncategorised';
    spentByCategory.set(key, (spentByCategory.get(key) || 0) + baseAmount(t));
  }

  return state.budgets.map((b) => {
    const limitBase = convert(b.limit, b.currency || state.baseCurrency);
    const spent = spentByCategory.get(b.category) || 0;
    const share = limitBase > 0 ? spent / limitBase : 0;
    return {
      ...b,
      limitBase,
      spent,
      left: limitBase - spent,
      share,
      state: share >= 1 ? 'over' : share >= 0.8 ? 'close' : 'fine'
    };
  }).sort((a, b) => b.share - a.share);
}

/* ------------------------------------------------------------------ */
/* insights                                                            */
/* ------------------------------------------------------------------ */

export function insights(now = new Date()) {
  const state = Store.get();
  const thisMonth = state.transactions.filter((t) => t.type === 'expense' && inMonth(t.date, 0, now));
  const lastMonth = state.transactions.filter((t) => t.type === 'expense' && inMonth(t.date, -1, now));

  const spentThis = thisMonth.reduce((s, t) => s + baseAmount(t), 0);
  const spentLast = lastMonth.reduce((s, t) => s + baseAmount(t), 0);
  const earnedThis = earnedInRange('month');

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const perDay = dayOfMonth > 0 ? spentThis / dayOfMonth : 0;

  let biggest = null;
  for (const t of thisMonth) {
    const value = baseAmount(t);
    if (!biggest || value > biggest.base) {
      biggest = { base: value, place: t.place || t.category || 'a purchase', date: t.date };
    }
  }

  const places = spendingByPlace('month');

  return {
    spentThis,
    spentLast,
    earnedThis,
    saved: earnedThis - spentThis,
    changeVsLastMonth: spentLast > 0 ? (spentThis - spentLast) / spentLast : null,
    perDay,
    projected: perDay * daysInMonth,
    daysLeft: daysInMonth - dayOfMonth,
    biggest,
    topPlace: places[0] || null,
    recordCount: thisMonth.length
  };
}
