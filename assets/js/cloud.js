/* Vaultline — Google sign-in and saving, on Firebase.
 *
 * How this behaves, which is worth knowing before reading the code:
 *
 * - The Firebase SDK is fetched only when a project is actually configured.
 *   With an empty config Vaultline never touches the network at all.
 * - Firestore keeps its own on-device cache, so a write made with no signal is
 *   stored locally and sent when the connection returns. The header pill reads
 *   that state rather than guessing at it.
 * - Every document lives under users/{uid}/..., and the rule in
 *   firestore.rules refuses any read or write where uid is not the signed-in
 *   person. One account cannot see another's books.
 */
import { firebaseConfig, firebaseSdkVersion, isConfigured } from './config.js';

const listeners = [];
const snapshotUnsubs = [];

let sdk = null;
let app = null;
let auth = null;
let db = null;

let currentUser = null;
let status = isConfigured ? 'connecting' : 'local-only';
let statusDetail = '';
let pending = false;
let onBook = null;
let ready = false;

/* ------------------------------------------------------------------ */
/* status plumbing                                                     */
/* ------------------------------------------------------------------ */

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      /* one broken listener must never stop syncing */
    }
  });
}

function setStatus(next, detail = '') {
  status = next;
  statusDetail = detail;
  emit();
}

/* ------------------------------------------------------------------ */
/* loading the SDK                                                     */
/* ------------------------------------------------------------------ */

/* Tests replace the SDK through this hook so the whole sync layer can be
   exercised without a network or a real Firebase project. */
async function loadSdk() {
  if (globalThis.__vaultlineFirebaseMock) return globalThis.__vaultlineFirebaseMock;
  const base = `https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/`;
  const [appMod, authMod, storeMod] = await Promise.all([
    import(/* @vite-ignore */ `${base}firebase-app.js`),
    import(/* @vite-ignore */ `${base}firebase-auth.js`),
    import(/* @vite-ignore */ `${base}firebase-firestore.js`)
  ]);
  return { ...appMod, ...authMod, ...storeMod };
}

function startFirestore() {
  /* Prefer the cache that survives a reload; fall back if this SDK build does
     not carry the newer cache API. */
  if (sdk.initializeFirestore && sdk.persistentLocalCache) {
    try {
      return sdk.initializeFirestore(app, {
        localCache: sdk.persistentMultipleTabManager
          ? sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() })
          : sdk.persistentLocalCache({})
      });
    } catch (err) {
      /* already initialised, or persistence unavailable in this browser */
    }
  }
  return sdk.getFirestore(app);
}

/* ------------------------------------------------------------------ */
/* shape conversion: app objects <-> firestore documents               */
/* ------------------------------------------------------------------ */

const walletDoc = (w) => ({
  name: w.name,
  kind: w.kind,
  currency: w.currency,
  opening: Number(w.opening) || 0,
  note: w.note || ''
});

const txDoc = (t) => ({
  type: t.type,
  walletId: t.walletId || '',
  toWalletId: t.toWalletId || '',
  amount: Number(t.amount) || 0,
  received: Number(t.received) || 0,
  category: t.category || '',
  place: t.place || '',
  date: t.date,
  note: t.note || ''
});

const currencyDoc = (c) => ({ name: c.name || c.code, rate: Number(c.rate) || 1 });
const budgetDoc = (b) => ({ category: b.category, limit: Number(b.limit) || 0 });

function walletFrom(id, d) {
  return {
    id,
    name: d.name || 'Wallet',
    kind: d.kind === 'card' ? 'card' : 'cash',
    currency: d.currency || 'USD',
    opening: Number(d.opening) || 0,
    note: d.note || ''
  };
}

function txFrom(id, d) {
  return {
    id,
    type: d.type === 'income' || d.type === 'transfer' ? d.type : 'expense',
    walletId: d.walletId || '',
    toWalletId: d.toWalletId || '',
    amount: Number(d.amount) || 0,
    received: Number(d.received) || 0,
    category: d.category || '',
    place: d.place || '',
    date: d.date,
    note: d.note || ''
  };
}

/* ------------------------------------------------------------------ */
/* live subscriptions                                                  */
/* ------------------------------------------------------------------ */

const book = {
  settings: null,
  wallets: [],
  transactions: [],
  currencies: [],
  budgets: []
};

let arrived = 0;
const EXPECTED = 5;

