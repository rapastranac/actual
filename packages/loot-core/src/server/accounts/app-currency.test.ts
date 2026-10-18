import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';

import { app } from './app';

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadMappings();
});

async function getCurrencies() {
  const accounts = await app.handlers['accounts-get']();
  return Object.fromEntries(
    accounts.map(account => [account.id, account.currency]),
  );
}

// Accounts given a currency with other than two decimal places before
// multiple currencies only supported those keep it
async function insertYenAccountWithTransaction() {
  await db.insertAccount({ id: 'yen', name: 'Yen', currency: 'JPY' });
  await db.insertTransaction({
    account: 'yen',
    amount: 1500,
    date: '2026-10-01',
  });
}

describe('account-update', () => {
  it('sets, keeps and clears the currency', async () => {
    await db.insertAccount({ id: 'acct', name: 'US Savings' });

    await app.handlers['account-update']({ id: 'acct', currency: 'USD' });
    expect(await getCurrencies()).toEqual({ acct: 'USD' });

    await app.handlers['account-update']({ id: 'acct', name: 'USD Savings' });
    expect(await getCurrencies()).toEqual({ acct: 'USD' });

    await app.handlers['account-update']({ id: 'acct', currency: null });
    expect(await getCurrencies()).toEqual({ acct: null });
  });

  it('refuses a currency without two decimal places', async () => {
    await db.insertAccount({ id: 'acct', name: 'Chequing' });

    await expect(
      app.handlers['account-update']({ id: 'acct', currency: 'JPY' }),
    ).rejects.toThrow('account currency must have two decimal places: JPY');
    expect(await getCurrencies()).toEqual({ acct: null });
  });

  it.each(['XYZ', ''])('refuses the unsupported currency "%s"', async code => {
    await db.insertAccount({ id: 'acct', name: 'Chequing' });

    await expect(
      app.handlers['account-update']({ id: 'acct', currency: code }),
    ).rejects.toThrow(/unsupported currency/);
  });

  it('keeps working for an account with such a currency', async () => {
    await insertYenAccountWithTransaction();
    const [account] = await app.handlers['accounts-get']();

    // The sidebar renames an account by sending all of it back
    await app.handlers['account-update']({ ...account, name: 'Yen wallet' });

    const [renamed] = await app.handlers['accounts-get']();
    expect(renamed).toMatchObject({ name: 'Yen wallet', currency: 'JPY' });
  });

  it('refuses a currency that would rescale existing amounts', async () => {
    await insertYenAccountWithTransaction();

    await expect(
      app.handlers['account-update']({ id: 'yen', currency: null }),
    ).rejects.toThrow(
      'stored with 0 decimal places and accounts in the default currency use 2, so its currency cannot be changed',
    );
    expect(await getCurrencies()).toEqual({ yen: 'JPY' });
  });
});

describe('accounts-set-currency', () => {
  it('sets the currency of several accounts at once', async () => {
    await db.insertAccount({ id: 'acct1', name: 'Chequing' });
    await db.insertAccount({ id: 'acct2', name: 'Savings' });

    await app.handlers['accounts-set-currency']({
      ids: ['acct1', 'acct2'],
      currency: 'CAD',
    });

    expect(await getCurrencies()).toEqual({ acct1: 'CAD', acct2: 'CAD' });
  });

  it('changes no account when one of them cannot change', async () => {
    await db.insertAccount({ id: 'acct', name: 'Chequing' });
    await insertYenAccountWithTransaction();

    await expect(
      app.handlers['accounts-set-currency']({
        ids: ['acct', 'yen'],
        currency: 'USD',
      }),
    ).rejects.toThrow(/cannot be changed/);

    expect(await getCurrencies()).toEqual({ acct: null, yen: 'JPY' });
  });

  it('leaves accounts that already have the currency as they are', async () => {
    await insertYenAccountWithTransaction();

    await app.handlers['accounts-set-currency']({
      ids: ['yen'],
      currency: 'JPY',
    });

    expect(await getCurrencies()).toEqual({ yen: 'JPY' });
  });

  it('refuses a currency without two decimal places', async () => {
    await db.insertAccount({ id: 'acct', name: 'Chequing' });

    await expect(
      app.handlers['accounts-set-currency']({ ids: ['acct'], currency: 'KRW' }),
    ).rejects.toThrow(/must have two decimal places/);
  });

  it('refuses accounts that do not exist instead of creating them', async () => {
    await db.insertAccount({ id: 'acct', name: 'Chequing' });

    await expect(
      app.handlers['accounts-set-currency']({
        ids: ['acct', 'missing'],
        currency: 'USD',
      }),
    ).rejects.toThrow('account does not exist: missing');

    const rows = await db.all<Pick<db.DbAccount, 'id' | 'currency'>>(
      'SELECT id, currency FROM accounts',
    );
    expect(rows).toEqual([{ id: 'acct', currency: null }]);
  });
});

describe('account-create', () => {
  it('stores the starting balance in the account currency', async () => {
    const id = await app.handlers['account-create']({
      name: 'US Savings',
      balance: 12.34,
      currency: 'USD',
    });

    expect(await getCurrencies()).toEqual({ [id]: 'USD' });
    const [start] = await db.getTransactions(id);
    expect(start.amount).toBe(1234);
  });

  it('refuses a currency without two decimal places', async () => {
    await expect(
      app.handlers['account-create']({
        name: 'Yen wallet',
        balance: 1500,
        currency: 'JPY',
      }),
    ).rejects.toThrow(/must have two decimal places/);

    expect(await app.handlers['accounts-get']()).toEqual([]);
  });
});
