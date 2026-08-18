# MoneyMap

A personal finance tracker for people who want to know **where their money is** and
**where it went** — across several currencies, in cash and on cards.

It is deliberately *not* a vault. There is no field for a card number, PIN, CVV,
expiry date or bank password, and the database has no column that could hold one.
You write amounts, not credentials.

Open `index.html` in a browser and it works immediately, saving to that browser.
Sign in with Google and the same book follows you to your phone and your laptop.

## What it does

**Wallets** — every place your money sits, each with its own currency:

- 💵 paper money (cash in your pocket, dollars kept at home, …)
- 💳 card money (a som card, a euro travel card, …)

A wallet stores only a nickname, a kind, a currency, a starting amount and an
optional note.

**Records** — three kinds:

- ➖ **Spent** — amount, which wallet it left, the category, and *where* (the shop,
  the person, the service)
- ➕ **Got money** — salary, a gift, a refund
- 🔁 **Moved** — cash withdrawn from a card, money sent between wallets. Across
  currencies you can type the amount that actually arrived, so a bad exchange rate
  at the counter is recorded truthfully. Moves are never counted as spending.

**Multi-currency** — each wallet keeps its own currency and is always shown in it.
For totals, everything is converted into one display currency you choose in the
header. Rates are yours to edit on the **Rates** tab; ten common currencies come
pre-filled and you can add any other.

**Overview** — total money, the paper-money/card split, a breakdown per currency
(with the cash and card share of each), and where the money went, by category with
the top place inside each, over the last 30 days / this month / 90 days / 12 months
/ all time.

**Spending** — the full list with search and filters by wallet, category and type;
every record can be edited or deleted.

**Data** — JSON backup and restore, CSV export of every record (both the original
currency and the converted amount), and a button that erases everything.

## Signing in with Google

Sign-in is optional. What changes:

| | Signed out | Signed in |
|---|---|---|
| Where the book is saved | this browser only | this browser **and** your own rows in the database |
| If the device is lost | the book is lost | the book is on your next device |
| What leaves the device | nothing | your wallets, records, rates and settings |

Every change is written to this device **first** and then pushed to your account.
If the network is down the change waits in an outbox and goes up when the
connection returns — the header pill tells you which state you are in
(*Saved to your account* / *Saving…* / *n changes waiting for the network*).

### Who can read the saved data

Every table has row level security switched on, with four separate policies each
(select, insert, update, delete) tied to `auth.uid()`. In practice:

- another signed-in user asking the database for your rows gets **nothing back**,
  and cannot create, change or delete a row owned by you;
- a signed-out visitor is refused outright — the `anon` role has no grants at all;
- the publishable key in `assets/js/config.js` is meant to be public. It names the
  project and grants no access on its own.

This was verified against the live database with two test users; the checks live in
the commit history and can be re-run any time.

What this does **not** protect against: whoever controls the Supabase project can
read the rows in the dashboard, because the numbers are stored as plain values. If
you want the server itself to be unable to read your spending, the app would need
end-to-end encryption with a passphrase — that is a different design, and it means
a forgotten passphrase destroys the data with no reset possible.

## Turning sign-in on (one-time setup)

The database and the app are ready. Google itself has to be connected by hand,
because it needs credentials only you can create.

1. **Google Cloud Console** → *APIs & Services* → *Credentials* → *Create
   credentials* → *OAuth client ID* → **Web application**.
2. Under *Authorised redirect URIs* add exactly:
   `https://yuvcbylgaqbtoxiueawu.supabase.co/auth/v1/callback`
3. Copy the **Client ID** and **Client secret**.
4. **Supabase dashboard** → *Authentication* → *Sign In / Providers* → **Google** →
   enable it, paste both values, save.
5. **Supabase dashboard** → *Authentication* → *URL Configuration* → set the
   **Site URL** and add every address you will open the app from under *Redirect
   URLs*, for example `http://localhost:8080` and your GitHub Pages address.

Google sign-in needs the app served over `http(s)`, not opened as a `file://`
document. Locally:

```sh
npx http-server .          # then open the address it prints
```

Opened as a plain file the app still works fully — it just saves to that browser
only, and says so on the **Data** tab.

### Pointing it at a different project

Replace the two values in `assets/js/config.js`, then apply
`supabase/migrations/*.sql` to the new project.

## Balances are derived, never stored twice

A wallet's balance is always recomputed as *starting amount + every record that
touches it*. Editing or deleting a record can therefore never leave a balance out of
step with its history.

## Where the data lives

On the device, in `localStorage` under the key `moneymap.v1` (plus
`moneymap.session` and `moneymap.outbox` when signed in). In the account, in the
four tables below. Clearing browser data clears the local copy — signed in, the
account copy survives; signed out, use **Data → Download backup** if you want a copy
you keep.

The first time you open it, MoneyMap is filled with a small example so the screens
are not blank. It is never uploaded: signing in on a device that only holds the
example clears it and starts you an empty book. **Data → Erase everything** clears
the device and, when signed in, your account rows too.

## Files

```
index.html                  all five screens
assets/css/styles.css       theme tokens, light and dark
assets/js/config.js         which Supabase project to talk to
assets/js/cloud.js          Google sign-in, the outbox, and syncing
assets/js/store.js          data model, defaults, migration, localStorage
assets/js/money.js          conversion, formatting, balances, spending aggregates
assets/js/app.js            rendering, forms, events
supabase/migrations/        the schema and the row level security policies
```

Plain HTML, CSS and JavaScript — no framework, no build step, no dependencies, and
nothing loaded from a CDN. The Supabase REST and auth endpoints are called directly
with `fetch`.
