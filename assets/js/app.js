/* Vaultline — screens, forms and everything the user touches. */

import * as Store from './store.js?v=3';
import * as Money from './money.js?v=3';
import { Cloud } from './cloud.js?v=3';
import { search as searchCurrencies, lookup as lookupCurrency } from './currencies.js?v=3';

const $ = (id) => document.getElementById(id);

/* Bind through this rather than $('x').addEventListener directly. A missing
   element then costs one warning instead of throwing during module evaluation,
   which would stop every later listener from binding and leave the whole page
   inert. That is exactly how a stale cached script breaks an app. */
function on(id, event, handler, options) {
  const el = $(id);
  if (!el) {
    console.warn(`Vaultline: no #${id} to bind ${event} to`);
    return;
  }
  el.addEventListener(event, handler, options);
}
let state = Store.load();

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

/* An empty screen is the first thing a new person sees. It should say what to
   do next, not just report that there is nothing. */
function emptyState(mark, title, hint, action) {
  return `
    <div class="empty-state">
      <span class="empty-mark" aria-hidden="true">${mark}</span>
      <p class="empty-title">${esc(title)}</p>
      <p class="empty-hint">${esc(hint)}</p>
      ${action ? `<button type="button" class="btn primary" ${action.attr}>${esc(action.label)}</button>` : ''}
    </div>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Money should land rather than blink into place. Each figure counts from
   whatever it was showing to its new value, so a change is felt, not missed. */
function setNumber(el, value, code) {
  const shown = code || state.baseCurrency;
  const render = (v) => (code ? Money.format(v, code) : Money.formatBase(v));

  /* First paint counts up from zero — that is the moment worth animating.
     Changing the display currency is the one case that must NOT count: the
     figures either side are in different money, so the in-between frames would
     read as an amount you do not have. Those snap instead. */
  const sameCurrency = el.__code === undefined || el.__code === shown;
  const from = typeof el.__value === 'number' && sameCurrency ? el.__value : 0;
  el.__value = value;
  el.__code = shown;

  if (!sameCurrency || from === value || reduceMotion()) {
    cancelAnimationFrame(el.__frame);
    el.textContent = render(value);
    return;
  }

  cancelAnimationFrame(el.__frame);
  const started = performance.now();
  const span = value - from;
  const step = (now) => {
    const t = Math.min(1, (now - started) / 620);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = render(from + span * eased);
    if (t < 1) el.__frame = requestAnimationFrame(step);
  };
  el.__frame = requestAnimationFrame(step);
}

const today = () => new Date().toISOString().slice(0, 10);

function niceDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  try {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (err) {
    return iso;
  }
}

let toastTimer = null;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* Every change goes through here: mark the book as real, keep the device copy,
   redraw. The cloud write is fired separately by each caller. */
function commit() {
  Store.markReal();
  if (!Store.save()) toast('Could not save on this device — storage is full or blocked');
  renderAll();
}

/* ------------------------------------------------------------------ */
/* dropdowns                                                           */
/* ------------------------------------------------------------------ */

function fillCurrencySelects() {
  const options = state.currencies
    .map((c) => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`)
    .join('');
  for (const id of ['base-currency', 'wallet-currency']) {
    const el = $(id);
    const keep = el.value;
    /* The wallet form gets a way out to the finder, so a currency you have not
       added yet is never a dead end. */
    el.innerHTML = id === 'wallet-currency'
      ? `${options}<option value="__find">+ Add another currency…</option>`
      : options;
    el.value = state.currencies.some((c) => c.code === keep) ? keep : state.baseCurrency;
  }
  $('base-currency').value = state.baseCurrency;
}

function walletOptions(selected) {
  return state.wallets.map((w) => {
    const mark = w.kind === 'card' ? 'Card' : 'Cash';
    return `<option value="${esc(w.id)}"${w.id === selected ? ' selected' : ''}>` +
      `${esc(w.name)} · ${esc(w.currency)} · ${mark}</option>`;
  }).join('');
}

function fillWalletSelects() {
  const from = $('tx-wallet');
  const to = $('tx-to-wallet');
  const filter = $('filter-wallet');
  const keep = { from: from.value, to: to.value, filter: filter.value };

  const empty = '<option value="">Add a wallet first</option>';
  from.innerHTML = state.wallets.length ? walletOptions(keep.from) : empty;
  to.innerHTML = state.wallets.length ? walletOptions(keep.to) : empty;
  filter.innerHTML = `<option value="">All wallets</option>${walletOptions(keep.filter)}`;

  if (keep.from) from.value = keep.from;
  if (keep.to) to.value = keep.to;
  filter.value = keep.filter;
  updateAmountHints();
}

function fillCategorySelects() {
  const options = state.categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  const cat = $('tx-category');
  const keepCat = cat.value;
  cat.innerHTML = options;
  if (state.categories.includes(keepCat)) cat.value = keepCat;

  const filter = $('filter-category');
  const keepFilter = filter.value;
  filter.innerHTML = `<option value="">All categories</option>${options}`;
  filter.value = keepFilter;

  const budget = $('budget-category');
  const keepBudget = budget.value;
  budget.innerHTML = options;
  if (state.categories.includes(keepBudget)) budget.value = keepBudget;

  const places = [...new Set(state.transactions.map((t) => t.place).filter(Boolean))].sort();
  $('place-suggestions').innerHTML = places.map((p) => `<option value="${esc(p)}"></option>`).join('');
}

/* ------------------------------------------------------------------ */
/* vault screen                                                        */
/* ------------------------------------------------------------------ */

