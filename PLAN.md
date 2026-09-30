# Money Log — Plan

A personal, single-user money app: accounts, spending, budgets, bills and savings, in yen and
dollars. Built like Reading Log (`MargoF94/reading-app`) and hosted on GitHub Pages.
Interface in English; weeks start on Monday.

Status: **stages 1 and 2 built (plus subscriptions); stage 3 (receipts, stats, CSV export) next.**
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
| Currencies | Yen for everything. Occasional dollar purchases (Apple Pay) are recorded with both the dollar price and the yen the card charges. Dollar accounts can be added later if needed. |
| Totals | In yen |
| Exchange rates | Frankfurter (European Central Bank), jsDelivr fallback — Reading Log's `fx.ts`. Saved on each transaction, editable. |
| Reminders | `.ics` calendar files with alarms (work when the app is closed), plus notices in the app |
| Input | **Manual entry**, optionally filled in from a **receipt photo**. The only import is the **Rakuten Card 明細 (PDF or CSV)**, used to track 分割払い and the monthly withdrawals — no bank history. |
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
- **Loan (money lent):** person, amount lent, repayments (optional plan such as ¥X a month).
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
- **Prepaid cards and apps (PASMO, Starbucks, PayPay…) are accounts** with their own balance and
  spending. A top-up is entered once on the prepaid account and automatically becomes a charge on
  the card that paid for it (Rakuten Card by default, changeable per account). The top-up itself is
  not spending; what you then buy with PASMO or Starbucks is.
- **Receipt photo:** take or choose a photo; the app reads shop, date, total and (if you want)
  the lines, and fills in the form for you to check before saving. How it reads the photo is
  question 8.

## 6. Currencies

- Everything is in yen.
- A dollar purchase with Apple Pay on a yen card: you type the dollar price; the app estimates the
  yen at that day's rate (plus the card's foreign-transaction fee, set in the card's settings) and marks
  it **estimated**. When the Rakuten 明細 is imported, the real yen amount replaces the estimate.
- Exchange rates: Frankfurter (European Central Bank), jsDelivr fallback — Reading Log's `fx.ts`.

## 7. Budgets

- Monthly, per category, plus a total. The pace line shows where you'd expect to be today:
  bills due so far plus an even share of everyday spending.
- Over budget is shown with an icon and the amount in words, never by colour alone.
- Optional roll-over of unspent amounts (off by default).

## 7b. Payday month (from your spreadsheet)

The Budget tab starts from the salary paid on the last business day of the month before (a Friday
if the month ends on a weekend) and lists what goes out that month: rent, the Rakuten withdrawal
(estimated until the 明細 arrives), Paidy, cash, set-asides such as a tattoo fund. What's left is
the amount to save. Optional payslip breakdown (base, overtime, allowances, commute, taxes).

- **Savings** can be split between accounts and cash kept at home.
- **Money lent** to friends is its own kind of account: repayments reduce it, and a
  "everything together" total counts savings plus money still owed to you, like the sheet's REAL TOTAL.

## 8. Bills, subscriptions and reminders

- Repeats: every month on a day (or the last day), every N months (water every 2 months), yearly,
  every N weeks; start and end dates; amount fixed or "about".
