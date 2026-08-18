/* MoneyMap — currency maths and the numbers the screens read from. */
(function (global) {
  'use strict';

  var Store = global.Store;

  function currency(code) {
    var list = Store.get().currencies;
    for (var i = 0; i < list.length; i++) {
      if (list[i].code === code) return list[i];
    }
    return null;
  }

  /* rate of 1 unit of `code` expressed in the internal anchor */
  function anchorRate(code) {
    var c = currency(code);
    return c && c.rate > 0 ? c.rate : 1;
  }

  /* how much 1 unit of `code` is worth in the display base currency */
  function rateInBase(code, base) {
    base = base || Store.get().baseCurrency;
    return anchorRate(code) / anchorRate(base);
  }

  function convert(amount, from, to) {
    if (!isFinite(amount)) return 0;
    to = to || Store.get().baseCurrency;
    if (from === to) return amount;
    return amount * (anchorRate(from) / anchorRate(to));
  }

  function decimalsFor(code) {
    return code === 'JPY' || code === 'KRW' || code === 'VND' ? 0 : 2;
  }

  function format(amount, code) {
    var digits = decimalsFor(code);
    var abs = Math.abs(amount);
    if (abs >= 1000 && digits === 2) digits = 2;
    var text;
    try {
      text = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      }).format(amount);
    } catch (err) {
      text = amount.toFixed(digits);
    }
    return text + ' ' + code;
  }

  function formatBase(amount) {
    return format(amount, Store.get().baseCurrency);
  }

  function wallet(id) {
    var list = Store.get().wallets;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* A wallet's balance is always derived: starting amount plus every record
     that touches it. Nothing is stored twice, so editing a record can never
     leave a balance out of step. */
  function balanceOf(walletId) {
    var w = wallet(walletId);
    if (!w) return 0;
    var total = w.opening;
    Store.get().transactions.forEach(function (t) {
      if (t.type === 'expense' && t.walletId === walletId) total -= t.amount;
      else if (t.type === 'income' && t.walletId === walletId) total += t.amount;
      else if (t.type === 'transfer') {
        if (t.walletId === walletId) total -= t.amount;
        if (t.toWalletId === walletId) total += (t.received || t.amount);
      }
    });
    return total;
  }

  function totals() {
    var out = { total: 0, cash: 0, card: 0, cashWallets: 0, cardWallets: 0, byCurrency: {} };
    Store.get().wallets.forEach(function (w) {
      var raw = balanceOf(w.id);
      var inBase = convert(raw, w.currency);
      out.total += inBase;
      if (w.kind === 'card') { out.card += inBase; out.cardWallets++; }
      else { out.cash += inBase; out.cashWallets++; }
      if (!out.byCurrency[w.currency]) out.byCurrency[w.currency] = { currency: w.currency, raw: 0, base: 0, cash: 0, card: 0 };
      var bucket = out.byCurrency[w.currency];
      bucket.raw += raw;
      bucket.base += inBase;
      if (w.kind === 'card') bucket.card += raw; else bucket.cash += raw;
    });
    return out;
  }

  function startOfRange(range) {
    var now = new Date();
    if (range === 'all') return null;
    if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    var days = parseInt(range, 10);
    if (!days) return null;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  }

  function inRange(dateStr, range) {
    var from = startOfRange(range);
    if (!from) return true;
    var parts = dateStr.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d >= from;
  }

  /* Transfers are deliberately excluded: moving your own money between a card
     and your pocket is not spending. */
  function spendingByCategory(range) {
    var map = {};
    Store.get().transactions.forEach(function (t) {
      if (t.type !== 'expense' || !inRange(t.date, range)) return;
      var w = wallet(t.walletId);
      var base = convert(t.amount, w ? w.currency : Store.get().baseCurrency);
      var key = t.category || 'Uncategorised';
      if (!map[key]) map[key] = { label: key, base: 0, count: 0, places: {} };
      map[key].base += base;
      map[key].count++;
      if (t.place) map[key].places[t.place] = (map[key].places[t.place] || 0) + base;
    });
    return Object.keys(map).map(function (k) {
      var row = map[k];
      var top = Object.keys(row.places).sort(function (a, b) { return row.places[b] - row.places[a]; })[0];
      row.topPlace = top || '';
      return row;
    }).sort(function (a, b) { return b.base - a.base; });
  }

  function spendingByPlace(range) {
    var map = {};
    Store.get().transactions.forEach(function (t) {
      if (t.type !== 'expense' || !inRange(t.date, range)) return;
      var key = t.place || t.category || 'Unnamed';
      var w = wallet(t.walletId);
      if (!map[key]) map[key] = { label: key, base: 0, count: 0 };
      map[key].base += convert(t.amount, w ? w.currency : Store.get().baseCurrency);
      map[key].count++;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.base - a.base; });
  }

  function spentInRange(range) {
    return spendingByCategory(range).reduce(function (sum, row) { return sum + row.base; }, 0);
  }

  function earnedInRange(range) {
    var sum = 0;
    Store.get().transactions.forEach(function (t) {
      if (t.type !== 'income' || !inRange(t.date, range)) return;
      var w = wallet(t.walletId);
      sum += convert(t.amount, w ? w.currency : Store.get().baseCurrency);
    });
    return sum;
  }

  global.Money = {
    currency: currency,
    rateInBase: rateInBase,
    convert: convert,
    format: format,
    formatBase: formatBase,
    decimalsFor: decimalsFor,
    wallet: wallet,
    balanceOf: balanceOf,
    totals: totals,
    inRange: inRange,
    spendingByCategory: spendingByCategory,
    spendingByPlace: spendingByPlace,
    spentInRange: spentInRange,
    earnedInRange: earnedInRange
  };
})(window);