function renderVault() {
  const t = Money.totals();
  const info = Money.insights();

  setNumber($('total-value'), t.total);
  $('total-sub').textContent = state.wallets.length
    ? `${state.wallets.length} wallets · ${Object.keys(t.byCurrency).length} currencies`
    : 'add your first wallet to begin';
  setNumber($('total-cash'), t.cash);
  setNumber($('total-card'), t.card);

  const positive = Math.max(t.cash, 0) + Math.max(t.card, 0);
  const cashShare = positive > 0 ? (Math.max(t.cash, 0) / positive) * 100 : 50;
  $('split-fill').style.width = `${cashShare}%`;

  setNumber($('tile-spent'), info.spentThis);
  $('tile-spent-note').textContent = info.recordCount
    ? `${info.recordCount} record${info.recordCount === 1 ? '' : 's'} this month`
    : 'nothing written yet this month';

  setNumber($('tile-earned'), info.earnedThis);
  $('tile-earned-note').textContent = 'money in, this month';

  setNumber($('tile-saved'), info.saved);
  $('tile-saved-note').textContent = info.saved >= 0 ? 'more came in than went out' : 'more went out than came in';

  setNumber($('tile-perday'), info.perDay);
  $('tile-perday-note').textContent = info.daysLeft > 0
    ? `about ${Money.formatBase(info.projected)} by month end`
    : 'the month is done';

  renderCurrencyBars(t);
  renderCategoryBars();
  renderInsights(info);

  const recent = state.transactions.slice().sort(byDateDesc).slice(0, 6);
  renderRecords($('recent-list'), recent, {
    title: 'No records yet',
    hint: 'Write what you spent, from which wallet, and where it went. Everything else follows from that.',
    action: { label: 'Write a record', attr: 'data-goto="records" data-focus="tx-amount"' }
  });
}

function renderCurrencyBars(t) {
  const rows = Object.values(t.byCurrency).sort((a, b) => b.base - a.base);
  const host = $('currency-bars');
  if (!rows.length) {
    host.innerHTML = emptyState('◇', 'Nothing to show yet',
      'Add a wallet and this fills with your money, split by currency.',
      { label: 'Add a wallet', attr: 'data-goto="wallets" data-focus="wallet-name"' });
    return;
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.base)), 1);
  host.innerHTML = rows.map((row, i) => {
    const width = Math.max(2, Math.round((Math.abs(row.base) / max) * 100));
    const parts = [];
    if (row.cash) parts.push(`Cash ${Money.format(row.cash, row.currency)}`);
    if (row.card) parts.push(`Card ${Money.format(row.card, row.currency)}`);
    return `
      <div class="bar" style="--i:${i}">
        <div class="bar-name">${esc(row.currency)}<small>${esc(parts.join('  ·  ') || 'empty')}</small></div>
        <div class="bar-value">${esc(Money.format(row.raw, row.currency))}<small>= ${esc(Money.formatBase(row.base))}</small></div>
        <div class="bar-track"><div class="bar-fill${row.card ? '' : ' green'}" style="width:${width}%"></div></div>
      </div>`;
  }).join('');
}

function renderCategoryBars() {
  const rows = Money.spendingByCategory($('range-select').value);
  const host = $('category-bars');
  if (!rows.length) {
    host.innerHTML = '<p class="empty">Nothing spent in this period.</p>';
    return;
  }
  const max = rows[0].base || 1;
  const total = rows.reduce((sum, r) => sum + r.base, 0);
  host.innerHTML = rows.map((row, i) => {
    const width = Math.max(2, Math.round((row.base / max) * 100));
    const share = total ? (row.base / total) * 100 : 0;
    const shareText = share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;
    const sub = row.topPlace ? `mostly ${row.topPlace}` : `${row.count} records`;
    return `
      <div class="bar" style="--i:${i}">
        <div class="bar-name">${esc(row.label)}<small>${esc(sub)}</small></div>
        <div class="bar-value">${esc(Money.formatBase(row.base))}<small>${shareText}</small></div>
        <div class="bar-track"><div class="bar-fill rose" style="width:${width}%"></div></div>
      </div>`;
  }).join('');
}

function renderInsights(info) {
  const lines = [];

  if (info.biggest) {
    lines.push(['◆', `Biggest single spend this month was <b>${esc(Money.formatBase(info.biggest.base))}</b> at ${esc(info.biggest.place)}.`]);
  }
  if (info.topPlace) {
    lines.push(['◆', `Most money went to <b>${esc(info.topPlace.label)}</b> — ${esc(Money.formatBase(info.topPlace.base))} across ${info.topPlace.count} record${info.topPlace.count === 1 ? '' : 's'}.`]);
  }
  if (info.changeVsLastMonth !== null) {
    const pct = Math.abs(Math.round(info.changeVsLastMonth * 100));
    const word = info.changeVsLastMonth > 0 ? 'more' : 'less';
    lines.push([info.changeVsLastMonth > 0 ? '▲' : '▼',
      `You are spending <b>${pct}% ${word}</b> than by this point last month.`]);
  }
  if (info.daysLeft > 0 && info.perDay > 0) {
    lines.push(['◆', `At this pace the month ends around <b>${esc(Money.formatBase(info.projected))}</b>, with ${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'} to go.`]);
  }
  const overBudget = Money.budgetProgress().filter((b) => b.state !== 'fine');
  for (const b of overBudget.slice(0, 2)) {
    lines.push([b.state === 'over' ? '▲' : '◆', b.state === 'over'
      ? `<b>${esc(b.category)}</b> is over its limit by ${esc(Money.formatBase(-b.left))}.`
      : `<b>${esc(b.category)}</b> has only ${esc(Money.formatBase(b.left))} left this month.`]);
  }

  const host = $('insight-list');
  host.innerHTML = lines.length
    ? lines.map(([icon, text]) => `<li><span class="insight-icon">${icon}</span><span>${text}</span></li>`).join('')
    : '<li><span class="insight-icon">◆</span><span>Write a few records and Vaultline will start pointing things out here.</span></li>';
}

/* ------------------------------------------------------------------ */
/* wallets                                                             */
/* ------------------------------------------------------------------ */

