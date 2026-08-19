# Vaultline

A private money manager for people who keep money in more than one place and more
than one currency — cash in a pocket, cash at home, a som card, a euro card — and
who want to know **where it all is** and **where it went**.

It is deliberately not a password vault. There is no field for a card number, PIN,
CVV, expiry date or bank password, and the database has no field that could hold
one. You write amounts, not credentials.

**Live site:** https://erdanthecoder.github.io/kid-learnclassroom/

Works immediately with no account, saving to the browser. Sign in with Google and
the same book follows you to every device, live.

## What it does

**Wallets** — every place your money sits, each in its own currency: paper money
and card money, kept apart so you can see the split at a glance.

**Records** — three kinds:

- **Spent** — how much, from which wallet, the category, and *where* it went
- **Got money** — salary, a gift, a refund
- **Moved** — cash taken from a card, money sent between wallets. Across
  currencies you can type the amount that actually arrived, so a bad rate at the
  counter is recorded truthfully. Moves are never counted as spending.

**Many currencies** — each wallet always shows its own currency. Totals convert
into whichever currency you choose in the header, using rates you control on the
**Rates** screen. Ten come pre-filled; add any others.

**Budgets** — a monthly limit per category, with a bar that turns amber near the
limit and red past it. A limit keeps the currency it was written in, so switching
the display currency never quietly changes what you set.

**Vault** — everything you have, the cash/card split, a breakdown per currency,
where the money went over five different periods, and **what stands out**: your
biggest single spend, where most money went, whether you are spending more or less
than last month, and what the month will cost at the current pace.

**Records screen** — search and filter by wallet, category and type; edit or
delete anything.

**Everything else** — light and dark, JSON backup and restore, CSV export, and it
installs to a phone home screen and opens without a connection.

## Setting up Firebase

Vaultline ships with no project connected, so sign-in is switched off until you
add one. All of this is in the Firebase console — there is no Google Cloud
console step and no redirect URL to paste.

1. **[console.firebase.google.com](https://console.firebase.google.com/)** → **Add
   project** → call it `Vaultline`. Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**,
   pick a support email, **Save**.
3. **Build → Firestore Database → Create database**, choose **production mode**
   and a region near you.
4. **Firestore → Rules** → replace what is there with the contents of
   [`firestore.rules`](firestore.rules) → **Publish**. This is the rule that keeps
   one account out of another's books; do not skip it.
5. **Project settings (gear) → General → Your apps → Web `</>`** → register the
   app → copy the `firebaseConfig` values into
   [`assets/js/config.js`](assets/js/config.js), then commit and push.
6. **Authentication → Settings → Authorized domains → Add domain** →
   `erdanthecoder.github.io`.

Sign-in then works on the live site. Nothing else changes: signed out, Vaultline
behaves exactly as before and sends nothing anywhere.

If sign-in ever reports that the SDK could not be loaded, put a version that
exists into `firebaseSdkVersion` in the same config file — the list is in the
[Firebase release notes](https://firebase.google.com/support/release-notes/js).

## How saving behaves

Every change is written to this device first, then to your account. Firestore
keeps its own on-device cache, so a record written with no signal is kept and sent
when the connection returns; the header pill says which state you are in rather
than guessing. Because the screens read live subscriptions, a change made on your
phone appears on your laptop without a reload.

The first time you sign in, Vaultline reconciles the two sides:

| This device | Your account | What happens |
|---|---|---|
| only the demo book | empty | demo cleared, you start fresh |
| a real book | empty | the device's book is uploaded |
| a real book | already has a book | you are asked which to open; nothing is deleted either way |

## Who can read your data

Every document lives under `users/{uid}/…`, and the rule in `firestore.rules`
allows reads and writes only where that `uid` is the signed-in person. Another
signed-in user asking for your documents gets nothing; anyone signed out is
refused everywhere.

The values in `assets/js/config.js` are meant to be public — they name the project
and grant nothing on their own. What protects the data is the rule, which is why
step 4 above matters.

What this does **not** protect against: whoever controls the Firebase project can
read the documents in the console, because amounts are stored as plain numbers. To
put that out of reach the app would need end-to-end encryption with a passphrase,
which also means a forgotten passphrase destroys the data with no way to reset it.

## Balances are derived, never stored

A wallet's balance is always recomputed from its starting amount plus every record
that touches it. Editing or deleting a record can therefore never leave a balance
out of step with its history.

## Running it yourself

The app is ES modules, so it needs to be served rather than opened as a file:

```sh
npx http-server .        # then open the address it prints
```

Add `http://localhost:8080` under Firebase's authorized domains if you want
sign-in to work locally too.

## Publishing

`.github/workflows/pages.yml` deploys to GitHub Pages on every push to `main`.
The first deploy needs Pages switched on once by a repository admin — the
workflow's own token may not create the site:

> **Settings → Pages → Build and deployment → Source: GitHub Actions**

## Files

```
index.html                   the six screens
manifest.webmanifest, sw.js  installable app, works offline
firestore.rules              the rule that keeps accounts apart
assets/css/styles.css        design tokens, dark and light
assets/js/config.js          your Firebase project (empty by default)
assets/js/cloud.js           Google sign-in, live sync, offline writes
assets/js/store.js           data model, defaults, validation, device copy
assets/js/money.js           conversion, balances, spending, budgets, insights
assets/js/app.js             screens, forms, events
.github/workflows/pages.yml  the deploy
```

Plain HTML, CSS and modern JavaScript. No framework and no build step; the only
thing loaded from a network is the Firebase SDK, and only once a project is
configured.