- Due dates on a weekend move to the next business day (Japanese public holidays later, phase 4).
- **Card payments appear automatically** from the card's closing and payment days. For Rakuten Card:
  purchases from the 1st to the last day of a month are withdrawn on the 27th of the next month
  (next business day if that's a weekend or holiday).
- **分割払い (instalments):** a purchase paid in N instalments is spread over the months it is
  actually withdrawn, with its 分割手数料 (fee) shown separately. The card page and Plan show, month by
  month, how much will be withdrawn and which instalments make it up, and when each plan ends.
  One-time payments, 分割 and (if ever used) リボ are kept apart.
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

- **Rakuten Card 明細, PDF or CSV.** The PDF from e-NAVI is read in the browser (pdf.js, loaded only
  when needed); CSV works too. Each row gives the date, shop, payment method (`1回払い`,
  `分割変更N回払い(k回目)`, リボ), purchase amount, fee, this month's payment and the balance carried
  to next month. Checked against four real statements (kept only in the work session, never committed):
  every row was read and the totals match.
- **Late 分割 changes:** a purchase switched to 分割 after the statement closed still shows as
  `1回払い` on that statement, but isn't in its total; it appears as instalment 1 on the next one.
  The app matches these so nothing is counted twice and the month's total matches the bill.
- From the plans on the latest statement the app works out **exactly how much 分割払い will be
  charged in each coming month**, plan by plan, and when each plan ends. Rakuten puts any rounding in
  the first instalment and charges the same amount every month after that, so the remaining payments
  are the carried-over balance (翌月繰越残高) divided evenly by the payments left; fees are already
  included. Checked against the real statements: every plan follows this rule. Purchases switched to
  分割 later are added when they appear on the next 明細.
- Rows you entered by hand are matched (same amount, date within a few days) instead of added twice;
  dollar purchases get their real yen amount. Half-width katakana is normalised (`ﾛｰｿﾝ` → `ローソン`)
  before payee rules are matched.
- No bank (三井住友 / MUFG) history import: kept up to date by hand and with "Check a balance".
- Export: JSON backup, CSV of transactions, `.ics` of bills.

## 12. Not possible / limits

| Idea | Result |
|---|---|
| Connect to banks and cards automatically | Not possible without a server; Japanese banks only open their APIs to registered companies. CSV import instead. |
| Read bank websites from the app | Blocked by browsers (CORS). CSV instead; a bookmarklet only for a bank without CSV downloads. |
| Reminders while the app is closed | Not reliable without a server → `.ics` alarms in the iPhone Calendar. |
| Exact exchange rate of a card purchase | Only known from the statement; estimated until then. |
| Apple Pay → automatic entry | Maybe: an iPhone Shortcut ("Transaction" automation in Wallet) can open the Add form pre-filled. But links open in Safari, not the Home Screen app, and the two keep separate data. Needs testing on your phone (phase 4). |
| Reading receipts automatically | Possible, see question 8. Reading on the phone itself (free, private) is weak on Japanese receipts; sending the photo to an AI service (e.g. Claude, with your own API key) reads them well but costs about ¥1–3 per receipt and the photo leaves the phone. |
| Live investment prices | Not planned; update values with "Check a balance". |

## 13. Build phases

1. **Foundation:** project and deploy; storage and sync (monthly files); accounts (banks, cash,
   Rakuten Card, PASMO, Starbucks…); categories; manual transactions (add, edit, delete, transfers,
   refunds, splits, prepaid top-ups charged to the card, dollar purchases); Activity with search and
   filters; account pages; Home (basic); JSON backup; dark mode; installable, offline.
2. **Rakuten Card and planning:** 明細 CSV import; 分割払い schedule and monthly withdrawals; budgets
   (calendar months) with pace; bills and subscriptions calendar; reminders (`.ics` and in-app); goals;
   "Check a balance".
3. **Receipts and stats:** receipt photos (stored and read); Stats with charts; CSV export.
4. **Extras:** privacy mode (hide amounts); Japanese holidays for due dates; Apple Pay shortcut test;
   year in review.

Each phase: tests for every `lib/` file, `npm run check && npm test && npm run build` before each push,
a phone-sized browser test with simulated GitHub/exchange-rate services, and a confirmed deploy.

## 14. Your answers, and what's still open

Answered:
- Banks 三井住友銀行 and MUFG: no history import; everything entered by hand or from receipt photos.
  Rakuten Card 明細 CSV for 分割払い and the monthly withdrawals.
- Budgets run from the 1st of each month (Rakuten charges the 1st–last day of the month).
- Yen for everything; occasional dollar purchases with Apple Pay.
- PASMO, Starbucks (and similar) are tracked as accounts; top-ups are charged to Rakuten Card.
- No encryption: the private repo plus a token limited to it is enough.
- Past history: only the Rakuten 明細.

- Name "Money Log", the six tabs and the default categories: OK.
- Receipts are read **on the phone** (text recognition in the browser, no data sent out); the form is
  filled in with what it finds and you correct the rest.
- Rakuten Card is in Apple Pay (PASMO and Starbucks top-ups, dollar purchases). PayPay and Paidy are
  paid from the 三井住友 debit card.
- Paidy: tracked as a bill from 三井住友; its last payment is on 27 Oct.
- "ケース" in the sheet is cash kept at home: an account of type cash.

## 15. Setup (when phase 1 is ready)

1. `money-app` repo → **Settings** → **Pages** → Source: **GitHub Actions**.
2. Create a **private** repo `money-data` (it can stay empty).
3. Fine-grained token: access to `money-data` only, permission **Contents: Read and write**; pasted
   into the app's Settings on each device (never in chat).
