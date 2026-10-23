import * as db from '#server/db';
import { ValidationError } from '#server/errors';
import { accountModel } from '#server/models';
import { getStoredDecimalPlaces } from '#shared/fx/currency';

export async function getAccountDecimalPlaces(
  accountId: db.DbAccount['id'],
): Promise<number> {
  const account = await db.first<Pick<db.DbAccount, 'currency'>>(
    'SELECT currency FROM accounts WHERE id = ?',
    [accountId],
  );
  return getStoredDecimalPlaces(account?.currency);
}

// Checks that an account can be given `currency`, and returns whether that
// changes its currency. An account keeps a currency it already has, even
// one that can no longer be chosen. Setting the currency of an account that
// doesn't exist would create a row for it, so that is refused.
export async function checkAccountCurrencyChange(
  accountId: db.DbAccount['id'],
  currency: db.DbAccount['currency'],
): Promise<boolean> {
  const account = await db.first<Pick<db.DbAccount, 'currency'>>(
    'SELECT currency FROM accounts WHERE id = ? AND tombstone = 0',
    [accountId],
  );
  if (!account) {
    throw new ValidationError(`account does not exist: ${accountId}`);
  }
  if ((account.currency ?? null) === (currency ?? null)) {
    return false;
  }
  accountModel.validateCurrency(currency);
  await assertCurrencyChangeKeepsAmounts(accountId, account.currency, currency);
  return true;
}

// A currency change only relabels stored amounts. Between currencies with a
// different number of decimal places that would multiply or divide every
// existing amount by a power of ten, so it is refused once the account has
// transactions.
async function assertCurrencyChangeKeepsAmounts(
  accountId: db.DbAccount['id'],
  storedCurrency: db.DbAccount['currency'],
  currency: db.DbAccount['currency'],
): Promise<void> {
  const storedDecimalPlaces = getStoredDecimalPlaces(storedCurrency);
  const newDecimalPlaces = getStoredDecimalPlaces(currency);
  if (storedDecimalPlaces === newDecimalPlaces) {
    return;
  }
  const transaction = await db.first<{ id: string }>(
    'SELECT id FROM transactions WHERE acct = ? AND tombstone = 0 LIMIT 1',
    [accountId],
  );
  if (transaction) {
    // Accounts without a currency of their own use the default currency
    const target = currency
      ? `${currency} uses ${newDecimalPlaces}`
      : `accounts in the default currency use ${newDecimalPlaces}`;
    throw new ValidationError(
      `The transactions of this account are stored with ${storedDecimalPlaces} decimal places and ${target}, so its currency cannot be changed`,
    );
  }
}

// Rescales an integer amount stored with two decimal places, the scale
// banks and the sync server report in
export function fromTwoDecimalPlaces(
  amount: number,
  decimalPlaces: number,
): number {
  if (decimalPlaces === 2) {
    return amount;
  }
  // Round half away from zero so x and -x rescale to exact opposites
  const magnitude = Math.round(Math.abs(amount) * 10 ** (decimalPlaces - 2));
  return amount < 0 && magnitude !== 0 ? -magnitude : magnitude;
}
