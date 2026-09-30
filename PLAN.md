# Money Log — Plan

A personal, single-user money app: accounts, spending, budgets, bills and savings, in yen and
dollars. Built like Reading Log (`MargoF94/reading-app`) and hosted on GitHub Pages.
Interface in English; weeks start on Monday.

Status: **planning — waiting for your answers (section 14) before building.**
Mockups (private link): https://claude.ai/artifact/MehUA9LXFQ5fHg4F5HenEZ

---

## 1. Decisions (proposed)

| Topic | Proposal |
|---|---|
| Name | **Money Log** (like Reading Log) |
| Hosting | GitHub Pages from this repo, built and tested by GitHub Actions on every push (copy of Reading Log's workflow) |
| Stack | Same as Reading Log: Svelte 5 + TypeScript (strict) + Vite 7, Dexie (IndexedDB), vite-plugin-pwa, Vitest; charts hand-made in SVG |
| Data | Stored on each device, synced to a **private** repo `money-data` with a fine-grained token |
| Data files | `money.json` plus **one file per month of transactions** — the one deliberate change from Reading Log (reason in section 2) |
| Amounts | Whole numbers in the smallest unit: yen, and cents for dollars. No rounding errors. |
| Currencies | JPY and USD. Every account has one currency. More can be added later. |
| Totals | In a display currency (yen by default); each transaction is converted at its own day's rate |
| Exchange rates | Frankfurter (European Central Bank), jsDelivr fallback — Reading Log's `fx.ts`. Saved on each transaction, editable. |
| Reminders | `.ics` calendar files with alarms (work when the app is closed), plus notices in the app |
| Import | CSV statements from banks and cards: Shift_JIS or UTF-8, columns remembered per account |
| Layout | Phone first. Six tabs: **Home · Activity · Add · Accounts · Plan · Stats**; Settings is the ⚙ in the top bar; sidebar on screens ≥ 900 px |
| Look | Reading Log's ink/slate palette and its own dark mode; chart colours checked for colour-blindness in both themes |
| Privacy | Private data repo; token limited to that repo; token kept only on the device; warning if the repo is public; bank files are never committed anywhere |

## 2. Data storage

Two repositories, as with Reading Log:

- `money-app` (this repo, public): the app's code only. No personal data.
- `money-data` (**private**): your data.

```
money-data/
  money.json                     accounts, categories, tags, budgets, bills, goals, rules, settings
  transactions/2026-09.json      transactions, one file per month (by transaction date)
  receipts/2026-09/<id>.webp     receipt photos, resized on the phone
  statements/<account>/<name>.pdf  statements you choose to keep (up to 50 MB each)
```

- **Why one file per month:** with 5–10 transactions a day, a single file grows by 1–2 MB a year, and the
  phone would upload all of it after every change. Month files stay around 100 KB, and a sync only
  sends the months that changed.
- One record per line, keys sorted: GitHub's history shows exactly which records changed.
- Sync works like Reading Log: download, merge record by record (**newest `updatedAt` wins**),
  deletions kept as tombstones, retry when another device saved first, sync a few seconds after a
  change and when the app is hidden, other open tabs updated through a `BroadcastChannel`.
  New: one request lists the data repo's files with their fingerprints (git tree), so months that
  didn't change aren't downloaded again.
- Every file has a `schema` number; older app versions refuse newer data instead of dropping it.
- Backups: download everything as one JSON file (and merge it back on any device); CSV export of transactions.
- File names are URL-encoded (Japanese names work).

## 3. Data model

Every record has `id`, `createdAt`, `updatedAt` and optional `deleted`.

- **Account:** name, type (bank · cash · credit card · IC card · e-money · savings · investment · loan),
  currency, opening balance and date, order, closed (hidden but kept for history), counts in net worth.
  Credit cards also: statement closing day, payment day, paying account, weekend/holiday rule.
  Remembered CSV columns for importing.
- **Transaction:** date, type (expense · income · transfer · balance correction), account, amount,
  currency, category (or split into several), payee, note, tags, refund flag, the day's exchange rate,
  for transfers the receiving account and amount, the bill it pays (and which due date),
  receipt photos, import fingerprint (to skip duplicates).
- **Category:** name, expense or income, parent (one level of subcategories), icon, order, hidden.
- **Tag:** name (e.g. "Trip: Hokkaido", "Tax: medical", "Reimbursable").
- **Budget:** amount per category (display currency) from a given month on, so older months keep their
  budgets; optional roll-over of what's left.
- **Bill:** name, amount (fixed, or "about" for utilities), currency, account, category, payee,
  repeat rule, start/end, weekend/holiday rule, reminder, kind (bill · subscription · income, e.g. payday).
- **Goal:** name, target amount and currency, optional date, linked account(s) or amounts added by hand.
- **Rule:** "description contains …" → payee name, category, tags. Offered when you correct an import.
- **Settings:** theme, display currency, budget month start, default account, reminders.

Computed, never stored: balances, card statements and payment amounts, whether a bill is paid,
budget progress and pace, net worth, all stats.

Default categories (editable): Home (rent), Utilities, Phone & internet, Groceries, Eating out,
Transport, Shopping, Health, Fun, Subscriptions, Travel, Gifts, Education, Taxes & insurance
(pension, health insurance, resident tax), Fees, Other. Income: Salary, Bonus, Freelance,
Interest & dividends, Gifts, Other income.

## 4. Screens (see the mockups)

- **Home:** this month (left to spend, pace line), coming up (bills, paydays, card payments),
  budgets to watch, recent transactions, net worth by currency, goals.
- **Activity:** every transaction grouped by day with day totals; search; filters for month,
  account, category and tag.
- **Add:** expense · income · transfer. Amount first, category grid (most used first), account
  remembered, payee suggestions that remember the last category, sums like `1200+340`, date chips,
  tags, receipt photo, split.
- **Accounts:** net worth, accounts grouped by type, "Check a balance", import. Each account has its
  page; a card's page shows the next payment and the statement so far.
- **Plan:** Budget · Bills (calendar and list) · Goals.
- **Stats:** period presets and charts (section 10).
- **Import** and **Settings** (sync, preferences, categories, tags, rules, backup), as in Reading Log.

## 5. Adding and correcting

- Card payments and moves between your own accounts are **transfers**, never spending, so nothing
  is counted twice.
- Yen ↔ dollar transfers keep both amounts, so the real rate (fees included) is known.
- **Check a balance:** type the balance you see (bank app, Suica in Wallet); the app records the
  difference — as spending in a category (e.g. Suica → Transport) or as a correction that doesn't
  count as spending (e.g. investment values).
- Refunds count as money back in their category.

## 6. Currencies

- Balances are always shown in the account's own currency.
- Totals, budgets and stats use the display currency: each dollar transaction at its own day's rate.
- Net worth uses the latest rate (looked up once a day, kept for offline use).
- Rates missing because a transaction was saved offline are filled in later automatically.

## 7. Budgets

- Monthly, per category, plus a total. The pace line shows where you'd expect to be today:
  bills due so far plus an even share of everyday spending.
- Over budget is shown with an icon and the amount in words, never by colour alone.
- Optional roll-over of unspent amounts (off by default).

## 8. Bills, subscriptions and reminders

- Repeats: every month on a day (or the last day), every N months (water every 2 months), yearly,
  every N weeks; start and end dates; amount fixed or "about".
- Due dates on a weekend move to the next business day (Japanese public holidays later, phase 4).
- **Card payments appear automatically** from the card's closing and payment days, with the amount
  added up from the statement period (replaced by the real amount when you import the statement).
- Paydays and other regular income on the calendar too.
- **Mark paid** creates the transaction, pre-filled; the amount can be changed.
- Optional "add automatically on the due date" for fixed subscriptions (safe with two devices).
- Reminders: a notice on Home; `.ics` files (one bill or all) with alarms for the iPhone Calendar;
  Google Calendar link.
- Subscriptions total per month and per year, dollars converted at today's rate.

## 9. Goals

- Target amount and optional date → "save ¥X a month to get there".
- Progress from a linked account's balance, or from amounts you add by hand.

## 10. Stats

- Periods: This month · Last month · This year · Last year · Last 12 months · All time · Custom;
  account filter. Filters live in the URL, like Reading Log.
- Tiles: spent, income, saved (% of income), bills, average per day.
- Charts: income and spending per month (paired columns), where the money went (donut),
  spending by category (bars), net worth (line), top payees, tags, dollars vs yen.
  Every chart has hover/tap details and a "Show table" view.
- **Colours** (checked with the colour-blindness validator, light and dark):
  - Income / spending: Reading Log's pair — light `#35679f` / `#a8653a`, dark `#5f8fcb` / `#c27c48`.
  - Categories: light `#2979c9` `#954a1e` `#02995a` `#aa4b8a` `#5b3d87`,
    dark `#156ab9` `#ad4c02` `#2aaa6a` `#a34584` `#9d67e9`; "Other" grey `#868c92` / `#7a8289`.
    These five pass every check against each other (all pairs, so any order works), which keeps
    colours stable when a category is missing from a period. As with Reading Log's genre pie:
    **your 5 biggest categories (over the last 12 months) keep their colours; the rest are Other.**
    Grey sits close to two of them for colour-blind readers, so slices always carry labels, gaps and a table.
  - Lists: money in is "+¥…" in green text; spending has a minus sign; overspending has a warning icon
    and words.

## 11. Import and export

- **CSV import:** detects UTF-8 or Shift_JIS; understands Japanese headers, dates such as
  `2026/09/30`, `2026年9月30日` and `R8.9.30`, amounts with `¥`, commas, full-width digits and minus
  signs, and separate withdrawal/deposit columns. Half-width katakana is normalised (`ﾛｰｿﾝ` → `ローソン`)
  before rules are matched.
- Preview before importing: duplicates (same account and amount, date within a few days) are
  unticked; categories come from your rules and your history; the column mapping is remembered per account.
- Ready-made settings for your banks and cards once I know which ones (question 1).
- Bank files stay on the device; only the imported transactions are synced. Real files used for testing
  are never committed (`.gitignore` blocks `*.csv`, `*.pdf` and `tests/_local*`).
- Export: JSON backup, CSV of transactions (spreadsheets, tax), `.ics` of bills.

## 12. Not possible / limits

| Idea | Result |
|---|---|
| Connect to banks and cards automatically | Not possible without a server; Japanese banks only open their APIs to registered companies. CSV import instead. |
| Read bank websites from the app | Blocked by browsers (CORS). CSV instead; a bookmarklet only for a bank without CSV downloads. |
| Reminders while the app is closed | Not reliable without a server → `.ics` alarms in the iPhone Calendar. |
| Exact exchange rate of a card purchase | Only known from the statement; estimated until then. |
| Apple Pay → automatic entry | Maybe: an iPhone Shortcut ("Transaction" automation in Wallet) can open the Add form pre-filled. But links open in Safari, not the Home Screen app, and the two keep separate data. Needs testing on your phone (phase 4). |
| Reading receipts automatically | Not planned (large download, unreliable on Japanese receipts). Photos are kept instead. |
| Live investment prices | Not planned; update values with "Check a balance". |

## 13. Build phases

1. **Foundation:** project and deploy; storage and sync (monthly files); accounts; categories;
   transactions (add, edit, delete, transfers, refunds, splits); Activity with search and filters;
   account pages; Home (basic); exchange rates; JSON backup; dark mode; installable, offline.
2. **Planning:** budgets with pace; bills and subscriptions calendar; card payments; paydays;
   reminders (`.ics` and in-app); goals; "Check a balance".
3. **Import and stats:** CSV import (Shift_JIS, bank presets, duplicates, rules); Stats with charts;
   CSV export; receipt photos and statements.
4. **Extras:** net worth history; privacy mode (hide amounts); Japanese holidays for due dates;
   Apple Pay shortcut test; year in review; optional encryption.

Each phase: tests for every `lib/` file, `npm run check && npm test && npm run build` before each push,
a phone-sized browser test with simulated GitHub/exchange-rate services, and a confirmed deploy.

## 14. Questions for you

1. Which banks, cards and payment apps do you use (yen and dollar)? Do they offer CSV downloads?
2. Budget months: calendar months (1st to last day), or payday to payday (e.g. 25th–24th)?
3. Do you ever pay in dollars with a yen card, or in yen with a dollar card?
4. Suica, PASMO, PayPay: keep them as accounts (checking the balance now and then), or count each
   top-up as spending?
5. Encrypt the synced data with a passphrase? Safer if your GitHub account were ever broken into, but
   you'd type it on each device, and if it's forgotten the synced copy can't be opened.
6. Did you use another app or a spreadsheet before (Money Forward ME, Zaim, Excel…) whose history
   you'd like to import?
7. Are the name "Money Log", the six tabs and the default categories OK?

## 15. Setup (when phase 1 is ready)

1. `money-app` repo → **Settings** → **Pages** → Source: **GitHub Actions**.
2. Create a **private** repo `money-data` (it can stay empty).
3. Fine-grained token: access to `money-data` only, permission **Contents: Read and write**; pasted
   into the app's Settings on each device (never in chat).
