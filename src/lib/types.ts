// Data model. Everything here is stored in IndexedDB and synced to the private
// data repo (money.json + transactions/YYYY-MM.json), so changes must stay
// backwards compatible (add optional fields, never rename).

/** Every synced record. `deleted` records are tombstones kept so deletions sync. */
export interface BaseRecord {
  id: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp, used to merge devices (newest wins)
  deleted?: boolean;
}

export type Currency = 'JPY' | 'USD';

/**
 * bank: bank account · cash: wallet or cash at home · card: credit card ·
 * prepaid: PASMO, Starbucks, PayPay balance… · savings · investment ·
 * lent: money lent to someone (what they still owe you).
 */
export type AccountType = 'bank' | 'cash' | 'card' | 'prepaid' | 'savings' | 'investment' | 'lent';

export interface Account extends BaseRecord {
  name: string;
  type: AccountType;
  currency: Currency;
  /** Balance on openingDate, in the smallest unit (yen, or cents). Cards: amount owed as a negative number. */
  opening: number;
  openingDate: string; // YYYY-MM-DD
  order: number;
  closed?: boolean;
  note?: string;
  /** Prepaid: the account a top-up is charged to (e.g. Rakuten Card). */
  topUpFromId?: string;
  /** Card: the account the card is paid from. */
  paysFromId?: string;
  /** Card: foreign transaction fee in percent, used to estimate dollar purchases (Rakuten: 1.63). */
  foreignFeePct?: number;
}

/**
 * expense: money out (refund = money back into the account, reducing that category) ·
 * income: money in · transfer: between your own accounts · adjustment: balance correction
 * that is not counted as spending or income.
 */
export type TxKind = 'expense' | 'income' | 'transfer' | 'adjustment';

export interface Split {
  categoryId: string;
  amount: number; // smallest unit, > 0
}

/** A purchase made in another currency than the account's (e.g. dollars on a yen card). */
export interface ForeignAmount {
  amount: number; // smallest unit of `currency`
  currency: Currency;
  /** Yen per dollar used for the estimate. */
  rate?: number;
  /** True until the real amount is known (e.g. from the card statement). */
  estimated: boolean;
}

export interface Transaction extends BaseRecord {
  date: string; // YYYY-MM-DD, decides which month file the record lives in
  kind: TxKind;
  accountId: string;
  /** Always positive, in the smallest unit of the account's currency. Adjustments may be negative. */
  amount: number;
  categoryId?: string;
  /** When set, replaces categoryId: parts of the amount in several categories (sum = amount). */
  splits?: Split[];
  refund?: boolean;
  /** Transfers: the receiving account and the amount it received (its own currency). */
  toAccountId?: string;
  toAmount?: number;
  /** Transfers: a top-up of a prepaid account (PASMO, Starbucks…). */
  topUp?: boolean;
  payee?: string;
  note?: string;
  tagIds?: string[];
  foreign?: ForeignAmount;
  /** Added automatically for a subscription or bill: which one, and for which due date. */
  billId?: string;
  billDate?: string;
  /** Added automatically for a card statement's withdrawal. */
  statementId?: string;
}

export type CategoryKind = 'expense' | 'income';

export interface Category extends BaseRecord {
  name: string;
  kind: CategoryKind;
  icon: string;
  order: number;
  hidden?: boolean;
}

export interface Tag extends BaseRecord {
  name: string;
}

export type BillRepeat = 'monthly' | 'yearly';

/**
 * A subscription or regular bill. On each due date the app adds the payment as a
 * transaction by itself (id `bill:<bill id>:<date>`, so two devices add the same one).
 */
export interface Bill extends BaseRecord {
  name: string;
  amount: number; // smallest unit of the account's currency
  accountId: string;
  categoryId?: string;
  repeat: BillRepeat;
  /** Every N months (monthly bills only; 2 = every other month). */
  every?: number;
  /** First payment date; later ones fall on the same day of the month (or the last day, for 29–31). */
  start: string; // YYYY-MM-DD
  /** Last payment date (e.g. the end of an instalment plan); undefined = until stopped. */
  end?: string;
  /** false = only shown in Coming up, never added by itself. */
  auto: boolean;
  note?: string;
}

/** One 分割払い (instalment) plan as it stands on a statement. */
export interface InstalmentRow {
  date: string; // purchase date
  shop: string;
  count: number; // number of payments
  nth: number; // which payment this statement charges
  purchase: number; // amount of the purchase
  fee: number; // total fee of the plan
  pay: number; // charged on this statement
  carry: number; // still owed after this statement
}

/** A card statement (明細) as imported: what is withdrawn and the instalment plans on it. */
export interface Statement extends BaseRecord {
  accountId: string;
  /** The month it is paid in (2026-09 = withdrawn in September, for August purchases). */
  billMonth: string;
  payDate: string; // YYYY-MM-DD
  total: number; // withdrawn
  once: number; // one-time payments (1回払い) on it
  instalments: number; // instalment payments on it
  other: number; // anything else (revolving, adjustments)
  plans: InstalmentRow[];
  fileName?: string;
}

/** A monthly budget for one category. Changes apply from a month on, so past months keep theirs. */
export interface Budget extends BaseRecord {
  categoryId: string;
  amounts: { from: string; amount: number }[]; // from = YYYY-MM, sorted
}

/** Something to save up for. Progress is a linked account's balance, or what you record by hand. */
export interface Goal extends BaseRecord {
  name: string;
  target: number; // yen
  accountId?: string;
  saved?: number; // when not linked to an account
  by?: string; // YYYY-MM target month
  done?: boolean;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings extends BaseRecord {
  id: 'settings';
  theme: Theme;
  defaultAccountId?: string;
}

/** Collections kept in money.json (everything except transactions). */
export interface MainCollections {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  settings: Settings[];
  bills: Bill[];
  statements: Statement[];
  budgets: Budget[];
  goals: Goal[];
}

export interface Collections extends MainCollections {
  transactions: Transaction[];
}

export type CollectionName = keyof Collections;

export const MAIN_COLLECTIONS: (keyof MainCollections)[] = ['accounts', 'categories', 'tags', 'settings', 'bills', 'statements', 'budgets', 'goals'];
export const COLLECTION_NAMES: CollectionName[] = [...MAIN_COLLECTIONS, 'transactions'];

/** Bumped when a collection is added, so older app versions refuse newer data instead of dropping it. 2 added `bills`, 3 `statements`, 4 `budgets` and `goals`. */
export const SCHEMA = 4;
export const APP_ID = 'money-log';
