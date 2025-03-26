import { InputTokenDetails } from '../../constants/tokenConfig';
import { UserBalance } from '../UserBalance';
import wallet from '../../assets/wallet-bifold-outline.svg';

export const UserBalanceWithIcon = (props: { token: InputTokenDetails; onClick: (amount: string) => void }) => (
  <UserBalance {...props}>
    <img src={wallet} alt="Available" className="w-5 h-5 mr-0.5" />
  </UserBalance>
);