function renderWallets() {
  const host = $('wallet-list');
  if (!state.wallets.length) {
    host.innerHTML = emptyState('◇', 'No wallets yet',
      'A wallet is any place your money sits — the cash in your pocket, a card, dollars kept at home.',
      { label: 'Name your first wallet', attr: 'data-focus="wallet-name"' });
    return;
  }
  host.innerHTML = state.wallets.map((w, i) => {
    const balance = Money.balanceOf(w.id);
    const converted = w.currency !== state.baseCurrency
      ? `<div class="wallet-converted">≈ ${esc(Money.formatBase(Money.convert(balance, w.currency)))}</div>`
      : '';
    return `
      <article class="wallet ${w.kind === 'card' ? 'is-card' : ''}" style="--i:${i}">
        <span class="wallet-sheen" aria-hidden="true"></span>
        <div class="wallet-top">
          <span class="wallet-name">${esc(w.name)}</span>
          <span class="wallet-kind">${w.kind === 'card' ? 'Card' : 'Cash'}</span>
        </div>
        <div class="wallet-balance">${esc(Money.format(balance, w.currency))}</div>
        ${converted}
        ${w.note ? `<div class="wallet-note">${esc(w.note)}</div>` : ''}
        <div class="wallet-actions">
          <button type="button" class="btn tiny" data-edit-wallet="${esc(w.id)}">Edit</button>
          <button type="button" class="btn tiny danger" data-delete-wallet="${esc(w.id)}">Delete</button>
        </div>
      </article>`;
  }).join('');
}

/* ------------------------------------------------------------------ */
/* records                                                             */
/* ------------------------------------------------------------------ */

function byDateDesc(a, b) {
  if (a.date === b.date) return a.id < b.id ? 1 : -1;
  return a.date < b.date ? 1 : -1;
}

function describe(t) {
  const from = Money.wallet(t.walletId);
  const to = Money.wallet(t.toWalletId);
  if (t.type === 'transfer') {
    const bits = ['Moved money'];
    if (from && to && from.currency !== to.currency) {
      bits.push(`arrived as ${Money.format(t.received || t.amount, to.currency)}`);
    }
    bits.push(niceDate(t.date));
    if (t.note) bits.push(t.note);
    return {
      title: `${from ? from.name : '?'} → ${to ? to.name : '?'}`,
      meta: bits.join(' · ')
    };
  }
  const bits = [];
  if (t.category) bits.push(t.category);
  if (from) bits.push(from.name);
  bits.push(niceDate(t.date));
  if (t.note) bits.push(t.note);
  return {
    title: t.place || t.category || (t.type === 'income' ? 'Money in' : 'Spending'),
    meta: bits.join(' · ')
  };
}

const RECORD_MARK = { expense: ['−', 'out'], income: ['+', 'in'], transfer: ['⇄', 'move'] };

function renderRecords(host, list, emptyText) {
  if (!list.length) {
    host.innerHTML = emptyText.action
      ? emptyState('▤', emptyText.title, emptyText.hint, emptyText.action)
      : `<p class="empty">${esc(emptyText)}</p>`;
    return;
  }
  host.innerHTML = list.map((t, i) => {
    const w = Money.wallet(t.walletId);
    const code = w ? w.currency : state.baseCurrency;
    const d = describe(t);
    const [mark, tone] = RECORD_MARK[t.type];
    const sign = t.type === 'expense' ? '−' : t.type === 'income' ? '+' : '';
    const converted = code !== state.baseCurrency
      ? `<small>${esc(Money.formatBase(Money.convert(t.amount, code)))}</small>`
      : '';
    return `
      <div class="record" style="--i:${i}">
        <span class="record-icon ${tone}">${mark}</span>
        <div class="record-main" data-edit-tx="${esc(t.id)}" role="button" tabindex="0"
          aria-label="Edit ${esc(d.title)}">
          <strong>${esc(d.title)}</strong>
          <span class="record-meta">${esc(d.meta)}</span>
        </div>
        <div class="record-amount ${t.type === 'transfer' ? '' : tone}">${sign}${esc(Money.format(t.amount, code))}${converted}</div>
        <div class="record-actions">
          <button type="button" class="btn tiny" data-edit-tx="${esc(t.id)}" aria-label="Edit record">
            <span class="on-wide">Edit</span><span class="on-narrow">✎</span>
          </button>
          <button type="button" class="btn tiny danger" data-delete-tx="${esc(t.id)}">×</button>
        </div>
      </div>`;
  }).join('');
}

