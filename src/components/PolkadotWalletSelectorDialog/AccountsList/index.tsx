import { WalletAccount } from '@talismn/connect-wallets';
import { useDeferredValue, useState } from 'react';

import { SearchInput } from '../../SearchInput';
import { AccountCard } from '../../AccountCard';

interface ConnectModalAccountsListProps {
  accounts: WalletAccount[];
}

export const ConnectModalAccountsList = ({ accounts }: ConnectModalAccountsListProps) => {
  const [inputSearchValue, setInputSearchValue] = useState<string>('');
  const deferredInputSearchValue = useDeferredValue(inputSearchValue);

  const filteredAccounts = deferredInputSearchValue.length
    ? accounts.filter((account) => account.address.toLowerCase().includes(deferredInputSearchValue.toLowerCase()))
    : accounts;

  return (
    <section>
      <SearchInput set={setInputSearchValue} />
      <ul className="mt-2">
        {filteredAccounts.map((account: WalletAccount) => (
          <AccountCard account={account} key={account.address} />
        ))}
      </ul>
    </section>
  );
};
