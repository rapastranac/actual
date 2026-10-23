import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';

import {
  checkAccountCurrencyChange,
  fromTwoDecimalPlaces,
  getAccountDecimalPlaces,
} from './decimals';

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadMappings();
});

async function insertAccountWithTransaction(currency: string | null) {
  await db.insertAccount({ id: 'acct', name: 'Account', currency });
  await db.insertTransaction({
    account: 'acct',
    amount: 1500,
    date: '2026-10-01',
  });
}

describe('getAccountDecimalPlaces', () => {
  it('uses the decimal places of the account currency', async () => {
    await db.insertAccount({ id: 'yen', name: 'Yen', currency: 'JPY' });
    await db.insertAccount({ id: 'usd', name: 'USD', currency: 'USD' });

    expect(await getAccountDecimalPlaces('yen')).toBe(0);
    expect(await getAccountDecimalPlaces('usd')).toBe(2);
  });

  it('keeps two decimal places for accounts without a currency', async () => {
    await db.insertAccount({ id: 'plain', name: 'Plain' });

    expect(await getAccountDecimalPlaces('plain')).toBe(2);
    expect(await getAccountDecimalPlaces('missing')).toBe(2);
  });
});

describe('checkAccountCurrencyChange', () => {
  it.each([
    [null, 'USD'],
    ['USD', 'CAD'],
    ['USD', null],
  ])(
    'allows changing %s to %s on an account with transactions',
    async (from, to) => {
      await insertAccountWithTransaction(from);

      await expect(checkAccountCurrencyChange('acct', to)).resolves.toBe(true);
    },
  );

  it.each([
    [null, null],
    ['USD', 'USD'],
    // Accounts keep a currency they already have, even one that can no
    // longer be chosen
    ['JPY', 'JPY'],
  ])('keeps %s when given %s', async (from, to) => {
    await insertAccountWithTransaction(from);

    await expect(checkAccountCurrencyChange('acct', to)).resolves.toBe(false);
  });

  it.each([
    [
      'JPY',
      null,
      /0 decimal places and accounts in the default currency use 2/,
    ],
    ['JPY', 'USD', /0 decimal places and USD uses 2/],
  ])(
    'refuses changing %s to %s on an account with transactions',
    async (from, to, error) => {
      await insertAccountWithTransaction(from);

      await expect(checkAccountCurrencyChange('acct', to)).rejects.toThrow(
        error,
      );
    },
  );

  it('allows any change while the account has no transactions', async () => {
    await db.insertAccount({ id: 'acct', name: 'Account', currency: 'JPY' });

    await expect(checkAccountCurrencyChange('acct', null)).resolves.toBe(true);
  });

  it.each(['JPY', 'KRW'])(
    'refuses giving an account %s, which has no two decimal places',
    async currency => {
      await db.insertAccount({ id: 'acct', name: 'Account' });

      await expect(
        checkAccountCurrencyChange('acct', currency),
      ).rejects.toThrow(/must have two decimal places/);
    },
  );

  it('refuses unsupported currencies', async () => {
    await db.insertAccount({ id: 'acct', name: 'Account' });

    await expect(checkAccountCurrencyChange('acct', 'XYZ')).rejects.toThrow(
      /unsupported currency/,
    );
  });

  it('refuses accounts that do not exist', async () => {
    await db.insertAccount({ id: 'deleted', name: 'Deleted' });
    await db.deleteAccount({ id: 'deleted' });

    await expect(checkAccountCurrencyChange('missing', 'USD')).rejects.toThrow(
      /does not exist/,
    );
    await expect(checkAccountCurrencyChange('deleted', 'USD')).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe('fromTwoDecimalPlaces', () => {
  it.each([
    [150000, 0, 1500],
    [-150050, 0, -1501],
    [12345, 2, 12345],
  ])('rescales %d to %d decimal places as %d', (amount, places, expected) => {
    expect(fromTwoDecimalPlaces(amount, places)).toBe(expected);
  });
});