function filteredRecords() {
  const text = $('filter-text').value.trim().toLowerCase();
  const walletId = $('filter-wallet').value;
  const category = $('filter-category').value;
  const type = $('filter-type').value;

  return state.transactions.filter((t) => {
    if (type && t.type !== type) return false;
    if (category && t.category !== category) return false;
    if (walletId && t.walletId !== walletId && t.toWalletId !== walletId) return false;
    if (text) {
      const w = Money.wallet(t.walletId);
      const hay = [t.place, t.note, t.category, w ? w.name : ''].join(' ').toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  }).sort(byDateDesc);
}

function renderRecordsScreen() {
  const list = filteredRecords();
  let spent = 0;
  let got = 0;
  for (const t of list) {
    const w = Money.wallet(t.walletId);
    const base = Money.convert(t.amount, w ? w.currency : state.baseCurrency);
    if (t.type === 'expense') spent += base;
    if (t.type === 'income') got += base;
  }
  $('records-summary').textContent =
    `${list.length} records · spent ${Money.formatBase(spent)} · got ${Money.formatBase(got)}`;
  renderRecords($('records-list'), list, 'No records match these filters.');
}

/* ------------------------------------------------------------------ */
/* budgets                                                             */
/* ------------------------------------------------------------------ */

function renderBudgets() {
  $('budget-currency-hint').textContent = `per month, in ${state.baseCurrency}`;
  const rows = Money.budgetProgress();
  const host = $('budget-list');
  if (!rows.length) {
    host.innerHTML = emptyState('◈', 'No limits set',
      'Pick a category above and say what it may cost each month. The bar warns you before you pass it.',
      { label: 'Set a limit', attr: 'data-focus="budget-limit"' });
    return;
  }
  host.innerHTML = rows.map((b, i) => {
    const width = Math.min(100, Math.round(b.share * 100));
    const stateText = b.state === 'over'
      ? `over by ${Money.formatBase(-b.left)}`
      : b.state === 'close'
        ? `${Money.formatBase(b.left)} left — getting close`
        : `${Money.formatBase(b.left)} left`;
    return `
      <div class="budget is-${b.state}" style="--i:${i}">
        <div class="budget-top">
          <span class="budget-name">${esc(b.category)}</span>
          <span class="budget-figures"><b>${esc(Money.formatBase(b.spent))}</b> of ${esc(Money.formatBase(b.limitBase))}</span>
        </div>
        <div class="budget-track"><div class="budget-fill" style="width:${width}%"></div></div>
        <div class="budget-foot">
          <span class="state">${esc(stateText)}</span>
          <span>
            <button type="button" class="link-btn" data-delete-budget="${esc(b.id)}">Remove limit</button>
          </span>
        </div>
      </div>`;
  }).join('');
}

/* ------------------------------------------------------------------ */
/* rates & categories                                                  */
/* ------------------------------------------------------------------ */

function renderRates() {
  $('rates-base').textContent = state.baseCurrency;
  $('rates-count').textContent = `— ${state.currencies.length} of 150+, add any you need`;
  const sorted = state.currencies.slice().sort((a, b) => {
    if (a.code === state.baseCurrency) return -1;
    if (b.code === state.baseCurrency) return 1;
    return a.code.localeCompare(b.code);
  });

  $('rates-list').innerHTML = sorted.map((c) => {
    const isBase = c.code === state.baseCurrency;
    const value = Number(Money.rateInBase(c.code).toFixed(6));
    const inUse = state.wallets.some((w) => w.currency === c.code);
    const trailing = isBase || inUse
      ? `<span class="muted">${isBase ? 'base' : 'in use'}</span>`
      : `<button type="button" class="btn tiny danger" data-delete-currency="${esc(c.code)}">×</button>`;
    return `
      <div class="rate ${isBase ? 'is-base' : ''}">
        <div class="rate-code">1 ${esc(c.code)}<span class="rate-name">${esc(c.name)}</span></div>
        <input type="number" step="0.000001" min="0" value="${isBase ? 1 : value}"
          ${isBase ? 'disabled' : ''} data-rate="${esc(c.code)}" aria-label="Rate for ${esc(c.code)}" />
        ${trailing}
      </div>`;
  }).join('');

  $('category-chips').innerHTML = state.categories.length
    ? state.categories.map((c) => `<span class="chip">${esc(c)}<button type="button" title="Remove" data-delete-category="${esc(c)}">×</button></span>`).join('')
    : '<p class="empty">No categories.</p>';
}

function renderStats() {
  let bytes = 0;
  try {
    bytes = JSON.stringify(state).length;
  } catch (err) {
    bytes = 0;
  }
  $('data-stats').textContent =
    `${state.wallets.length} wallets · ${state.transactions.length} records · ` +
    `${state.currencies.length} currencies · ${state.budgets.length} budgets · ` +
    `about ${Math.max(1, Math.round(bytes / 1024))} KB on this device`;
  $('foot-note').textContent = Cloud.user()
    ? `signed in as ${Cloud.user().email}`
    : 'saving on this device only';
}

function renderAll() {
  fillCurrencySelects();
  fillWalletSelects();
  fillCategorySelects();
  renderVault();
  renderWallets();
  renderRecordsScreen();
  renderBudgets();
  renderRates();
  renderStats();
  renderAccount();
  renderLook();
}

/* ------------------------------------------------------------------ */
/* wallet form                                                         */
/* ------------------------------------------------------------------ */

function resetWalletForm() {
  $('wallet-form').reset();
  $('wallet-id').value = '';
  $('wallet-currency').value = state.baseCurrency;
  $('wallet-balance').value = '0';
  $('wallet-balance-label').textContent = 'Money in it now';
  $('wallet-form-title').textContent = 'Add a wallet';
  $('wallet-submit').textContent = 'Add wallet';
  $('wallet-cancel').hidden = true;
}

function editWallet(id) {
  const w = Money.wallet(id);
  if (!w) return;
  $('wallet-id').value = w.id;
  $('wallet-name').value = w.name;
  $('wallet-kind').value = w.kind;
  $('wallet-currency').value = w.currency;
  $('wallet-balance').value = w.opening;
  $('wallet-balance-label').textContent = 'Starting amount';
  $('wallet-note').value = w.note;
  $('wallet-form-title').textContent = 'Edit wallet';
  $('wallet-submit').textContent = 'Save wallet';
  $('wallet-cancel').hidden = false;
  showTab('wallets');
  $('wallet-name').focus();
}

on('wallet-form', 'submit', (event) => {
  event.preventDefault();
  const id = $('wallet-id').value;
  const data = {
    name: $('wallet-name').value.trim() || 'Wallet',
    kind: $('wallet-kind').value === 'card' ? 'card' : 'cash',
    currency: $('wallet-currency').value,
    opening: Number($('wallet-balance').value) || 0,
    note: $('wallet-note').value.trim()
  };

  let saved;
  if (id) {
    saved = Money.wallet(id);
    if (saved) Object.assign(saved, data);
    toast('Wallet updated');
  } else {
    saved = { id: Store.uid(), ...data };
    state.wallets.push(saved);
    toast('Wallet added');
  }
  resetWalletForm();
  commit();
  if (saved) Cloud.saveWallet(saved);
});

on('wallet-cancel', 'click', resetWalletForm);

on('wallet-currency', 'change', function () {
  if (this.value !== '__find') return;
  this.value = state.baseCurrency;
  showTab('rates');
  $('currency-search').focus();
  toast('Find the currency, then come back to the wallet');
});

on('wallet-list', 'click', (event) => {
  const edit = event.target.getAttribute('data-edit-wallet');
  const del = event.target.getAttribute('data-delete-wallet');
  if (edit) editWallet(edit);
  if (!del) return;

  const w = Money.wallet(del);
  const orphans = state.transactions.filter((t) => t.walletId === del || t.toWalletId === del);
  const question = orphans.length
    ? `Delete "${w.name}" and its ${orphans.length} record${orphans.length === 1 ? '' : 's'}?`
    : `Delete "${w.name}"?`;
  if (!confirm(question)) return;

  state.wallets = state.wallets.filter((x) => x.id !== del);
  state.transactions = state.transactions.filter((t) => t.walletId !== del && t.toWalletId !== del);
  if ($('wallet-id').value === del) resetWalletForm();
  toast('Wallet deleted');
  commit();
  orphans.forEach((t) => Cloud.deleteTx(t.id));
  Cloud.deleteWallet(del);
});

/* ------------------------------------------------------------------ */
/* record form                                                         */
/* ------------------------------------------------------------------ */

function updateAmountHints() {
  const from = Money.wallet($('tx-wallet').value);
  const to = Money.wallet($('tx-to-wallet').value);
  $('tx-currency-hint').textContent = from ? `(${from.currency})` : '';
  $('tx-received-hint').textContent = to ? `(${to.currency})` : '';

  const crossCurrency = $('tx-type').value === 'transfer' && from && to && from.currency !== to.currency;
  $('tx-received-wrap').hidden = !crossCurrency;
  if (!crossCurrency) {
    $('tx-received').placeholder = '0.00';
    return;
  }
  const suggestion = Money.convert(Number($('tx-amount').value) || 0, from.currency, to.currency);
  $('tx-received').placeholder = suggestion ? `${Number(suggestion.toFixed(2))} at your rate` : '0.00';
}

function applyTypeUI() {
  const type = $('tx-type').value;
  const isTransfer = type === 'transfer';

  for (const btn of document.querySelectorAll('#tx-type-choice .choice-btn')) {
    btn.classList.toggle('is-active', btn.dataset.type === type);
  }
  $('tx-to-wrap').hidden = !isTransfer;
  $('tx-category-wrap').hidden = isTransfer;
  $('tx-place-wrap').hidden = isTransfer;
  $('tx-wallet-label').textContent = type === 'income' ? 'Into wallet' : 'From wallet';
  $('tx-place').placeholder = type === 'income' ? 'Where it came from — work, a gift…' : 'Globus supermarket';
  updateAmountHints();
}

function resetTxForm() {
  $('tx-form').reset();
  $('tx-id').value = '';
  $('tx-type').value = 'expense';
  $('tx-date').value = today();
  $('tx-form-title').textContent = 'Write a record';
  $('tx-submit').textContent = 'Save record';
  $('tx-cancel').hidden = true;
  applyTypeUI();
}

function editTx(id) {
  const t = state.transactions.find((x) => x.id === id);
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
  showTab('records');
  $('tx-amount').focus();
}

on('tx-type-choice', 'click', (event) => {
  const type = event.target.dataset.type;
  if (!type) return;
  $('tx-type').value = type;
  applyTypeUI();
});

on('tx-form', 'submit', (event) => {
  event.preventDefault();
  if (!state.wallets.length) {
    toast('Add a wallet first');
    showTab('wallets');
    return;
  }

  const type = $('tx-type').value;
  const walletId = $('tx-wallet').value;
  const toWalletId = type === 'transfer' ? $('tx-to-wallet').value : '';
  const amount = Math.abs(Number($('tx-amount').value) || 0);

  if (!amount) { toast('Write an amount'); return; }
  if (type === 'transfer' && walletId === toWalletId) { toast('Pick two different wallets'); return; }

  const from = Money.wallet(walletId);
  const to = Money.wallet(toWalletId);
  let received = 0;
  if (type === 'transfer') {
    received = Math.abs(Number($('tx-received').value) || 0);
    if (!received) received = from && to ? Money.convert(amount, from.currency, to.currency) : amount;
  }

  const record = {
    type,
    walletId,
    toWalletId,
    amount,
    received,
    category: type === 'transfer' ? '' : $('tx-category').value,
    place: type === 'transfer' ? '' : $('tx-place').value.trim(),
    date: $('tx-date').value || today(),
    note: $('tx-note').value.trim()
  };

  const id = $('tx-id').value;
  let saved;
  if (id) {
    saved = state.transactions.find((t) => t.id === id);
    if (saved) Object.assign(saved, record);
    toast('Record updated');
  } else {
    saved = { id: Store.uid(), ...record };
    state.transactions.push(saved);
    toast('Record saved');
  }
  resetTxForm();
  commit();
  if (saved) Cloud.saveTx(saved);
});

on('tx-cancel', 'click', resetTxForm);
on('tx-wallet', 'change', updateAmountHints);
on('tx-to-wallet', 'change', updateAmountHints);
on('tx-amount', 'input', updateAmountHints);

function handleRecordClick(event) {
  const editTarget = event.target.closest('[data-edit-tx]');
  const delTarget = event.target.closest('[data-delete-tx]');
  const edit = editTarget && editTarget.getAttribute('data-edit-tx');
  const del = delTarget && delTarget.getAttribute('data-delete-tx');
  if (edit) editTx(edit);
  if (!del) return;
  if (!confirm('Delete this record?')) return;
  state.transactions = state.transactions.filter((t) => t.id !== del);
  if ($('tx-id').value === del) resetTxForm();
  toast('Record deleted');
  commit();
  Cloud.deleteTx(del);
}

function handleRecordKey(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target.closest('[data-edit-tx]');
  if (!target) return;
  event.preventDefault();
  editTx(target.getAttribute('data-edit-tx'));
}

for (const id of ['records-list', 'recent-list']) {
  on(id, 'click', handleRecordClick);
  on(id, 'keydown', handleRecordKey);
}

for (const id of ['filter-text', 'filter-wallet', 'filter-category', 'filter-type']) {
  on(id, 'input', renderRecordsScreen);
  on(id, 'change', renderRecordsScreen);
}
on('range-select', 'change', renderCategoryBars);

/* ------------------------------------------------------------------ */
/* budgets, rates, categories                                          */
/* ------------------------------------------------------------------ */

on('budget-form', 'submit', (event) => {
  event.preventDefault();
  const category = $('budget-category').value;
  const limit = Math.abs(Number($('budget-limit').value) || 0);
  if (!category) { toast('Add a category first'); return; }
  if (!limit) { toast('Write a limit above zero'); return; }

  const id = Store.slug(category);
  const budget = { id, category, limit, currency: state.baseCurrency };
  const existing = state.budgets.find((b) => b.id === id);
  if (existing) Object.assign(existing, budget);
  else state.budgets.push(budget);

  $('budget-limit').value = '';
  toast(`Limit set for ${category}`);
  commit();
  Cloud.saveBudget(budget);
});

on('budget-list', 'click', (event) => {
  const id = event.target.getAttribute('data-delete-budget');
  if (!id) return;
  state.budgets = state.budgets.filter((b) => b.id !== id);
  toast('Limit removed');
  commit();
  Cloud.deleteBudget(id);
});

on('base-currency', 'change', function () {
  state.baseCurrency = this.value;
  commit();
  Cloud.saveSettings(state);
});

on('rates-list', 'change', (event) => {
  const code = event.target.getAttribute('data-rate');
  if (!code) return;
  const value = Number(event.target.value);
  if (!(value > 0)) { toast('A rate must be above zero'); renderRates(); return; }

  const c = Money.currency(code);
  const baseAnchor = Money.currency(state.baseCurrency);
  if (c && baseAnchor) c.rate = value * baseAnchor.rate;
  toast('Rate updated');
  commit();
  if (c) Cloud.saveCurrency(c);
});

on('rates-list', 'click', (event) => {
  const code = event.target.getAttribute('data-delete-currency');
  if (!code) return;
  if (code === Store.ANCHOR) { toast('USD is the reference currency and stays'); return; }
  state.currencies = state.currencies.filter((c) => c.code !== code);
  toast(`${code} removed`);
  commit();
  Cloud.deleteCurrency(code);
});

/* ---------------- the currency finder ---------------- */

/* What one unit of a catalogue currency is worth in the currency totals are
   shown in. The catalogue is quoted in dollars, and so is every stored rate. */
function catalogueRateInBase(entry) {
  const baseAnchor = Money.currency(state.baseCurrency);
  return entry.rate / (baseAnchor && baseAnchor.rate > 0 ? baseAnchor.rate : 1);
}

function renderCurrencyResults() {
  const query = $('currency-search').value.trim();
  const host = $('currency-results');

  if (!query) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }

  const matches = searchCurrencies(query);
  host.hidden = false;

  if (!matches.length) {
    host.innerHTML = '<p class="finder-empty">Nothing matches that. Try the three-letter code, ' +
      'or part of the country or currency name.</p>';
    return;
  }

  host.innerHTML = matches.map((c) => {
    const already = state.currencies.some((x) => x.code === c.code);
    const worth = catalogueRateInBase(c);
    const hint = already
      ? 'already added'
      : `1 ${c.code} ≈ ${Number(worth.toPrecision(4))} ${state.baseCurrency}`;
    return `
      <button type="button" class="finder-row${already ? ' is-added' : ''}"
        ${already ? 'disabled' : `data-add-currency="${esc(c.code)}"`}>
        <span class="finder-code">${esc(c.code)}</span>
        <span class="finder-name">${esc(c.name)}</span>
        <span class="finder-hint">${esc(hint)}</span>
      </button>`;
  }).join('');
}

