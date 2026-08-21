/* Vaultline — the data model, its defaults, and the on-device copy.
 *
 * The device copy is always written, signed in or not. It is what paints the
 * screen instantly on load, and it is the whole story while signed out. */

const KEY = 'vaultline.v1';
export const ANCHOR = 'USD'; // internal reference for rates; not the display currency

const DEFAULT_CURRENCIES = [
  { code: 'USD', name: 'US dollar', rate: 1 },
  { code: 'EUR', name: 'Euro', rate: 1.09 },
  { code: 'KGS', name: 'Kyrgyz som', rate: 0.0114 },
  { code: 'KZT', name: 'Kazakh tenge', rate: 0.0021 },
  { code: 'RUB', name: 'Russian ruble', rate: 0.011 },
  { code: 'TRY', name: 'Turkish lira', rate: 0.029 },
  { code: 'GBP', name: 'British pound', rate: 1.27 },
  { code: 'AED', name: 'UAE dirham', rate: 0.272 },
  { code: 'CNY', name: 'Chinese yuan', rate: 0.14 },
  { code: 'JPY', name: 'Japanese yen', rate: 0.0064 }
];

const DEFAULT_CATEGORIES = [
  'Food & groceries', 'Cafes & eating out', 'Transport', 'Rent & bills',
  'Phone & internet', 'Health', 'Clothes', 'Study & books',
  'Fun & travel', 'Gifts', 'Savings', 'Other'
];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

/* The chosen background travels with the account; the photo itself does not.
   A photo would be far too big for a settings document, so it stays on the
   device that chose it, under its own storage key. */
export const PHOTO_KEY = 'vaultline.bg';

export function blank() {
  return {
    version: 1,
    isSample: false,
    baseCurrency: 'USD',
    theme: 'dark',
    background: { kind: 'mountains', strength: 62 },
    currencies: DEFAULT_CURRENCIES.map((c) => ({ ...c })),
    categories: DEFAULT_CATEGORIES.slice(),
    wallets: [],
    transactions: [],
    budgets: []
  };
}

export function sample() {
  const data = blank();
  data.isSample = true;
  const now = new Date();
  const day = (back) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    return d.toISOString().slice(0, 10);
  };

  const pocket = { id: uid(), name: 'Cash in my pocket', kind: 'cash', currency: 'KGS', opening: 12000, note: 'paper money I carry' };
  const homeUsd = { id: uid(), name: 'Dollars at home', kind: 'cash', currency: 'USD', opening: 300, note: 'kept for emergencies' };
  const mainCard = { id: uid(), name: 'Main card', kind: 'card', currency: 'KGS', opening: 45000, note: 'salary lands here' };
  const travelCard = { id: uid(), name: 'Travel card', kind: 'card', currency: 'EUR', opening: 180, note: 'for trips' };

  data.wallets = [pocket, homeUsd, mainCard, travelCard];
  data.categories.push('Salary');
  data.transactions = [
    { id: uid(), type: 'expense', walletId: mainCard.id, toWalletId: '', amount: 2350, received: 0, category: 'Food & groceries', place: 'Globus supermarket', date: day(1), note: 'week groceries' },
    { id: uid(), type: 'expense', walletId: pocket.id, toWalletId: '', amount: 120, received: 0, category: 'Transport', place: 'Marshrutka', date: day(1), note: '' },
    { id: uid(), type: 'expense', walletId: travelCard.id, toWalletId: '', amount: 24.5, received: 0, category: 'Cafes & eating out', place: 'Cafe in Berlin', date: day(4), note: 'breakfast' },
    { id: uid(), type: 'expense', walletId: mainCard.id, toWalletId: '', amount: 18000, received: 0, category: 'Rent & bills', place: 'Landlord', date: day(6), note: 'monthly rent' },
    { id: uid(), type: 'income', walletId: mainCard.id, toWalletId: '', amount: 65000, received: 0, category: 'Salary', place: 'Work', date: day(7), note: 'monthly salary' },
    { id: uid(), type: 'transfer', walletId: mainCard.id, toWalletId: pocket.id, amount: 5000, received: 5000, category: '', place: '', date: day(7), note: 'took cash from ATM' },
    { id: uid(), type: 'expense', walletId: homeUsd.id, toWalletId: '', amount: 40, received: 0, category: 'Gifts', place: 'Birthday present', date: day(12), note: '' }
  ];
  data.budgets = [
    { id: slug('Food & groceries'), category: 'Food & groceries', limit: 120, currency: 'USD' },
    { id: slug('Cafes & eating out'), category: 'Cafes & eating out', limit: 60, currency: 'USD' }
  ];
  return data;
}

/* Anything that arrives from storage, a backup file or the cloud goes through
   here, so a half-written or hand-edited record can never reach the screens. */
