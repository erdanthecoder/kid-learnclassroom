/* MoneyMap — Google sign-in and saving to your own Supabase project.
   Written against the Supabase REST endpoints directly with fetch, so the app
   still has no dependencies and nothing is loaded from a CDN.

   Two things are worth knowing about how this behaves:
   - Writes go into an outbox first. Every change is saved on this device
     immediately and then pushed; if the network is down the outbox waits and
     drains later, so a record is never lost between typing and saving.
   - Nothing is sent anywhere while you are signed out. */
(function (global) {
  'use strict';

  var cfg = global.MONEYMAP_CONFIG || {};
  var SESSION_KEY = 'moneymap.session';
  var OUTBOX_KEY = 'moneymap.outbox';
  var configured = !!(cfg.supabaseUrl && cfg.publishableKey);

  var session = null;      // { access_token, refresh_token, expires_at, user }
  var outbox = [];
  var status = 'signed-out'; // signed-out | syncing | saved | offline | error
  var statusDetail = '';
  var listeners = [];
  var flushing = false;
  var pendingFlush = false;

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (err) { /* a broken listener must not stop syncing */ }
    });
  }

  function setStatus(next, detail) {
    status = next;
    statusDetail = detail || '';
    emit();
  }

  function readJSON(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* full or blocked */ }
  }

  /* ---------------- session ---------------- */

  function decodeJwt(token) {
    try {
      var part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var pad = part.length % 4 ? part + '===='.slice(part.length % 4) : part;
      var bytes = atob(pad);
      var percent = Array.prototype.map.call(bytes, function (ch) {
        return '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2);
      }).join('');
      return JSON.parse(decodeURIComponent(percent));
    } catch (err) {
      return {};
    }
  }

  function userFromToken(token) {
    var claims = decodeJwt(token);
    var meta = claims.user_metadata || {};
    return {
      id: claims.sub || '',
      email: claims.email || meta.email || '',
      name: meta.full_name || meta.name || claims.email || 'Signed in',
      avatar: meta.avatar_url || meta.picture || ''
    };
  }

  function storeSession(tokens) {
    if (!tokens || !tokens.access_token) return null;
    var expiresAt = Number(tokens.expires_at) ||
      Math.floor(Date.now() / 1000) + (Number(tokens.expires_in) || 3600);
    session = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || (session && session.refresh_token) || '',
      expires_at: expiresAt,
      user: userFromToken(tokens.access_token)
    };
    writeJSON(SESSION_KEY, session);
    return session;
  }

  function clearSession() {
    session = null;
    try { global.localStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ }
  }

  /* Tokens come back from Google in the URL fragment. Read them, then wipe the
     fragment so an access token never sits in the address bar or in history. */
  function captureRedirect() {
    var hash = global.location.hash || '';
    if (hash.indexOf('access_token=') === -1 && hash.indexOf('error') === -1) return false;
    var params = {};
    hash.replace(/^#/, '').split('&').forEach(function (pair) {
      var bits = pair.split('=');
      if (bits[0]) params[decodeURIComponent(bits[0])] = decodeURIComponent(bits[1] || '');
    });
    var cleanUrl = global.location.pathname + global.location.search;
    try { global.history.replaceState(null, '', cleanUrl); } catch (err) { global.location.hash = ''; }
    if (params.error || params.error_description) {
      setStatus('error', params.error_description || params.error);
      return false;
    }
    if (!params.access_token) return false;
    storeSession(params);
    return true;
  }

  function fresh() {
    if (!session) return Promise.reject(new Error('signed out'));
    if (session.expires_at - 60 > Math.floor(Date.now() / 1000)) return Promise.resolve(session);
    return fetch(cfg.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (res) {
      if (!res.ok) throw new Error('session expired');
      return res.json();
    }).then(function (tokens) {
      return storeSession(tokens);
    }).catch(function (err) {
      clearSession();
      setStatus('signed-out', 'Please sign in again');
      throw err;
    });
  }

  function signIn() {
    if (!configured) {
      setStatus('error', 'No Supabase project is configured');
      return;
    }
    if (global.location.protocol === 'file:') {
      setStatus('error', 'Google sign-in needs the app served over http, not opened as a file');
      return;
    }
    var redirect = global.location.origin + global.location.pathname;
    global.location.href = cfg.supabaseUrl + '/auth/v1/authorize?provider=google&redirect_to=' +
      encodeURIComponent(redirect);
  }

  function signOut() {
    var token = session && session.access_token;
    clearSession();
    outbox = [];
    writeJSON(OUTBOX_KEY, outbox);
    setStatus('signed-out');
    if (token) {
      fetch(cfg.supabaseUrl + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + token }
      }).catch(function () { /* the local session is already gone */ });
    }
  }

  /* ---------------- REST helpers ---------------- */

  function rest(path, options) {
    return fresh().then(function (s) {
      var opts = options || {};
      var headers = {
        apikey: cfg.publishableKey,
        Authorization: 'Bearer ' + s.access_token,
        'Content-Type': 'application/json'
      };
      Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
      return fetch(cfg.supabaseUrl + '/rest/v1/' + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error(res.status + ' ' + (text || res.statusText));
        });
      }
      return res.status === 204 ? null : res.json().catch(function () { return null; });
    });
  }

  function upsert(table, rows) {
    if (!rows.length) return Promise.resolve();
    return rest(table, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: rows
    });
  }

  /* ---------------- row mapping ---------------- */

  function walletRow(w, userId) {
    return {
      user_id: userId, id: w.id, name: w.name, kind: w.kind,
      currency: w.currency, opening: w.opening, note: w.note || ''
    };
  }

  function txRow(t, userId) {
    return {
      user_id: userId, id: t.id, type: t.type,
      wallet_id: t.walletId || '', to_wallet_id: t.toWalletId || '',
      amount: t.amount, received: t.received || 0,
      category: t.category || '', place: t.place || '',
      date: t.date, note: t.note || ''
    };
  }

  function currencyRow(c, userId) {
    return { user_id: userId, code: c.code, name: c.name || '', rate: c.rate };
  }

  function toWallet(row) {
    return {
      id: row.id, name: row.name, kind: row.kind === 'card' ? 'card' : 'cash',
      currency: row.currency, opening: Number(row.opening) || 0, note: row.note || ''
    };
  }

  function toTx(row) {
    return {
      id: row.id, type: row.type, walletId: row.wallet_id || '',
      toWalletId: row.to_wallet_id || '', amount: Number(row.amount) || 0,
      received: Number(row.received) || 0, category: row.category || '',
      place: row.place || '', date: row.date, note: row.note || ''
    };
  }

  /* ---------------- outbox ---------------- */

  /* One pending op per record: a later edit replaces an earlier one, and a
     delete cancels any pending write for the same row. */
  function queue(op) {
    if (!session) return;
    outbox = outbox.filter(function (existing) {
      return !(existing.kind === op.kind && existing.key === op.key);
    });
    outbox.push(op);
    writeJSON(OUTBOX_KEY, outbox);
    flush();
  }

  function opFor(kind, key, action, row) {
    return { kind: kind, key: key, action: action, row: row };
  }

  var TABLE = { wallet: 'wallets', tx: 'transactions', currency: 'currencies' };
  var KEY_COLUMN = { wallet: 'id', tx: 'id', currency: 'code' };

  function runOp(op, userId) {
    if (op.kind === 'settings') {
      return upsert('profiles', [{
        id: userId,
        base_currency: op.row.baseCurrency,
        theme: op.row.theme,
        categories: op.row.categories
      }]);
    }
    var table = TABLE[op.kind];
    if (!table) return Promise.resolve();
    if (op.action === 'del') {
      return rest(table + '?' + KEY_COLUMN[op.kind] + '=eq.' + encodeURIComponent(op.key) +
        '&user_id=eq.' + encodeURIComponent(userId), { method: 'DELETE' });
    }
    return upsert(table, [op.row]);
  }

  function flush() {
    if (!session || !outbox.length) {
      if (session && status !== 'saved') setStatus('saved');
      return Promise.resolve();
    }
    if (flushing) { pendingFlush = true; return Promise.resolve(); }
    flushing = true;
    setStatus('syncing');

    var userId = session.user.id;
    var batch = outbox.slice();
    var chain = Promise.resolve();
    batch.forEach(function (op) {
      chain = chain.then(function () { return runOp(op, userId); });
    });

    return chain.then(function () {
      var done = {};
      batch.forEach(function (op) { done[op.kind + ' ' + op.key] = true; });
      outbox = outbox.filter(function (op) { return !done[op.kind + ' ' + op.key]; });
      writeJSON(OUTBOX_KEY, outbox);
      setStatus(outbox.length ? 'syncing' : 'saved');
    }).catch(function (err) {
      writeJSON(OUTBOX_KEY, outbox);
      setStatus(global.navigator && global.navigator.onLine === false ? 'offline' : 'error',
        String(err.message || err));
    }).then(function () {
      flushing = false;
      if (pendingFlush) { pendingFlush = false; return flush(); }
      return null;
    });
  }

  /* ---------------- pull and push the whole book ---------------- */

  function pull() {
    setStatus('syncing');
    return Promise.all([
      rest('profiles?select=*'),
      rest('currencies?select=*'),
      rest('wallets?select=*'),
      rest('transactions?select=*&order=date.desc')
    ]).then(function (results) {
      var profile = (results[0] || [])[0] || null;
      var book = {
        wallets: (results[2] || []).map(toWallet),
        transactions: (results[3] || []).map(toTx),
        currencies: (results[1] || []).map(function (row) {
          return { code: row.code, name: row.name || row.code, rate: Number(row.rate) || 1 };
        })
      };
      if (profile) {
        book.baseCurrency = profile.base_currency;
        book.theme = profile.theme;
        book.categories = Array.isArray(profile.categories) ? profile.categories : [];
      }
      book.isEmpty = !book.wallets.length && !book.transactions.length;
      setStatus('saved');
      return book;
    }).catch(function (err) {
      setStatus('error', String(err.message || err));
      throw err;
    });
  }

  function pushAll(state) {
    if (!session) return Promise.resolve();
    var userId = session.user.id;
    setStatus('syncing');
    return upsert('profiles', [{
      id: userId, base_currency: state.baseCurrency,
      theme: state.theme, categories: state.categories
    }]).then(function () {
      return upsert('currencies', state.currencies.map(function (c) { return currencyRow(c, userId); }));
    }).then(function () {
      return upsert('wallets', state.wallets.map(function (w) { return walletRow(w, userId); }));
    }).then(function () {
      return upsert('transactions', state.transactions.map(function (t) { return txRow(t, userId); }));
    }).then(function () {
      setStatus('saved');
    }).catch(function (err) {
      setStatus('error', String(err.message || err));
      throw err;
    });
  }

  /* Wipe every row this user owns, used by "Erase everything" while signed in
     so erasing on one device really erases everywhere. */
  function eraseCloud() {
    if (!session) return Promise.resolve();
    var uid = encodeURIComponent(session.user.id);
    setStatus('syncing');
    outbox = [];
    writeJSON(OUTBOX_KEY, outbox);
    return rest('transactions?user_id=eq.' + uid, { method: 'DELETE' })
      .then(function () { return rest('wallets?user_id=eq.' + uid, { method: 'DELETE' }); })
      .then(function () { return rest('currencies?user_id=eq.' + uid, { method: 'DELETE' }); })
      .then(function () { setStatus('saved'); })
      .catch(function (err) { setStatus('error', String(err.message || err)); });
  }

  /* ---------------- start ---------------- */

  function init() {
    if (!configured) { setStatus('signed-out', 'not configured'); return false; }
    outbox = readJSON(OUTBOX_KEY, []) || [];
    var justSignedIn = captureRedirect();
    if (!session) session = readJSON(SESSION_KEY, null);
    if (session && session.access_token) {
      session.user = session.user || userFromToken(session.access_token);
      setStatus('syncing');
    }
    global.addEventListener('online', function () { flush(); });
    return justSignedIn;
  }

  global.Cloud = {
    configured: configured,
    init: init,
    signIn: signIn,
    signOut: signOut,
    session: function () { return session; },
    user: function () { return session ? session.user : null; },
    status: function () { return status; },
    statusDetail: function () { return statusDetail; },
    pendingCount: function () { return outbox.length; },
    onChange: function (fn) { listeners.push(fn); },
    pull: pull,
    pushAll: pushAll,
    flush: flush,
    eraseCloud: eraseCloud,
    saveWallet: function (w) { queue(opFor('wallet', w.id, 'put', walletRow(w, session ? session.user.id : ''))); },
    deleteWallet: function (id) { queue(opFor('wallet', id, 'del')); },
    saveTx: function (t) { queue(opFor('tx', t.id, 'put', txRow(t, session ? session.user.id : ''))); },
    deleteTx: function (id) { queue(opFor('tx', id, 'del')); },
    saveCurrency: function (c) { queue(opFor('currency', c.code, 'put', currencyRow(c, session ? session.user.id : ''))); },
    deleteCurrency: function (code) { queue(opFor('currency', code, 'del')); },
    saveSettings: function (state) {
      queue(opFor('settings', 'me', 'put', {
        baseCurrency: state.baseCurrency, theme: state.theme, categories: state.categories
      }));
    }
  };
})(window);