on('currency-search', 'input', renderCurrencyResults);
on('currency-search', 'keydown', (event) => {
  if (event.key === 'Escape') {
    $('currency-search').value = '';
    renderCurrencyResults();
  }
});

on('currency-results', 'click', (event) => {
  const button = event.target.closest('[data-add-currency]');
  if (!button) return;
  const code = button.getAttribute('data-add-currency');
  const entry = lookupCurrency(code);
  if (!entry) return;
  if (state.currencies.some((c) => c.code === entry.code)) { toast(`${entry.code} is already there`); return; }

  const added = { code: entry.code, name: entry.name, rate: entry.rate };
  state.currencies.push(added);
  $('currency-search').value = '';
  renderCurrencyResults();
  toast(`${entry.code} added — check its rate below`);
  commit();
  Cloud.saveCurrency(added);
});

on('category-form', 'submit', function (event) {
  event.preventDefault();
  const name = $('new-category').value.trim();
  if (!name) return;
  if (state.categories.includes(name)) { toast('Already there'); return; }
  state.categories.push(name);
  this.reset();
  toast('Category added');
  commit();
  Cloud.saveSettings(state);
});

on('category-chips', 'click', (event) => {
  const name = event.target.getAttribute('data-delete-category');
  if (!name) return;
  const used = state.transactions.filter((t) => t.category === name).length;
  if (used && !confirm(`${used} records use "${name}". Remove the category anyway? Those records keep the old name.`)) return;
  state.categories = state.categories.filter((c) => c !== name);
  toast('Category removed');
  commit();
  Cloud.saveSettings(state);
});

