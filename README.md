# Vaultline

A private money manager for people who keep money in more than one place and more
than one currency — cash in a pocket, cash at home, a som card, a euro card — and
who want to know **where it all is** and **where it went**.

It is deliberately not a password vault. There is no field for a card number, PIN,
CVV, expiry date or bank password, and the database has no field that could hold
one. You write amounts, not credentials.

**Live site:** https://erdanthecoder.github.io/kid-learnclassroom/

Firebase Hosting is optional and is not used by default. Vaultline needs Firebase
only for sign-in and saving; the site itself is served by GitHub Pages, which
deploys on every push with nothing to run by hand.

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

**Every currency** — 150+ of them, but the Rates screen never becomes a wall of
names. It lists only the ones you actually use; to add another you type into the
search box — a code like `NOK`, or part of a name like `som` or `franc` — and pick
it from a handful of matches. Each wallet always shows its own currency, and
totals convert into whichever one you choose in the header, using rates you
control. The rates that ship with the app are starting points, not live data;
correct any of them on the Rates screen.

**Budgets** — a monthly limit per category, with a bar that turns amber near the
limit and red past it. A limit keeps the currency it was written in, so switching
the display currency never quietly changes what you set.

**Vault** — everything you have, the cash/card split, a breakdown per currency,
where the money went over five different periods, and **what stands out**: your
biggest single spend, where most money went, whether you are spending more or less
than last month, and what the month will cost at the current pace.

**Records screen** — search and filter by wallet, category and type; edit or
delete anything. On a phone, tapping a row opens it.

**It moves** — balances count up rather than blink into place, bars sweep out to
their length, the section pill glides to where you tapped, screens slide in from
the side you came from, and panels and rows arrive one after another. A sheen
crosses the balance card and your card wallets. Nothing moves for the sake of it:
entrance animations run only when a screen is opened, so redrawing after every
keystroke never makes the page flicker, and **changing the display currency snaps
instead of counting** — the frames in between would show an amount you do not have.

**Built for a thumb** — the section bar stays put as a screen scrolls, a quick-add
button is always within reach, and an empty screen says what to do next instead of
just reporting that there is nothing. Keyboard focus is always visible, and every
animation stands down for anyone who asks their device for less motion.

**Look** — light and dark, and a background behind the app: plain, a drawn view of
the Ala-Too range, or a photograph of your own. Whichever you pick, a scrim and a
frosted panel keep every number readable — a money app must never make you squint
at a balance. The strength slider is yours to push.

Your photograph is scaled down and kept **on that device only**. It is never
uploaded, and a backup file does not carry it; only the choice of background
follows your account. The drawn mountains are vector, so they stay sharp at any
size and carry no licence with them.

**Export to Excel** — a real `.xlsx`, written by the app itself with no library:
dates are dates, amounts are numbers, the header row is frozen and filterable.
A CSV export is there too, with a byte-order mark so Excel reads UTF-8 instead of
mangling accents and Cyrillic. Both guard against cells that begin with `=`, which
Excel would otherwise run as a formula.

**Everything else** — JSON backup and restore, and it installs to a phone home
screen and opens without a connection.

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
   `erdanthecoder.github.io`. Only needed for the GitHub Pages address; the
   `web.app` one is authorised from the start.

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

GitHub Pages serves the site and needs nothing from you. Firebase Hosting is an
optional second home for the same files, worth it only if you want the shorter
`web.app` address.

**Firebase Hosting — `vaultline-5e3bd.web.app`, optional.** Nothing is published
there until you run a deploy; until then the console shows *"Waiting for your
first release"*. From the project folder:

```sh
npx firebase login
npx firebase deploy
```

That publishes the site *and* the rules in `firestore.rules`, so it doubles as
step 4 of the Firebase setup. `firebase.json` and `.firebaserc` are already
written; nothing to configure.

### A shorter address

A Firebase project can serve several sites, each with its own `web.app`
subdomain, and site names are handed out separately from project names — so
`vaultline` may still be free even though the project had to be called
`vaultline-5e3bd`.

**Hosting → Add another site → site ID `vaultline`.** If Firebase accepts it,
`vaultline.web.app` is yours; add a second block to the `hosting` array in
`firebase.json` and deploy again:

```json
{
  "site": "vaultline",
  "public": ".",
  "ignore": ["firebase.json", ".firebaserc", "**/.*", "**/node_modules/**", "README.md", "firestore.rules"],
  "cleanUrls": true
}
```

Both addresses then serve the same app, and both are authorised for sign-in
automatically.

For a domain of your own — `vaultline.app` and the like — buy the name, then
**Hosting → Add custom domain**; Firebase issues the certificate and prints the
DNS records to add at your registrar. Remember to add that domain under
**Authentication → Settings → Authorized domains** too, or sign-in will refuse
it.

To have this happen on every push instead, put a service account key
(Firebase console → Project settings → Service accounts → Generate new private
key) into the repository secret `FIREBASE_SERVICE_ACCOUNT`.
`.github/workflows/firebase-hosting.yml` then deploys automatically, and skips
quietly until that secret exists.

**GitHub Pages — `erdanthecoder.github.io/kid-learnclassroom/`, the live one.**
`.github/workflows/pages.yml` deploys on every push to `main`, no secret needed
and no command to run.
The first deploy needs Pages switched on once by a repository admin, because the
workflow's own token may not create the site:

> **Settings → Pages → Build and deployment → Source: GitHub Actions**

One practical difference: `vaultline-5e3bd.web.app` and
`vaultline-5e3bd.firebaseapp.com` are authorised for sign-in automatically,
while `erdanthecoder.github.io` has to be added by hand under
**Authentication → Settings → Authorized domains**.

## Files

```
index.html                   the six screens
firebase.json, .firebaserc   Firebase Hosting and rules deploy
manifest.webmanifest, sw.js  installable app, works offline
firestore.rules              the rule that keeps accounts apart
assets/css/styles.css        design tokens, dark and light
assets/js/config.js          your Firebase project (empty by default)
assets/js/cloud.js           Google sign-in, live sync, offline writes
assets/js/store.js           data model, defaults, validation, device copy
assets/bg-mountains.svg      the drawn Ala-Too background
assets/js/currencies.js      the searchable catalogue of world currencies
assets/js/sheet.js           writes the .xlsx and the CSV
assets/js/money.js           conversion, balances, spending, budgets, insights
assets/js/app.js             screens, forms, events
.github/workflows/            the two deploys, Pages and Firebase Hosting
```

Plain HTML, CSS and modern JavaScript. No framework and no build step; the only
thing loaded from a network is the Firebase SDK, and only once a project is
configured.
