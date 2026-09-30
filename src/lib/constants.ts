import type { AccountType, Category, CategoryKind, Settings } from './types';

export const ACCOUNT_TYPES: { value: AccountType; label: string; group: string; icon: string }[] = [
  { value: 'bank', label: 'Bank account', group: 'Everyday', icon: 'bank' },
  { value: 'cash', label: 'Cash', group: 'Everyday', icon: 'cash' },
  { value: 'prepaid', label: 'Prepaid card or app', group: 'Everyday', icon: 'ic' },
  { value: 'card', label: 'Credit card', group: 'Credit cards', icon: 'card' },
  { value: 'savings', label: 'Savings', group: 'Savings & investments', icon: 'safe' },
  { value: 'investment', label: 'Investments', group: 'Savings & investments', icon: 'invest' },
  { value: 'lent', label: 'Money lent', group: 'Money lent', icon: 'handshake' },
];

export const ACCOUNT_TYPE = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.value, t])) as Record<AccountType, (typeof ACCOUNT_TYPES)[number]>;

export const ACCOUNT_GROUPS = ['Everyday', 'Credit cards', 'Savings & investments', 'Money lent'];

/** Rakuten Card's fee for purchases in another currency (海外事務手数料), in percent. */
export const DEFAULT_FOREIGN_FEE = 1.63;

// Fixed ids, so two devices that both create the default list end up with the same records.
const DEFAULTS: [string, string, CategoryKind, string][] = [
  ['cat-home', 'Home (rent)', 'expense', 'home'],
  ['cat-utilities', 'Utilities', 'expense', 'bolt'],
  ['cat-phone', 'Phone & internet', 'expense', 'phone'],
  ['cat-groceries', 'Groceries', 'expense', 'cart'],
  ['cat-eating', 'Eating out', 'expense', 'utensils'],
  ['cat-cafe', 'Cafés', 'expense', 'cup'],
  ['cat-transport', 'Transport', 'expense', 'train'],
  ['cat-shopping', 'Shopping', 'expense', 'bag'],
  ['cat-health', 'Health & beauty', 'expense', 'heart'],
  ['cat-fun', 'Fun', 'expense', 'ticket'],
  ['cat-subs', 'Subscriptions', 'expense', 'repeat'],
  ['cat-travel', 'Travel', 'expense', 'suitcase'],
  ['cat-gifts', 'Gifts', 'expense', 'gift'],
  ['cat-education', 'Education', 'expense', 'book'],
  ['cat-taxes', 'Taxes & insurance', 'expense', 'shield'],
  ['cat-fees', 'Fees', 'expense', 'receipt'],
  ['cat-other', 'Other', 'expense', 'grid'],
  ['cat-salary', 'Salary', 'income', 'income'],
  ['cat-bonus', 'Bonus', 'income', 'income'],
  ['cat-interest', 'Interest & points', 'income', 'income'],
  ['cat-gift-in', 'Gifts received', 'income', 'gift'],
  ['cat-other-in', 'Other income', 'income', 'income'],
];

export function defaultCategories(now: string): Category[] {
  return DEFAULTS.map(([id, name, kind, icon], order) => ({ id, createdAt: now, updatedAt: now, name, kind, icon, order }));
}

/** Icons offered when creating or editing a category. */
export const CATEGORY_ICONS = ['home', 'bolt', 'phone', 'cart', 'utensils', 'cup', 'train', 'bag', 'heart', 'ticket', 'repeat', 'suitcase', 'gift', 'book', 'shield', 'receipt', 'grid', 'income', 'paw', 'scissors', 'music', 'star'];

export function defaultSettings(now: string): Settings {
  return { id: 'settings', createdAt: now, updatedAt: now, theme: 'system' };
}
