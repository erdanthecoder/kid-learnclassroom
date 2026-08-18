/* MoneyMap — screens, forms and events. */
(function (global) {
  'use strict';

  var Store = global.Store;
  var Money = global.Money;
  var state = Store.load();

  var $ = function (id) { return document.getElementById(id); };
  var TYPE_ICON = { expense: '➖', income: '➕', transfer: '🔁' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function niceDate(iso) {
    var parts = iso.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    try {
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (err) {
      return iso;
    }
  }

  var toastTimer = null;
  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function commit() {
    Store.markReal();
    if (!Store.save()) toast('Could not save — browser storage is full or blocked');
    renderAll();
  }

  /* ---------------- select helpers ---------------- */

  function fillCurrencySelects() {
    var options = state.currencies.map(function (c) {
      return '<option value="' + esc(c.code) + '">' + esc(c.code) + ' — ' + esc(c.name) + '</option>';
    }).join('');
    ['base-currency', 'wallet-currency'].forEach(function (id) {
      var el = $(id);
      var keep = el.value;
      el.innerHTML = options;
      el.value = keep && state.currencies.some(function (c) { return c.code === keep; }) ? keep : state.baseCurrency;
    });
    $('base-currency').value = state.baseCurrency;
  }

  function walletOptions(selected, placeholder) {
    var html = placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '';
    html += state.wallets.map(function (w) {
      var icon = w.kind === 'card' ? '💳' : '💵';
      return '<option value="' + esc(w.id) + '"' + (w.id === selected ? ' selected' : '') + '>' +
        icon + ' ' + esc(w.name) + ' (' + esc(w.currency) + ')</option>';
    }).join('');
    return html;
  }

  function fillWalletSelects() {
    var from = $('tx-wallet');
    var to = $('tx-to-wallet');
    var filter = $('filter-wallet');
    var keepFrom = from.value, keepTo = to.value, keepFilter = filter.value;
    from.innerHTML = state.wallets.length ? walletOptions(keepFrom) : '<option value="">Add a wallet first</option>';
    to.innerHTML = state.wallets.length ? walletOptions(keepTo) : '<option value="">Add a wallet first</option>';
    filter.innerHTML = '<option value="">All wallets</option>' + walletOptions(keepFilter);
    if (keepFrom) from.value = keepFrom;
    if (keepTo) to.value = keepTo;
    filter.value = keepFilter;
    updateAmountHints();
  }

  function fillCategorySelects() {
    var cat = $('tx-category');
    var filter = $('filter-category');
    var keep = cat.value, keepFilter = filter.value;
    var options = state.categories.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    cat.innerHTML = options;
    filter.innerHTML = '<option value="">All categories</option>' + options;
    if (keep && state.categories.indexOf(keep) > -1) cat.value = keep;
    filter.value = keepFilter;

    var places = {};
    state.transactions.forEach(function (t) { if (t.place) places[t.place] = true; });
    $('place-suggestions').innerHTML = Object.keys(places).sort().map(function (p) {
      return '<option value="' + esc(p) + '"></option>';
    }).join('');
  }

  /* ---------------- overview ---------------- */

  function renderOverview() {
    var t = Money.totals();
    $('stat-total').textContent = Money.formatBase(t.total);
    $('stat-total-note').textContent = state.wallets.length
      ? state.wallets.length + ' wallets, ' + Object.keys(t.byCurrency).length + ' currencies'
      : 'add a wallet to start';
    $('stat-cash').textContent = Money.formatBase(t.cash);
    $('stat-cash-note').textContent = t.cashWallets + (t.cashWallets === 1 ? ' cash wallet' : ' cash wallets');
    $('stat-card').textContent = Money.formatBase(t.card);
    $('stat-card-note').textContent = t.cardWallets + (t.cardWallets === 1 ? ' card' : ' cards');

    var spent = Money.spentInRange('month');
    var earned = Money.earnedInRange('month');
    $('stat-month').textContent = Money.formatBase(spent);
    $('stat-month-note').textContent = 'got ' + Money.formatBase(earned) + ' this month';

    renderCurrencyBars(t);
    renderCategoryBars();
    renderTxList($('recent-list'), state.transactions.slice().sort(byDateDesc).slice(0, 8), 'No records yet — write your first one in Spending.');
  }

  function renderCurrencyBars(t) {
    var rows = Object.keys(t.byCurrency).map(function (k) { return t.byCurrency[k]; })
      .sort(function (a, b) { return b.base - a.base; });
    var host = $('by-currency');
    if (!rows.length) {
      host.innerHTML = '<p class="empty">No wallets yet.</p>';
      return;
    }
    var max = rows[0].base || 1;
    host.innerHTML = rows.map(function (row) {
      var pct = Math.max(2, Math.round((row.base / max) * 100));
      var split = [];
      if (row.cash) split.push('💵 ' + Money.format(row.cash, row.currency));
      if (row.card) split.push('💳 ' + Money.format(row.card, row.currency));
      return '' +
        '<div class="bar-row">' +
          '<div class="bar-label">' + esc(row.currency) +
            '<small>' + esc(split.join('  ·  ') || 'empty') + '</small></div>' +
          '<div class="bar-amount">' + esc(Money.format(row.raw, row.currency)) +
            '<small>= ' + esc(Money.formatBase(row.base)) + '</small></div>' +
          '<div class="bar-track"><div class="bar-fill' + (row.card ? '' : ' cash') + '" style="width:' + pct + '%"></div></div>' +
        '</div>';
    }).join('');
  }

  function renderCategoryBars() {
    var range = $('spent-range').value;
    var rows = Money.spendingByCategory(range);
    var host = $('by-category');
    if (!rows.length) {
      host.innerHTML = '<p class="empty">Nothing spent in this period.</p>';
      return;
    }
    var max = rows[0].base || 1;
    var total = rows.reduce(function (s, r) { return s + r.base; }, 0);
    host.innerHTML = rows.map(function (row) {
      var pct = Math.max(2, Math.round((row.base / max) * 100));
      var share = total ? (row.base / total) * 100 : 0;
      var shareText = share > 0 && share < 1 ? '<1%' : Math.round(share) + '%';
      var sub = row.topPlace ? 'mostly ' + row.topPlace : row.count + ' records';
      return '' +
        '<div class="bar-row">' +
          '<div class="bar-label">' + esc(row.label) + '<small>' + esc(sub) + '</small></div>' +
          '<div class="bar-amount">' + esc(Money.formatBase(row.base)) + '<small>' + shareText + '</small></div>' +
          '<div class="bar-track"><div class="bar-fill spend" style="width:' + pct + '%"></div></div>' +
        '</div>';
    }).join('');
  }

  /* ---------------- wallets ---------------- */

  function renderWallets() {
    var host = $('wallet-list');
    if (!state.wallets.length) {
      host.innerHTML = '<p class="empty">No wallets yet. Add your pocket cash and your cards above.</p>';
      return;
    }
    host.innerHTML = state.wallets.map(function (w) {
      var balance = Money.balanceOf(w.id);
      var inBase = Money.convert(balance, w.currency);
      var showConverted = w.currency !== state.baseCurrency;
      return '' +
        '<article class="wallet ' + (w.kind === 'card' ? 'card-kind' : '') + '">' +
          '<div class="wallet-top">' +
            '<span class="wallet-name">' + esc(w.name) + '</span>' +
            '<span class="wallet-kind">' + (w.kind === 'card' ? '💳 card' : '💵 cash') + '</span>' +
          '</div>' +
          '<div class="wallet-balance">' + esc(Money.format(balance, w.currency)) + '</div>' +
          (showConverted ? '<div class="wallet-converted">≈ ' + esc(Money.formatBase(inBase)) + '</div>' : '') +
          (w.note ? '<div class="wallet-note">' + esc(w.note) + '</div>' : '') +
          '<div class="wallet-actions">' +
            '<button type="button" class="btn tiny" data-edit-wallet="' + esc(w.id) + '">Edit</button>' +
            '<button type="button" class="btn tiny danger" data-delete-wallet="' + esc(w.id) + '">Delete</button>' +
          '</div>' +
        '</article>';
    }).join('');
  }

  /* ---------------- records ---------------- */

  function byDateDesc(a, b) {
    if (a.date === b.date) return a.id < b.id ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  }

  function describe(t) {
    var from = Money.wallet(t.walletId);
    var to = Money.wallet(t.toWalletId);
    if (t.type === 'transfer') {
      var moved = ['Moved money'];
      if (from && to && from.currency !== to.currency) {
        moved.push('arrived as ' + Money.format(t.received || t.amount, to.currency));
      }
      moved.push(niceDate(t.date));
      if (t.note) moved.push(t.note);
      return {
        title: (from ? from.name : '?') + ' → ' + (to ? to.name : '?'),
        meta: moved.join(' · ')
      };
    }
    var title = t.place || t.category || (t.type === 'income' ? 'Money in' : 'Spending');
    var bits = [];
    if (t.category) bits.push(t.category);
    if (from) bits.push((from.kind === 'card' ? '💳 ' : '💵 ') + from.name);
    bits.push(niceDate(t.date));
    if (t.note) bits.push(t.note);
    return { title: title, meta: bits.join(' · ') };
  }

  function renderTxList(host, list, emptyText) {
    if (!list.length) {
      host.innerHTML = '<p class="empty">' + esc(emptyText) + '</p>';
      return;
    }
    host.innerHTML = list.map(function (t) {
      var w = Money.wallet(t.walletId);
      var code = w ? w.currency : state.baseCurrency;
      var d = describe(t);
      var sign = t.type === 'expense' ? '−' : t.type === 'income' ? '+' : '';
      var cls = t.type === 'expense' ? 'out' : t.type === 'income' ? 'in' : '';
      var converted = code !== state.baseCurrency
        ? '<small>' + esc(Money.formatBase(Money.convert(t.amount, code))) + '</small>' : '';
      return '' +
        '<div class="tx">' +
          '<span class="tx-icon">' + TYPE_ICON[t.type] + '</span>' +
          '<div class="tx-main"><strong>' + esc(d.title) + '</strong>' +
            '<span class="tx-meta">' + esc(d.meta) + '</span></div>' +
          '<div class="tx-amount ' + cls + '">' + sign + esc(Money.format(t.amount, code)) + converted + '</div>' +
          '<div class="tx-actions">' +
            '<button type="button" class="btn tiny" data-edit-tx="' + esc(t.id) + '">Edit</button>' +
            '<button type="button" class="btn tiny danger" data-delete-tx="' + esc(t.id) + '">×</button>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  function filteredTransactions() {
    var text = $('filter-text').value.trim().toLowerCase();
    var walletId = $('filter-wallet').value;
    var category = $('filter-category').value;
    var type = $('filter-type').value;
    return state.transactions.filter(function (t) {
      if (type && t.type !== type) return false;
      if (category && t.category !== category) return false;
      if (walletId && t.walletId !== walletId && t.toWalletId !== walletId) return false;
      if (text) {
        var w = Money.wallet(t.walletId);
        var hay = [t.place, t.note, t.category, w ? w.name : ''].join(' ').toLowerCase();
        if (hay.indexOf(text) === -1) return false;
      }
      return true;
    }).sort(byDateDesc);
  }

  function renderSpending() {
    var list = filteredTransactions();
    var spent = 0, got = 0;
    list.forEach(function (t) {
      var w = Money.wallet(t.walletId);
      var base = Money.convert(t.amount, w ? w.currency : state.baseCurrency);
      if (t.type === 'expense') spent += base;
      if (t.type === 'income') got += base;
    });
    $('tx-summary').textContent = list.length + ' records · spent ' + Money.formatBase(spent) + ' · got ' + Money.formatBase(got);
    renderTxList($('tx-list'), list, 'No records match these filters.');
  }

  /* ---------------- rates & categories ---------------- */

  function renderRates() {
    $('rates-base').textContent = state.baseCurrency;
    $('rates-list').innerHTML = state.currencies.slice().sort(function (a, b) {
      return a.code === state.baseCurrency ? -1 : b.code === state.baseCurrency ? 1 : a.code.localeCompare(b.code);
    }).map(function (c) {
      var isBase = c.code === state.baseCurrency;
      var value = Money.rateInBase(c.code);
      var used = state.wallets.some(function (w) { return w.currency === c.code; });
      return '' +
        '<div class="rate-row' + (isBase ? ' is-base' : '') + '">' +
          '<div class="rate-code">1 ' + esc(c.code) +
            '<span class="rate-name">' + esc(c.name) + (isBase ? ' · base' : '') + '</span></div>' +
          '<input type="number" step="0.000001" min="0" value="' + (isBase ? 1 : Number(value.toFixed(6))) + '"' +
            (isBase ? ' disabled' : '') + ' data-rate="' + esc(c.code) + '" />' +
          (isBase || used ? '<span class="hint">' + (isBase ? 'base' : 'in use') + '</span>'
            : '<button type="button" class="btn tiny danger" data-delete-currency="' + esc(c.code) + '">×</button>') +
        '</div>';
    }).join('');

    $('category-list').innerHTML = state.categories.map(function (c) {
      return '<span class="chip">' + esc(c) +
        '<button type="button" title="Remove" data-delete-category="' + esc(c) + '">×</button></span>';
    }).join('') || '<p class="empty">No categories.</p>';
  }

  function renderDataStats() {
    var bytes = 0;
    try { bytes = JSON.stringify(state).length; } catch (err) { bytes = 0; }
    $('data-stats').textContent = state.wallets.length + ' wallets · ' + state.transactions.length +
      ' records · ' + state.currencies.length + ' currencies · about ' + Math.max(1, Math.round(bytes / 1024)) + ' KB stored';
  }

  function renderAll() {
    fillCurrencySelects();
    fillWalletSelects();
    fillCategorySelects();
    renderOverview();
    renderWallets();
    renderSpending();
    renderRates();
    renderDataStats();
    renderAccount();
  }

  /* ---------------- wallet form ---------------- */

  function resetWalletForm() {
    $('wallet-form').reset();
    $('wallet-id').value = '';
    $('wallet-currency').value = state.baseCurrency;
    $('wallet-balance').value = '0';
    $('wallet-form-title').textContent = 'Add a wallet';
    $('wallet-submit').textContent = 'Add wallet';
    $('wallet-cancel').hidden = true;
  }

  function editWallet(id) {
    var w = Money.wallet(id);
    if (!w) return;
    $('wallet-id').value = w.id;
    $('wallet-name').value = w.name;
    $('wallet-kind').value = w.kind;
    $('wallet-currency').value = w.currency;
    $('wallet-balance').value = w.opening;
    $('wallet-note').value = w.note;
    $('wallet-form-title').textContent = 'Edit wallet';
    $('wallet-submit').textContent = 'Save wallet';
    $('wallet-cancel').hidden = false;
    showTab('wallets');
    $('wallet-name').focus();
  }

  $('wallet-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var id = $('wallet-id').value;
    var data = {
      name: $('wallet-name').value.trim() || 'Wallet',
      kind: $('wallet-kind').value === 'card' ? 'card' : 'cash',
      currency: $('wallet-currency').value,
      opening: Number($('wallet-balance').value) || 0,
      note: $('wallet-note').value.trim()
    };
    var saved;
    if (id) {
      var w = Money.wallet(id);
      if (w) { w.name = data.name; w.kind = data.kind; w.currency = data.currency; w.opening = data.opening; w.note = data.note; }
      saved = w;
      toast('Wallet updated');
    } else {
      data.id = Store.uid();
      state.wallets.push(data);
      saved = data;
      toast('Wallet added');
    }
    resetWalletForm();
    commit();
    if (saved) Cloud.saveWallet(saved);
  });

  $('wallet-cancel').addEventListener('click', resetWalletForm);

  $('wallet-list').addEventListener('click', function (event) {
    var edit = event.target.getAttribute('data-edit-wallet');
    var del = event.target.getAttribute('data-delete-wallet');
    if (edit) editWallet(edit);
    if (del) {
      var w = Money.wallet(del);
      var used = state.transactions.filter(function (t) { return t.walletId === del || t.toWalletId === del; }).length;
      var msg = used
        ? 'Delete "' + w.name + '" and its ' + used + ' records?'
        : 'Delete "' + w.name + '"?';
      if (!confirm(msg)) return;
      var orphans = state.transactions.filter(function (t) { return t.walletId === del || t.toWalletId === del; });
      state.wallets = state.wallets.filter(function (x) { return x.id !== del; });
      state.transactions = state.transactions.filter(function (t) { return t.walletId !== del && t.toWalletId !== del; });
      if ($('wallet-id').value === del) resetWalletForm();
      toast('Wallet deleted');
      commit();
      orphans.forEach(function (t) { Cloud.deleteTx(t.id); });
      Cloud.deleteWallet(del);
    }
  });

  /* ---------------- record form ---------------- */

  function updateAmountHints() {
    var from = Money.wallet($('tx-wallet').value);
    var to = Money.wallet($('tx-to-wallet').value);
    $('tx-currency-hint').textContent = from ? '(' + from.currency + ')' : '';
    $('tx-received-hint').textContent = to ? '(' + to.currency + ')' : '';
    var isTransfer = $('tx-type').value === 'transfer';
    var crossCurrency = isTransfer && from && to && from.currency !== to.currency;
    $('tx-received-wrap').hidden = !crossCurrency;
    if (!crossCurrency) {
      $('tx-received').placeholder = '0.00';
      return;
    }
    var suggestion = Money.convert(Number($('tx-amount').value) || 0, from.currency, to.currency);
    $('tx-received').placeholder = suggestion
      ? Number(suggestion.toFixed(2)) + ' at your rate'
      : '0.00';
  }

  function applyTypeUI() {
    var type = $('tx-type').value;
    var isTransfer = type === 'transfer';
    $('tx-to-wrap').hidden = !isTransfer;
    $('tx-category-wrap').hidden = isTransfer;
    $('tx-place-wrap').hidden = isTransfer;
    $('tx-wallet-label').textContent = type === 'income' ? 'Into wallet' : 'From wallet';
    $('tx-place').placeholder = type === 'income' ? 'Where it came from (work, gift…)' : 'Globus supermarket';
    updateAmountHints();
  }

  function resetTxForm() {
    $('tx-form').reset();
    $('tx-id').value = '';
    $('tx-date').value = today();
    $('tx-form-title').textContent = 'Write a record';
    $('tx-submit').textContent = 'Save record';
    $('tx-cancel').hidden = true;
    applyTypeUI();
  }

  function editTx(id) {
    var t = null;
    state.transactions.forEach(function (x) { if (x.id === id) t = x; });
    if (!t) return;
    $('tx-id').value = t.id;
    $('tx-type').value = t.type;
    applyTypeUI();
    $('tx-wallet').value = t.walletId;
    if (t.toWalletId) $('tx-to-wallet').value = t.toWalletId;
    $('tx-amount').value = t.amount;
    $('tx-received').value = t.received || '';
    if (t.category) $('tx-category').value = t.category;
    $('tx-place').value = t.place;
    $('tx-date').value = t.date;
    $('tx-note').value = t.note;
    $('tx-form-title').textContent = 'Edit record';
    $('tx-submit').textContent = 'Save changes';
    $('tx-cancel').hidden = false;
    updateAmountHints();
    showTab('spending');
    $('tx-amount').focus();
  }

  $('tx-form').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!state.wallets.length) {
      toast('Add a wallet first');
      showTab('wallets');
      return;
    }
    var type = $('tx-type').value;
    var walletId = $('tx-wallet').value;
    var toWalletId = type === 'transfer' ? $('tx-to-wallet').value : '';
    var amount = Math.abs(Number($('tx-amount').value) || 0);
    if (!amount) { toast('Write an amount'); return; }
    if (type === 'transfer' && walletId === toWalletId) { toast('Pick two different wallets'); return; }

    var from = Money.wallet(walletId);
    var to = Money.wallet(toWalletId);
    var received = 0;
    if (type === 'transfer') {
      received = Math.abs(Number($('tx-received').value) || 0);
      if (!received) received = from && to ? Money.convert(amount, from.currency, to.currency) : amount;
    }

    var record = {
      type: type,
      walletId: walletId,
      toWalletId: toWalletId,
      amount: amount,
      received: received,
      category: type === 'transfer' ? '' : $('tx-category').value,
      place: type === 'transfer' ? '' : $('tx-place').value.trim(),
      date: $('tx-date').value || today(),
      note: $('tx-note').value.trim()
    };

    var id = $('tx-id').value;
    var savedTx;
    if (id) {
      state.transactions.forEach(function (t) {
        if (t.id !== id) return;
        Object.keys(record).forEach(function (k) { t[k] = record[k]; });
        savedTx = t;
      });
      toast('Record updated');
    } else {
      record.id = Store.uid();
      state.transactions.push(record);
      savedTx = record;
      toast('Record saved');
    }
    resetTxForm();
    commit();
    if (savedTx) Cloud.saveTx(savedTx);
  });

  $('tx-cancel').addEventListener('click', resetTxForm);
  $('tx-type').addEventListener('change', applyTypeUI);
  $('tx-wallet').addEventListener('change', updateAmountHints);
  $('tx-to-wallet').addEventListener('change', updateAmountHints);
  $('tx-amount').addEventListener('input', updateAmountHints);

  function handleTxClicks(event) {
    var edit = event.target.getAttribute('data-edit-tx');
    var del = event.target.getAttribute('data-delete-tx');
    if (edit) editTx(edit);
    if (del) {
      if (!confirm('Delete this record?')) return;
      state.transactions = state.transactions.filter(function (t) { return t.id !== del; });
      if ($('tx-id').value === del) resetTxForm();
      toast('Record deleted');
      commit();
      Cloud.deleteTx(del);
    }
  }
  $('tx-list').addEventListener('click', handleTxClicks);
  $('recent-list').addEventListener('click', handleTxClicks);

  ['filter-text', 'filter-wallet', 'filter-category', 'filter-type'].forEach(function (id) {
    $(id).addEventListener('input', renderSpending);
    $(id).addEventListener('change', renderSpending);
  });
  $('spent-range').addEventListener('change', renderCategoryBars);

  /* ---------------- rates, categories, base currency ---------------- */

  $('base-currency').addEventListener('change', function () {
    state.baseCurrency = this.value;
    commit();
    Cloud.saveSettings(state);
  });

  $('rates-list').addEventListener('change', function (event) {
    var code = event.target.getAttribute('data-rate');
    if (!code) return;
    var value = Number(event.target.value);
    if (!(value > 0)) { toast('Rate must be above zero'); renderRates(); return; }
    var c = Money.currency(code);
    var baseAnchor = Money.currency(state.baseCurrency);
    if (c && baseAnchor) c.rate = value * baseAnchor.rate;
    toast('Rate updated');
    commit();
    if (c) Cloud.saveCurrency(c);
  });

  $('rates-list').addEventListener('click', function (event) {
    var code = event.target.getAttribute('data-delete-currency');
    if (!code) return;
    if (code === Store.ANCHOR) { toast('USD is the reference currency and stays'); return; }
    state.currencies = state.currencies.filter(function (c) { return c.code !== code; });
    toast(code + ' removed');
    commit();
    Cloud.deleteCurrency(code);
  });

  $('currency-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var code = $('new-currency-code').value.trim().toUpperCase();
    var name = $('new-currency-name').value.trim() || code;
    var rate = Number($('new-currency-rate').value);
    if (!code || !(rate > 0)) { toast('Write a code and a rate'); return; }
    if (state.currencies.some(function (c) { return c.code === code; })) { toast(code + ' already exists'); return; }
    var baseAnchor = Money.currency(state.baseCurrency);
    var added = { code: code, name: name, rate: rate * (baseAnchor ? baseAnchor.rate : 1) };
    state.currencies.push(added);
    this.reset();
    toast(code + ' added');
    commit();
    Cloud.saveCurrency(added);
  });

  $('category-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var name = $('new-category').value.trim();
    if (!name) return;
    if (state.categories.indexOf(name) > -1) { toast('Already there'); return; }
    state.categories.push(name);
    this.reset();
    toast('Category added');
    commit();
    Cloud.saveSettings(state);
  });

  $('category-list').addEventListener('click', function (event) {
    var name = event.target.getAttribute('data-delete-category');
    if (!name) return;
    var used = state.transactions.filter(function (t) { return t.category === name; }).length;
    if (used && !confirm(used + ' records use "' + name + '". Remove the category anyway? The records keep the old name.')) return;
    state.categories = state.categories.filter(function (c) { return c !== name; });
    toast('Category removed');
    commit();
    Cloud.saveSettings(state);
  });

  /* ---------------- data tab ---------------- */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  $('export-json').addEventListener('click', function () {
    download('moneymap-backup-' + today() + '.json', JSON.stringify(state, null, 2), 'application/json');
    toast('Backup downloaded');
  });

  $('export-csv').addEventListener('click', function () {
    var rows = [['date', 'type', 'amount', 'currency', 'in_' + state.baseCurrency, 'wallet', 'wallet_kind', 'to_wallet', 'category', 'where', 'note']];
    state.transactions.slice().sort(byDateDesc).forEach(function (t) {
      var w = Money.wallet(t.walletId);
      var to = Money.wallet(t.toWalletId);
      var code = w ? w.currency : state.baseCurrency;
      rows.push([
        t.date, t.type, t.amount, code,
        Money.convert(t.amount, code).toFixed(2),
        w ? w.name : '', w ? w.kind : '', to ? to.name : '',
        t.category, t.place, t.note
      ]);
    });
    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell == null ? '' : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
    download('moneymap-records-' + today() + '.csv', csv, 'text/csv');
    toast('CSV downloaded');
  });

  $('import-json').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        state = Store.replace(JSON.parse(reader.result));
        applyTheme();
        resetWalletForm();
        resetTxForm();
        renderAll();
        toast('Backup restored');
        if (Cloud.session()) Cloud.pushAll(state).then(renderAccount);
      } catch (err) {
        toast('That file is not a MoneyMap backup');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  });

  $('reset-all').addEventListener('click', function () {
    var signedIn = !!Cloud.session();
    var question = signedIn
      ? 'Erase every wallet and record — on this device AND in your account? This cannot be undone.'
      : 'Erase every wallet and record from this browser?';
    if (!confirm(question)) return;
    state = Store.reset();
    resetWalletForm();
    resetTxForm();
    renderAll();
    toast('Everything erased');
    if (signedIn) Cloud.eraseCloud().then(renderAccount);
  });

  /* ---------------- tabs & theme ---------------- */

  function showTab(name) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-tab') === name);
    }
    var panels = document.querySelectorAll('.panel');
    for (var j = 0; j < panels.length; j++) {
      panels[j].classList.toggle('is-active', panels[j].id === 'panel-' + name);
    }
  }

  $('tabs').addEventListener('click', function (event) {
    var name = event.target.getAttribute('data-tab');
    if (name) showTab(name);
  });

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    $('theme-toggle').textContent = state.theme === 'dark' ? '🌙' : '☀️';
  }

  $('theme-toggle').addEventListener('click', function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    Store.save();
    Cloud.saveSettings(state);
  });

  /* ---------------- account ---------------- */

  var SYNC_LABEL = {
    saved: 'Saved to your account',
    syncing: 'Saving\u2026',
    offline: 'Offline \u2014 saved on this device',
    error: 'Not saved yet',
    'signed-out': ''
  };

  function renderAccount() {
    var user = Cloud.configured ? Cloud.user() : null;
    var status = Cloud.status();
    var pending = Cloud.pendingCount();

    $('sign-in').hidden = !!user || !Cloud.configured;
    $('user-chip').hidden = !user;
    if (user) {
      $('user-name').textContent = user.name;
      $('user-email').textContent = user.email;
      var avatar = $('user-avatar');
      avatar.hidden = !user.avatar;
      if (user.avatar) avatar.src = user.avatar;
    }

    var pill = $('sync-pill');
    pill.hidden = !user;
    if (user) {
      var label = SYNC_LABEL[status] || '';
      if (status === 'syncing' && pending) label = 'Saving ' + pending + ' change' + (pending === 1 ? '' : 's') + '\u2026';
      if (status === 'offline' && pending) label = pending + ' change' + (pending === 1 ? '' : 's') + ' waiting for the network';
      pill.textContent = label;
      pill.className = 'sync-pill is-' + status;
      pill.title = Cloud.statusDetail() || label;
    }

    renderAccountCard(user, status, pending);
  }

  function renderAccountCard(user, status, pending) {
    var lead = $('account-lead');
    var actions = $('account-actions');
    var note = $('account-status');
    var onFile = global.location.protocol === 'file:';

    if (!Cloud.configured) {
      note.textContent = 'no project configured';
      lead.innerHTML = 'This copy has no Supabase project set, so sign-in is switched off and everything ' +
        'stays in this browser. Put your own project URL and publishable key in ' +
        '<code>assets/js/config.js</code> to turn saving on.';
      actions.innerHTML = '';
      return;
    }

    if (!user) {
      note.textContent = 'not signed in';
      lead.innerHTML = 'Your book is saved <strong>in this browser only</strong>. Clearing your browser data, ' +
        'or losing this device, loses it. Sign in with Google to also keep it in your own private rows ' +
        'in the database \u2014 readable by your account and nothing else.' +
        (onFile ? '<br /><br /><strong>Note:</strong> the app is open as a local file. Google sign-in needs it ' +
          'served over http \u2014 run <code>npx http-server .</code> in this folder and open the address it prints.' : '');
      actions.innerHTML = onFile ? '' :
        '<button type="button" class="btn primary" id="account-sign-in">Sign in with Google</button>';
      if (!onFile) $('account-sign-in').addEventListener('click', Cloud.signIn);
      return;
    }

    var detail = Cloud.statusDetail();
    note.textContent = SYNC_LABEL[status] || '';
    lead.innerHTML = 'Signed in as <strong>' + esc(user.email || user.name) + '</strong>. Every change is written ' +
      'to this device first and then to your account, so nothing is lost if the network drops.' +
      (pending ? ' <strong>' + pending + '</strong> change' + (pending === 1 ? ' is' : 's are') + ' still waiting to go up.' : '') +
      (status === 'error' && detail ? '<br /><br /><strong>Last problem:</strong> ' + esc(detail) : '');
    actions.innerHTML =
      '<button type="button" class="btn" id="account-push">Save everything again now</button>' +
      '<button type="button" class="btn" id="account-pull">Reload from my account</button>' +
      '<button type="button" class="btn ghost" id="account-sign-out">Sign out</button>';

    $('account-push').addEventListener('click', function () {
      Cloud.pushAll(state).then(function () { toast('Everything sent to your account'); renderAccount(); });
    });
    $('account-pull').addEventListener('click', function () {
      if (!confirm('Replace what is on this device with the version in your account?')) return;
      Cloud.pull().then(function (book) {
        state = Store.adopt(book);
        applyTheme();
        resetWalletForm();
        resetTxForm();
        renderAll();
        toast('Loaded from your account');
      }).catch(function () { toast('Could not reach your account'); });
    });
    $('account-sign-out').addEventListener('click', doSignOut);
  }

  function doSignOut() {
    if (Cloud.pendingCount() &&
      !confirm(Cloud.pendingCount() + ' change(s) have not reached your account yet. Sign out anyway?')) return;
    Cloud.signOut();
    renderAccount();
    toast('Signed out \u2014 this device keeps its own copy');
  }

  $('sign-in').addEventListener('click', Cloud.signIn);
  $('sign-out').addEventListener('click', doSignOut);

  /* Decide what to do when a session is present: adopt the account's book,
     upload this device's book, or ask when both hold real data. */
  function syncOnStart(justSignedIn) {
    return Cloud.pull().then(function (book) {
      var localHasData = !state.isSample && (state.wallets.length || state.transactions.length);

      if (book.isEmpty) {
        if (state.isSample) {
          state = Store.reset();
          applyTheme();
          resetWalletForm();
          resetTxForm();
          renderAll();
          toast('Signed in \u2014 your account is empty, add your wallets');
          return Cloud.pushAll(state);
        }
        return Cloud.pushAll(state).then(function () {
          toast('This device\u2019s book is now saved to your account');
        });
      }

      if (localHasData) {
        var keepCloud = confirm(
          'Your account already holds ' + book.wallets.length + ' wallets and ' +
          book.transactions.length + ' records, and this device has its own unsaved book.\n\n' +
          'OK \u2014 use the account version (this device\u2019s book is replaced).\n' +
          'Cancel \u2014 upload this device\u2019s book instead.');
        if (!keepCloud) {
          return Cloud.pushAll(state).then(function () { toast('This device\u2019s book was uploaded'); });
        }
      }

      state = Store.adopt(book);
      applyTheme();
      resetWalletForm();
      resetTxForm();
      renderAll();
      if (justSignedIn) toast('Signed in \u2014 your book is here');
      return Cloud.flush();
    }).catch(function () {
      toast('Signed in, but your account could not be reached \u2014 working on this device');
    }).then(renderAccount);
  }

  /* ---------------- start ---------------- */

  applyTheme();
  resetWalletForm();
  resetTxForm();
  renderAll();

  if (Cloud.configured) {
    Cloud.onChange(renderAccount);
    var justSignedIn = Cloud.init();
    renderAccount();
    if (Cloud.session()) syncOnStart(justSignedIn);
  } else {
    renderAccount();
  }

  global.MoneyMap = {
    state: function () { return state; },
    showTab: showTab,
    renderAll: renderAll
  };
})(window);
