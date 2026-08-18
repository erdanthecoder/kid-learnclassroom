# MoneyMap

A personal finance tracker for people who want to know **where their money is** and
**where it went** — across several currencies, in cash and on cards.

It is deliberately *not* a vault. There is no field for a card number, PIN, CVV,
expiry date or bank password, because MoneyMap never needs them. You write amounts,
not credentials.

Open `index.html` in a browser. No install, no build step, no account, no server.

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

## Balances are derived, never stored twice

A wallet's balance is always recomputed as *starting amount + every record that
touches it*. Editing or deleting a record can therefore never leave a balance out of
step with its history.

## Where the data lives

In this browser's `localStorage`, under the key `moneymap.v1`, and nowhere else. It
is not sent anywhere. Clearing your browser data clears MoneyMap too — use
**Data → Download backup** if you want a copy you keep.

The first time you open it, MoneyMap is filled with a small example so the screens
are not blank. **Data → Erase everything** clears it and leaves you an empty book.

## Files

```
index.html            all five screens
assets/css/styles.css theme tokens, light and dark
assets/js/store.js    data model, defaults, migration, localStorage
assets/js/money.js    conversion, formatting, balances, spending aggregates
assets/js/app.js      rendering, forms, events
```

Plain HTML, CSS and JavaScript — no framework, no dependencies, no network calls.
