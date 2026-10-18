import type { ChangeEvent } from 'react';

import type { AccountEntity } from '@actual-app/core/types/models';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TestProviders } from '#mocks';

import { CurrencySettings } from './Currency';

let mockPrefs: Record<string, string> = {};
const mockSetPref = vi.fn();
let mockAccounts: AccountEntity[] = [];
// The accounts the transactions query finds
let mockTransactionAccounts: Array<{ account: string }> | null = [];
const mockMutate = vi.fn();

vi.mock('#hooks/useSyncedPref', () => ({
  useSyncedPref: (name: string) => [
    mockPrefs[name],
    (value: string) => mockSetPref(name, value),
  ],
}));

vi.mock('#hooks/useAccounts', () => ({
  useAccounts: () => ({ data: mockAccounts }),
}));

vi.mock('#hooks/useQuery', () => ({
  useQuery: () => ({ data: mockTransactionAccounts, isLoading: false }),
}));

vi.mock('#accounts', () => ({
  useSetAccountsCurrencyMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

// A native select, so a test can pick an option
vi.mock('@actual-app/components/select', () => ({
  Select: ({
    value,
    options,
    onChange,
  }: {
    value: string;
    options: Array<readonly [unknown, string] | unknown>;
    onChange: (value: string) => void;
  }) => (
    <select
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
    >
      {options
        .filter(
          (option): option is [string, string] =>
            Array.isArray(option) && typeof option[0] === 'string',
        )
        .map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
    </select>
  ),
}));

function makeAccount(
  id: string,
  fields: Partial<AccountEntity> = {},
): AccountEntity {
  return {
    id,
    name: id,
    offbudget: 0,
    closed: 0,
    sort_order: 0,
    last_reconciled: null,
    tombstone: 0,
    account_id: null,
    bank: null,
    bankName: null,
    bankId: null,
    mask: null,
    official_name: null,
    balance_current: null,
    balance_available: null,
    balance_limit: null,
    account_sync_source: null,
    last_sync: null,
    bank_sync_status: null,
    account_group_id: null,
    currency: null,
    ...fields,
  };
}

function renderSettings() {
  render(
    <TestProviders>
      <CurrencySettings />
    </TestProviders>,
  );
}

function chooseDefaultCurrency(code: string) {
  fireEvent.change(screen.getAllByRole('combobox')[0], {
    target: { value: code },
  });
}

describe('CurrencySettings', () => {
  beforeEach(() => {
    mockPrefs = {
      'flags.currency': 'true',
      'flags.multiCurrency': 'true',
      defaultCurrencyCode: 'CAD',
    };
    mockSetPref.mockClear();
    mockMutate.mockReset();
    mockAccounts = [
      makeAccount('checking'),
      makeAccount('old-savings', { closed: 1 }),
      makeAccount('empty'),
      makeAccount('usd', { currency: 'USD' }),
    ];
    mockTransactionAccounts = [
      { account: 'checking' },
      { account: 'old-savings' },
    ];
  });

  it('asks about the accounts with transactions that follow the default', async () => {
    renderSettings();

    chooseDefaultCurrency('EUR');

    expect(
      screen.getByText(
        'Accounts with transactions that follow the default currency (CAD): 2. Their amounts are not converted when the default changes.',
      ),
    ).toBeInTheDocument();
    expect(mockSetPref).not.toHaveBeenCalledWith(
      'defaultCurrencyCode',
      expect.anything(),
    );

    await userEvent.click(screen.getByText('Keep them in CAD'));

    expect(mockMutate).toHaveBeenCalledWith(
      { ids: ['checking', 'old-savings'], currency: 'CAD' },
      expect.anything(),
    );
  });

  it('changes the default only once the accounts are kept', async () => {
    mockMutate.mockImplementation(
      (_payload, { onSuccess }: { onSuccess: () => void }) => onSuccess(),
    );
    renderSettings();

    chooseDefaultCurrency('EUR');
    await userEvent.click(screen.getByText('Keep them in CAD'));

    expect(mockSetPref).toHaveBeenCalledWith('defaultCurrencyCode', 'EUR');
  });

  it('changes the default right away when no account that follows it has transactions', () => {
    mockTransactionAccounts = [{ account: 'usd' }];
    renderSettings();

    chooseDefaultCurrency('EUR');

    expect(mockSetPref).toHaveBeenCalledWith('defaultCurrencyCode', 'EUR');
    expect(screen.queryByText('Keep them in CAD')).not.toBeInTheDocument();
  });

  it('asks while it is not known yet which accounts have transactions', () => {
    mockTransactionAccounts = null;
    renderSettings();

    chooseDefaultCurrency('EUR');

    expect(screen.getByText('Keep them in CAD')).toBeInTheDocument();
  });

  it('does not ask when multiple currencies are off for the default currency', () => {
    mockPrefs.defaultCurrencyCode = 'JPY';
    renderSettings();

    chooseDefaultCurrency('EUR');

    expect(mockSetPref).toHaveBeenCalledWith('defaultCurrencyCode', 'EUR');
  });

  it('warns that multiple currencies need a default currency with two decimal places', () => {
    mockPrefs.defaultCurrencyCode = 'JPY';
    renderSettings();

    expect(
      screen.getByText(
        'Multiple currencies only work with a default currency that has two decimal places, so they are off while the default is JPY.',
      ),
    ).toBeInTheDocument();
  });

  it('warns before a change turns multiple currencies off', () => {
    renderSettings();

    chooseDefaultCurrency('JPY');

    expect(
      screen.getByText(
        'Multiple currencies turn off with JPY as the default: they only work with a default currency that has two decimal places.',
      ),
    ).toBeInTheDocument();
  });
});