function publish() {
  pending = Boolean(book.pendingWrites);
  if (arrived >= EXPECTED) {
    setStatus(pending ? 'saving' : 'saved');
    if (onBook) onBook(snapshotOfBook());
  }
}

function snapshotOfBook() {
  return {
    settings: book.settings,
    wallets: book.wallets.slice(),
    transactions: book.transactions.slice(),
    currencies: book.currencies.slice(),
    budgets: book.budgets.slice(),
    isEmpty: !book.wallets.length && !book.transactions.length
  };
}

function watch() {
  const uid = currentUser.uid;
  const { doc, collection, onSnapshot } = sdk;
  const seen = new Set();

  const track = (key, snap) => {
    if (!seen.has(key)) {
      seen.add(key);
      arrived += 1;
    }
    book.pendingWrites = snap.metadata ? snap.metadata.hasPendingWrites : false;
  };

  snapshotUnsubs.push(
    onSnapshot(doc(db, 'users', uid), (snap) => {
      book.settings = snap.exists() ? snap.data() : null;
      track('settings', snap);
      publish();
    }, reportError)
  );

  const collections = [
    ['wallets', (rows) => { book.wallets = rows.map((r) => walletFrom(r.id, r.data)); }],
    ['transactions', (rows) => { book.transactions = rows.map((r) => txFrom(r.id, r.data)); }],
    ['currencies', (rows) => {
      book.currencies = rows.map((r) => ({
        code: r.id,
        name: r.data.name || r.id,
        rate: Number(r.data.rate) || 1
      }));
    }],
    ['budgets', (rows) => {
      book.budgets = rows.map((r) => ({
        id: r.id,
        category: r.data.category || r.id,
        limit: Number(r.data.limit) || 0
      }));
    }]
  ];

  collections.forEach(([name, apply]) => {
    snapshotUnsubs.push(
      onSnapshot(collection(db, 'users', uid, name), (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, data: d.data() }));
        apply(rows);
        track(name, snap);
        publish();
      }, reportError)
    );
  });
}

function reportError(err) {
  setStatus('error', String((err && err.message) || err));
}

function stopWatching() {
  while (snapshotUnsubs.length) {
    const off = snapshotUnsubs.pop();
    try {
      off();
    } catch (err) {
      /* already detached */
    }
  }
  arrived = 0;
  book.settings = null;
  book.wallets = [];
  book.transactions = [];
  book.currencies = [];
  book.budgets = [];
}

/* ------------------------------------------------------------------ */
/* writes                                                              */
/* ------------------------------------------------------------------ */

function ref(...path) {
  return sdk.doc(db, 'users', currentUser.uid, ...path);
}

function write(path, data) {
  if (!currentUser || !db) return Promise.resolve();
  setStatus('saving');
  /* Firestore resolves this only once the server confirms, but the change is
     already in the local cache and visible, so the UI never waits on it. */
  return sdk.setDoc(ref(...path), data, { merge: true }).catch(reportError);
}

function remove(path) {
  if (!currentUser || !db) return Promise.resolve();
  setStatus('saving');
  return sdk.deleteDoc(ref(...path)).catch(reportError);
}

async function inChunks(items, run) {
  /* A Firestore batch takes at most 500 operations. */
  for (let i = 0; i < items.length; i += 400) {
    const batch = sdk.writeBatch(db);
    items.slice(i, i + 400).forEach((item) => run(batch, item));
    await batch.commit();
  }
}

async function pushAll(state) {
  if (!currentUser || !db) return;
  setStatus('saving');
  try {
    await sdk.setDoc(sdk.doc(db, 'users', currentUser.uid), {
      baseCurrency: state.baseCurrency,
      theme: state.theme,
      categories: state.categories
    }, { merge: true });

    await inChunks(state.wallets, (batch, w) => batch.set(ref('wallets', w.id), walletDoc(w)));
    await inChunks(state.transactions, (batch, t) => batch.set(ref('transactions', t.id), txDoc(t)));
    await inChunks(state.currencies, (batch, c) => batch.set(ref('currencies', c.code), currencyDoc(c)));
    await inChunks(state.budgets || [], (batch, b) => batch.set(ref('budgets', b.id), budgetDoc(b)));
    setStatus('saved');
  } catch (err) {
    reportError(err);
  }
}