export function normalise(raw) {
  const base = blank();
  if (!raw || typeof raw !== 'object') return base;

  const bg = raw.background && typeof raw.background === 'object' ? raw.background : {};
  const kind = ['none', 'mountains', 'photo'].includes(bg.kind) ? bg.kind : base.background.kind;
  const strength = Number(bg.strength);

  const data = {
    version: 1,
    isSample: raw.isSample === true,
    baseCurrency: typeof raw.baseCurrency === 'string' ? raw.baseCurrency : base.baseCurrency,
    theme: raw.theme === 'light' ? 'light' : 'dark',
    background: {
      kind,
      strength: Number.isFinite(strength) ? Math.min(100, Math.max(8, strength)) : base.background.strength
    },
    currencies: Array.isArray(raw.currencies) && raw.currencies.length ? raw.currencies : base.currencies,
    categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : base.categories,
    wallets: Array.isArray(raw.wallets) ? raw.wallets : [],
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
    budgets: Array.isArray(raw.budgets) ? raw.budgets : []
  };

  data.currencies = data.currencies
    .filter((c) => c && typeof c.code === 'string')
    .map((c) => ({
      code: String(c.code).toUpperCase().slice(0, 6),
      name: typeof c.name === 'string' && c.name ? c.name : String(c.code).toUpperCase(),
      rate: Number(c.rate) > 0 ? Number(c.rate) : 1
    }));
  if (!data.currencies.some((c) => c.code === ANCHOR)) {
    data.currencies.unshift({ code: ANCHOR, name: 'US dollar', rate: 1 });
  }

  data.categories = data.categories
    .filter((c) => typeof c === 'string' && c.trim())
    .map((c) => c.trim().slice(0, 30));

  data.wallets = data.wallets.filter((w) => w && w.id).map((w) => ({
    id: String(w.id),
    name: String(w.name || 'Wallet').slice(0, 40),
    kind: w.kind === 'card' ? 'card' : 'cash',
    currency: String(w.currency || data.baseCurrency).toUpperCase(),
    opening: Number(w.opening) || 0,
    note: String(w.note || '').slice(0, 80)
  }));

  data.transactions = data.transactions.filter((t) => t && t.id).map((t) => {
    const type = t.type === 'income' || t.type === 'transfer' ? t.type : 'expense';
    return {
      id: String(t.id),
      type,
      walletId: String(t.walletId || ''),
      toWalletId: type === 'transfer' ? String(t.toWalletId || '') : '',
      amount: Math.abs(Number(t.amount) || 0),
      received: type === 'transfer' ? Math.abs(Number(t.received) || 0) : 0,
      category: String(t.category || '').slice(0, 30),
      place: String(t.place || '').slice(0, 60),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : new Date().toISOString().slice(0, 10),
      note: String(t.note || '').slice(0, 120)
    };
  });

  data.budgets = data.budgets.filter((b) => b && b.category).map((b) => ({
    id: String(b.id || slug(b.category)),
    category: String(b.category).slice(0, 30),
    limit: Math.abs(Number(b.limit) || 0),
    currency: String(b.currency || data.baseCurrency).toUpperCase()
  }));

  if (!data.currencies.some((c) => c.code === data.baseCurrency)) {
    data.baseCurrency = data.currencies[0].code;
  }
  return data;
}

let state = null;

export function load() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY));
  } catch (err) {
    stored = null;
  }
  state = stored ? normalise(stored) : sample();
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    return false;
  }
}

export function get() {
  return state || load();
}

export function replace(raw) {
  state = normalise(raw);
  save();
  return state;
}

export function reset() {
  state = blank();
  save();
  return state;
}

/* The example book is scenery. The first time the user changes anything it
   becomes their own data — and only then is it worth uploading. */
export function markReal() {
  if (state && state.isSample) state.isSample = false;
}

/* Adopt what the account holds, keeping local defaults for anything the
   account has never written. */
export function adopt(cloudBook) {
  const next = blank();
  const settings = cloudBook.settings || {};
  next.baseCurrency = settings.baseCurrency || state.baseCurrency;
  next.theme = settings.theme === 'light' ? 'light' : (settings.theme || state.theme);
  next.background = settings.background && typeof settings.background === 'object'
    ? settings.background
    : state.background;
  next.categories = Array.isArray(settings.categories) && settings.categories.length
    ? settings.categories
    : state.categories;
  next.currencies = cloudBook.currencies && cloudBook.currencies.length
    ? cloudBook.currencies
    : state.currencies;
  next.wallets = cloudBook.wallets || [];
  next.transactions = cloudBook.transactions || [];
  next.budgets = (cloudBook.budgets || []).map((b) => ({
    id: b.id, category: b.category, limit: b.limit, currency: b.currency || next.baseCurrency
  }));
  state = normalise(next);
  state.isSample = false;
  save();
  return state;
}