/* ------------------------------------------------------------------ */
/* backup, export, erase                                               */
/* ------------------------------------------------------------------ */

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function download(filename, text, mime) {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

on('export-json', 'click', () => {
  download(`vaultline-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
  toast('Backup downloaded');
});

/* ---------------- spreadsheet export ---------------- */

const TYPE_WORD = { expense: 'Spent', income: 'Got money', transfer: 'Moved' };

function exportColumns() {
  return [
    { header: 'Date', key: 'date', type: 'date', width: 12 },
    { header: 'Type', key: 'type', width: 11 },
    { header: 'Amount', key: 'amount', type: 'number', width: 14 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: `Amount in ${state.baseCurrency}`, key: 'base', type: 'number', width: 18 },
    { header: 'Wallet', key: 'wallet', width: 20 },
    { header: 'Wallet kind', key: 'kind', width: 12 },
    { header: 'To wallet', key: 'toWallet', width: 20 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Where', key: 'place', width: 24 },
    { header: 'Note', key: 'note', width: 30 }
  ];
}

function exportRows() {
  return state.transactions.slice().sort(byDateDesc).map((t) => {
    const w = Money.wallet(t.walletId);
    const to = Money.wallet(t.toWalletId);
    const code = w ? w.currency : state.baseCurrency;
    return {
      date: t.date,
      type: TYPE_WORD[t.type] || t.type,
      amount: t.amount,
      currency: code,
      base: Number(Money.convert(t.amount, code).toFixed(2)),
      wallet: w ? w.name : '',
      kind: w ? (w.kind === 'card' ? 'Card' : 'Cash') : '',
      toWallet: to ? to.name : '',
      category: t.category,
      place: t.place,
      note: t.note
    };
  });
}

/* A cell starting =, + or @ is run as a formula when a spreadsheet opens the
   file, so a place named "=cmd" would execute. An apostrophe in front is the
   spreadsheet way of saying "this is text". */
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

on('export-csv', 'click', () => {
  if (!state.transactions.length) { toast('No records to export yet'); return; }

  const columns = exportColumns();
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of exportRows()) {
    lines.push(columns.map((c) => csvCell(row[c.key])).join(','));
  }

  /* The byte-order mark is what stops Excel reading UTF-8 as ANSI and turning
     every accent and Cyrillic letter into mojibake. CRLF is what it expects. */
  const blob = new Blob(['\uFEFF', lines.join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' });
  downloadBlob(`vaultline-${today()}.csv`, blob);
  toast('CSV downloaded');
});

on('import-json', 'change', (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = Store.replace(JSON.parse(reader.result));
      applyTheme();
      resetWalletForm();
      resetTxForm();
      renderAll();
      toast('Backup restored');
      if (Cloud.user()) Cloud.pushAll(state).then(renderAccount);
    } catch (err) {
      toast('That file is not a Vaultline backup');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
});

on('reset-all', 'click', () => {
  const signedIn = Boolean(Cloud.user());
  const question = signedIn
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

/* ------------------------------------------------------------------ */
/* account panel                                                       */
/* ------------------------------------------------------------------ */

const STATUS_TEXT = {
  saved: 'Saved to your account',
  saving: 'Saving…',
  connecting: 'Connecting…',
  offline: 'Offline — saved on this device',
  error: 'Not saved',
  'signed-out': '',
  'local-only': ''
};

function renderAccount() {
  const user = Cloud.user();
  const status = Cloud.status();

  $('sign-in').hidden = Boolean(user) || !Cloud.configured;
  $('user-chip').hidden = !user;
  if (user) {
    $('user-name').textContent = user.name;
    $('user-email').textContent = user.email;
    const avatar = $('user-avatar');
    avatar.hidden = !user.avatar;
    if (user.avatar) avatar.src = user.avatar;
  }

  const pill = $('sync-pill');
  pill.hidden = !user;
  if (user) {
    pill.textContent = STATUS_TEXT[status] || '';
    pill.className = `pill is-${status}`;
    pill.title = Cloud.statusDetail() || pill.textContent;
  }

  renderAccountCard(user, status);
}

function renderAccountCard(user, status) {
  const lead = $('account-lead');
  const actions = $('account-actions');
  const note = $('account-status');
  const onFile = location.protocol === 'file:';

  if (!Cloud.configured) {
    note.textContent = 'no project connected';
    lead.innerHTML = 'Vaultline is saving to this browser only. To sign in with Google and keep your book ' +
      'in your own account, create a Firebase project and paste its config into ' +
      '<code>assets/js/config.js</code>. The README walks through it.';
    actions.innerHTML = '';
    return;
  }

  if (!user) {
    note.textContent = status === 'error' ? 'sign-in problem' : 'not signed in';
    lead.innerHTML = 'Your book is saved <strong>in this browser only</strong>. Clearing browser data, or ' +
      'losing this device, loses it. Sign in with Google to keep it in your own documents as well — ' +
      'readable by your account and nothing else.' +
      (onFile ? '<br /><br /><strong>Note:</strong> this page is open as a local file. Google sign-in needs ' +
        'it served over http — run <code>npx http-server .</code> and open the address it prints.' : '') +
      (status === 'error' && Cloud.statusDetail()
        ? `<br /><br /><strong>Last problem:</strong> ${esc(Cloud.statusDetail())}` : '');
    actions.innerHTML = onFile ? '' :
      '<button type="button" class="btn primary" id="account-sign-in">Sign in with Google</button>';
    if (!onFile) on('account-sign-in', 'click', () => Cloud.signIn());
    return;
  }

  note.textContent = STATUS_TEXT[status] || '';
  lead.innerHTML = `Signed in as <strong>${esc(user.email || user.name)}</strong>. Changes are written to ` +
    'this device first and then to your account, and a change made with no signal goes up as soon as the ' +
    'connection returns. Any device you sign in on shows the same book, live.' +
    (status === 'error' && Cloud.statusDetail()
      ? `<br /><br /><strong>Last problem:</strong> ${esc(Cloud.statusDetail())}` : '');
  actions.innerHTML =
    '<button type="button" class="btn" id="account-push">Save everything again now</button>' +
    '<button type="button" class="btn quiet" id="account-sign-out">Sign out</button>';

  on('account-push', 'click', () => {
    Cloud.pushAll(state).then(() => { toast('Everything sent to your account'); renderAccount(); });
  });
  on('account-sign-out', 'click', () => {
    Cloud.signOut().then(() => toast('Signed out — this device keeps its own copy'));
  });
}

on('sign-in', 'click', () => Cloud.signIn());

/* ------------------------------------------------------------------ */
/* background                                                          */
/* ------------------------------------------------------------------ */

function readPhoto() {
  try {
    return localStorage.getItem(Store.PHOTO_KEY) || '';
  } catch (err) {
    return '';
  }
}

/* A phone photo is several megabytes, far past what a browser will keep. Draw
   it down to something a screen can actually use before storing it. */
function shrinkImage(file, maxSide = 1800, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('that file is not an image'));
    };
    img.src = url;
  });
}

function background() {
  return state.background || { kind: 'mountains', strength: 62 };
}

function applyBackground() {
  const bg = background();
  const photo = bg.kind === 'photo' ? readPhoto() : '';
  const url = bg.kind === 'mountains' ? 'assets/bg-mountains.svg' : photo;

  $('backdrop-image').style.backgroundImage = url ? `url("${url}")` : 'none';
  document.body.classList.toggle('has-backdrop', Boolean(url));
  document.documentElement.style.setProperty('--backdrop-strength', String((bg.strength || 62) / 100));
}

function renderLook() {
  const bg = background();
  for (const btn of document.querySelectorAll('#bg-choice .choice-btn')) {
    btn.classList.toggle('is-active', btn.dataset.bg === bg.kind);
  }

  const hasPhoto = Boolean(readPhoto());
  $('bg-photo-row').hidden = bg.kind !== 'photo';
  $('bg-clear').hidden = !hasPhoto;
  $('bg-strength-wrap').hidden = bg.kind === 'none';
  $('bg-strength').value = String(bg.strength || 62);
  $('bg-strength-value').textContent = `${bg.strength || 62}%`;

  $('bg-note').textContent = bg.kind === 'photo'
    ? (hasPhoto
      ? 'Your photo is kept on this device only — it is never uploaded, and a backup file does not carry it.'
      : 'Pick any photo from this device. It stays here; only the choice follows your account.')
    : bg.kind === 'mountains'
      ? 'Drawn rather than photographed, so it stays sharp on any screen and carries no licence.'
      : 'A plain background, the lightest on the eye and on the battery.';
}

on('bg-choice', 'click', (event) => {
  const kind = event.target.dataset.bg;
  if (!kind) return;
  if (kind === 'photo' && !readPhoto()) {
    state.background = { ...background(), kind };
    applyBackground();
    renderLook();
    Store.save();
    $('bg-file').click();
    return;
  }
  state.background = { ...background(), kind };
  applyBackground();
  renderLook();
  Store.save();
  Cloud.saveSettings(state);
});

on('bg-strength', 'input', function () {
  state.background = { ...background(), strength: Number(this.value) || 45 };
  $('bg-strength-value').textContent = `${state.background.strength}%`;
  applyBackground();
});

on('bg-strength', 'change', () => {
  Store.save();
  Cloud.saveSettings(state);
});

on('bg-file', 'change', async (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;

  toast('Preparing the photo…');
  try {
    const dataUrl = await shrinkImage(file);
    try {
      localStorage.setItem(Store.PHOTO_KEY, dataUrl);
    } catch (err) {
      toast('That photo is too big for this browser to keep — try a smaller one');
      return;
    }
    state.background = { ...background(), kind: 'photo' };
    Store.save();
    applyBackground();
    renderLook();
    Cloud.saveSettings(state);
    toast('Photo set as the background');
  } catch (err) {
    toast(String(err.message || 'that file could not be read'));
  }
});

on('bg-clear', 'click', () => {
  try {
    localStorage.removeItem(Store.PHOTO_KEY);
  } catch (err) { /* nothing to remove */ }
  state.background = { ...background(), kind: 'mountains' };
  Store.save();
  applyBackground();
  renderLook();
  Cloud.saveSettings(state);
  toast('Photo removed');
});

/* ------------------------------------------------------------------ */
/* tabs, theme, start                                                  */
/* ------------------------------------------------------------------ */

const TAB_ORDER = ['vault', 'wallets', 'records', 'budgets', 'rates', 'settings'];
let currentTab = 'vault';

/* The active pill glides to the section you picked rather than jumping. */
function movePill() {
  const active = document.querySelector('.seg.is-active');
  const pill = $('seg-pill');
  if (!active || !pill) return;
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.transform = `translateX(${active.offsetLeft}px)`;
}

let enterTimer = null;

function showTab(name) {
  const forward = TAB_ORDER.indexOf(name) >= TAB_ORDER.indexOf(currentTab);
  currentTab = name;

  for (const tab of document.querySelectorAll('.seg')) {
    tab.classList.toggle('is-active', tab.dataset.tab === name);
  }

  for (const screen of document.querySelectorAll('.screen')) {
    const on = screen.id === `screen-${name}`;
    screen.classList.toggle('is-active', on);
    screen.classList.remove('is-entering', 'from-left', 'from-right');
    if (on && !reduceMotion()) {
      /* Reading offsetWidth restarts the animation even when the same screen
         is shown twice in a row. */
      void screen.offsetWidth;
      screen.classList.add('is-entering', forward ? 'from-right' : 'from-left');
    }
  }

  movePill();
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.remove('is-entering', 'from-left', 'from-right');
    });
  }, 900);
}

window.addEventListener('resize', movePill);

on('tabs', 'click', (event) => {
  const name = event.target.dataset.tab;
  if (name) showTab(name);
});

const smooth = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

function focusField(id) {
  const el = $(id);
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'center', behavior: smooth() });
}

on('quick-add', 'click', () => {
  resetTxForm();
  showTab('records');
  focusField('tx-amount');
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-goto], [data-focus]');
  if (!button) return;
  if (button.dataset.goto) showTab(button.dataset.goto);
  if (button.dataset.focus) focusField(button.dataset.focus);
});

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  applyBackground();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#0b0e14' : '#f5f4f0');
}

on('theme-toggle', 'click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  Store.save();
  Cloud.saveSettings(state);
});

/* ------------------------------------------------------------------ */
/* joining the device book to the account book                         */
/* ------------------------------------------------------------------ */

let reconciled = false;

function onCloudBook(book) {
  if (!book) {
    /* signed out: the device copy carries on as it is */
    reconciled = false;
    renderAccount();
    renderStats();
    return;
  }

  if (!reconciled) {
    reconciled = true;
    const localHasData = !state.isSample && (state.wallets.length || state.transactions.length);

    if (book.isEmpty) {
      if (state.isSample) {
        state = Store.reset();
        applyTheme();
        resetWalletForm();
        resetTxForm();
        renderAll();
        toast('Signed in — your account is empty, add your wallets');
        Cloud.saveSettings(state);
        return;
      }
      Cloud.pushAll(state).then(() => toast('This device’s book is now saved to your account'));
      renderAll();
      return;
    }

    if (localHasData) {
      const keepCloud = confirm(
        `Your account already holds ${book.wallets.length} wallets and ${book.transactions.length} records, ` +
        'and this device has its own book that was never uploaded.\n\n' +
        'OK — open the account version. This device’s own book is set aside.\n' +
        'Cancel — add this device’s book to the account, keeping both.'
      );
      if (!keepCloud) {
        Cloud.pushAll(state).then(() => toast('This device’s book was added to your account'));
        renderAll();
        return;
      }
    }
  }

  state = Store.adopt(book);
  applyTheme();
  renderAll();
}

/* ------------------------------------------------------------------ */
/* go                                                                  */
/* ------------------------------------------------------------------ */

applyTheme();
resetWalletForm();
resetTxForm();
renderAll();

requestAnimationFrame(() => {
  movePill();
  document.body.classList.add('is-ready');
  const first = document.querySelector('.screen.is-active');
  if (first && !reduceMotion()) first.classList.add('is-entering', 'from-right');
  setTimeout(() => {
    if (first) first.classList.remove('is-entering', 'from-right');
  }, 900);
});

Cloud.onChange(renderAccount);
Cloud.init(onCloudBook).catch(() => renderAccount());

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus */ });
  });
}

/* handy in the browser console, and what the tests drive */
window.Vaultline = {
  state: () => state,
  showTab,
  renderAll,
  Money,
  Store
};