async function eraseCloud() {
  if (!currentUser || !db) return;
  setStatus('saving');
  try {
    for (const name of ['transactions', 'wallets', 'currencies', 'budgets']) {
      const snap = await sdk.getDocs(sdk.collection(db, 'users', currentUser.uid, name));
      const ids = [];
      snap.forEach((d) => ids.push(d.id));
      await inChunks(ids, (batch, id) => batch.delete(ref(name, id)));
    }
    await sdk.deleteDoc(sdk.doc(db, 'users', currentUser.uid)).catch(() => {});
    setStatus('saved');
  } catch (err) {
    reportError(err);
  }
}

/* ------------------------------------------------------------------ */
/* sign in / out                                                       */
/* ------------------------------------------------------------------ */

function userFrom(u) {
  return {
    uid: u.uid,
    email: u.email || '',
    name: u.displayName || u.email || 'Signed in',
    avatar: u.photoURL || ''
  };
}

async function signIn() {
  if (!isConfigured) {
    setStatus('error', 'No Firebase project is configured yet');
    return;
  }
  if (location.protocol === 'file:') {
    setStatus('error', 'Google sign-in needs the app served over http, not opened as a file');
    return;
  }
  try {
    if (!sdk) await start();
    setStatus('connecting');
    const provider = new sdk.GoogleAuthProvider();
    await sdk.signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err && err.code) || '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      try {
        await sdk.signInWithRedirect(auth, new sdk.GoogleAuthProvider());
        return;
      } catch (redirectErr) {
        reportError(redirectErr);
        return;
      }
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      setStatus('signed-out', 'Sign-in was cancelled');
      return;
    }
    reportError(err);
  }
}

async function signOut() {
  if (!auth) return;
  stopWatching();
  await sdk.signOut(auth).catch(reportError);
}

/* ------------------------------------------------------------------ */
/* start-up                                                            */
/* ------------------------------------------------------------------ */

let starting = null;

function start() {
  if (starting) return starting;
  starting = (async () => {
    try {
      sdk = await loadSdk();
    } catch (err) {
      setStatus('error',
        `Could not load the Firebase SDK (version ${firebaseSdkVersion}). ` +
        'Check assets/js/config.js.');
      throw err;
    }
    app = sdk.getApps && sdk.getApps().length ? sdk.getApps()[0] : sdk.initializeApp(firebaseConfig);
    auth = sdk.getAuth(app);
    db = startFirestore();
    return sdk;
  })();
  return starting;
}

/* `handler` receives the whole book every time anything changes anywhere —
   including on another device, because these are live subscriptions. */
async function init(handler) {
  onBook = handler;
  if (!isConfigured) {
    setStatus('local-only');
    return { configured: false };
  }
  try {
    await start();
  } catch (err) {
    return { configured: true, failed: true };
  }

  /* A redirect sign-in finishes here rather than in signIn(). */
  if (sdk.getRedirectResult) sdk.getRedirectResult(auth).catch(() => {});

  return new Promise((resolve) => {
    sdk.onAuthStateChanged(auth, (u) => {
      stopWatching();
      currentUser = u ? userFrom(u) : null;
      if (currentUser) {
        setStatus('connecting');
        watch();
      } else {
        setStatus('signed-out');
        if (onBook) onBook(null);
      }
      if (!ready) {
        ready = true;
        resolve({ configured: true, signedIn: Boolean(currentUser) });
      }
      emit();
    }, reportError);
  });
}

/* ------------------------------------------------------------------ */

export const Cloud = {
  configured: isConfigured,
  init,
  signIn,
  signOut,
  onChange: (fn) => listeners.push(fn),
  user: () => currentUser,
  status: () => status,
  statusDetail: () => statusDetail,
  hasPendingWrites: () => pending,

  saveWallet: (w) => write(['wallets', w.id], walletDoc(w)),
  deleteWallet: (id) => remove(['wallets', id]),
  saveTx: (t) => write(['transactions', t.id], txDoc(t)),
  deleteTx: (id) => remove(['transactions', id]),
  saveCurrency: (c) => write(['currencies', c.code], currencyDoc(c)),
  deleteCurrency: (code) => remove(['currencies', code]),
  saveBudget: (b) => write(['budgets', b.id], budgetDoc(b)),
  deleteBudget: (id) => remove(['budgets', id]),
  saveSettings: (state) => {
    if (!currentUser || !db) return Promise.resolve();
    setStatus('saving');
    return sdk.setDoc(sdk.doc(db, 'users', currentUser.uid), {
      baseCurrency: state.baseCurrency,
      theme: state.theme,
      categories: state.categories
    }, { merge: true }).catch(reportError);
  },

  pushAll,
  eraseCloud
};

export default Cloud;
