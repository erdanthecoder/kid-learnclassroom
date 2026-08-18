/* MoneyMap — data model and persistence.
   Everything is kept in localStorage; nothing ever leaves the browser.
   Rates are stored against a fixed internal anchor so changing the display
   base currency never rewrites the numbers you typed. */
(function (global) {
  'use strict';

  var KEY = 'moneymap.v1';
  var ANCHOR = 'USD'; // internal anchor only; the user picks any display base

  var DEFAULT_CURRENCIES = [
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

  var DEFAULT_CATEGORIES = [
    'Food & groceries', 'Cafes & eating out', 'Transport', 'Rent & bills',
    'Phone & internet', 'Health', 'Clothes', 'Study & books',
    'Fun & travel', 'Gifts', 'Savings', 'Other'
  ];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function blank() {
    return {
      version: 1,
      baseCurrency: 'USD',
      theme: 'dark',
      currencies: DEFAULT_CURRENCIES.map(function (c) { return { code: c.code, name: c.name, rate: c.rate }; }),
      categories: DEFAULT_CATEGORIES.slice(),
      wallets: [],
      transactions: []
    };
  }

  function sample() {
    var data = blank();
    var today = new Date();
    function day(offset) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
      return d.toISOString().slice(0, 10);
    }
    var pocket = { id: uid(), name: 'Cash in my pocket', kind: 'cash', currency: 'KGS', opening: 12000, note: 'paper money I carry' };
    var homeUsd = { id: uid(), name: 'Dollars at home', kind: 'cash', currency: 'USD', opening: 300, note: 'paper money kept at home' };
    var mainCard = { id: uid(), name: 'Main card', kind: 'card', currency: 'KGS', opening: 45000, note: 'salary lands here' };
    var travelCard = { id: uid(), name: 'Travel card', kind: 'card', currency: 'EUR', opening: 180, note: 'for trips' };
    data.wallets = [pocket, homeUsd, mainCard, travelCard];
    data.transactions = [
      { id: uid(), type: 'expense', walletId: mainCard.id, amount: 2350, category: 'Food & groceries', place: 'Globus supermarket', date: day(1), note: 'week groceries' },
      { id: uid(), type: 'expense', walletId: pocket.id, amount: 120, category: 'Transport', place: 'Marshrutka', date: day(1), note: '' },
      { id: uid(), type: 'expense', walletId: travelCard.id, amount: 24.5, category: 'Cafes & eating out', place: 'Cafe in Berlin', date: day(4), note: 'breakfast' },
      { id: uid(), type: 'expense', walletId: mainCard.id, amount: 18000, category: 'Rent & bills', place: 'Landlord', date: day(6), note: 'monthly rent' },
      { id: uid(), type: 'income', walletId: mainCard.id, amount: 65000, category: 'Salary', place: 'Work', date: day(7), note: 'monthly salary' },
      { id: uid(), type: 'transfer', walletId: mainCard.id, toWalletId: pocket.id, amount: 5000, received: 5000, date: day(7), note: 'took cash from ATM' },
      { id: uid(), type: 'expense', walletId: homeUsd.id, amount: 40, category: 'Gifts', place: 'Birthday present', date: day(12), note: '' }
    ];
    data.categories.push('Salary');
    return data;
  }

  function migrate(raw) {
    var base = blank();
    if (!raw || typeof raw !== 'object') return base;
    var data = {
      version: 1,
      baseCurrency: typeof raw.baseCurrency === 'string' ? raw.baseCurrency : base.baseCurrency,
      theme: raw.theme === 'light' ? 'light' : 'dark',
      currencies: Array.isArray(raw.currencies) && raw.currencies.length ? raw.currencies : base.currencies,
      categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : base.categories,
      wallets: Array.isArray(raw.wallets) ? raw.wallets : [],
      transactions: Array.isArray(raw.transactions) ? raw.transactions : []
    };
    data.currencies = data.currencies
      .filter(function (c) { return c && typeof c.code === 'string'; })
      .map(function (c) {
        return {
          code: String(c.code).toUpperCase().slice(0, 6),
          name: typeof c.name === 'string' ? c.name : c.code,
          rate: Number(c.rate) > 0 ? Number(c.rate) : 1
        };
      });
    if (!data.currencies.some(function (c) { return c.code === ANCHOR; })) {
      data.currencies.unshift({ code: ANCHOR, name: 'US dollar', rate: 1 });
    }
    data.wallets = data.wallets.filter(function (w) { return w && w.id; }).map(function (w) {
      return {
        id: String(w.id),
        name: String(w.name || 'Wallet').slice(0, 40),
        kind: w.kind === 'card' ? 'card' : 'cash',
        currency: String(w.currency || data.baseCurrency).toUpperCase(),
        opening: Number(w.opening) || 0,
        note: String(w.note || '').slice(0, 80)
      };
    });
    data.transactions = data.transactions.filter(function (t) { return t && t.id; }).map(function (t) {
      var type = t.type === 'income' || t.type === 'transfer' ? t.type : 'expense';
      return {
        id: String(t.id),
        type: type,
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
    if (!data.currencies.some(function (c) { return c.code === data.baseCurrency; })) {
      data.baseCurrency = data.currencies[0].code;
    }
    return data;
  }

  var state = null;

  function load() {
    var stored = null;
    try { stored = JSON.parse(global.localStorage.getItem(KEY)); } catch (err) { stored = null; }
    state = stored ? migrate(stored) : sample();
    return state;
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function get() { return state || load(); }

  function replace(raw) {
    state = migrate(raw);
    save();
    return state;
  }

  function reset() {
    state = blank();
    save();
    return state;
  }

  global.Store = {
    ANCHOR: ANCHOR,
    uid: uid,
    load: load,
    save: save,
    get: get,
    replace: replace,
    reset: reset,
    blank: blank,
    sample: sample
  };
})(window);
