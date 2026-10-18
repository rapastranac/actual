import { renderHook } from '@testing-library/react';

import { useCurrencyOptions } from './useCurrencyOptions';

function getCodes(options: Array<[string, string]>) {
  return options.map(([code]) => code);
}

describe('useCurrencyOptions', () => {
  it('lists every supported currency for the default currency', () => {
    const { currencyOptions } = renderHook(() => useCurrencyOptions()).result
      .current;

    expect(getCodes(currencyOptions)).toEqual(
      expect.arrayContaining(['', 'CAD', 'USD', 'JPY', 'KRW']),
    );
  });

  it('only lists currencies with two decimal places for accounts', () => {
    const { getAccountCurrencyOptions } = renderHook(() => useCurrencyOptions())
      .result.current;

    const codes = getCodes(getAccountCurrencyOptions(null));
    expect(codes).toEqual(expect.arrayContaining(['CAD', 'USD', 'COP']));
    expect(codes).not.toContain('');
    expect(codes).not.toContain('JPY');
    expect(codes).not.toContain('KRW');
  });

  it('keeps listing a currency the account already has', () => {
    const { getAccountCurrencyOptions, getCurrencyLabel } = renderHook(() =>
      useCurrencyOptions(),
    ).result.current;

    const codes = getCodes(getAccountCurrencyOptions('JPY'));
    expect(codes).toContain('JPY');
    expect(codes).not.toContain('KRW');
    // In its usual place among the other currencies
    expect(codes.indexOf('JPY')).toBeGreaterThan(codes.indexOf('INR'));
    expect(codes.indexOf('JPY')).toBeLessThan(codes.indexOf('LKR'));

    // A currency this version doesn't know is listed by its code
    expect(getAccountCurrencyOptions('XYZ').at(-1)).toEqual([
      'XYZ',
      getCurrencyLabel('XYZ'),
    ]);
  });
});
