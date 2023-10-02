import { useMemo, useState } from 'preact/hooks';
import { Button, Modal } from 'react-daisyui';
import AmplitudeLogo from '../../../assets/AmplitudeLogo';
import { CloseButton } from '../../../components/CloseButton';
import LabelledInputField from '../../../components/LabelledInputField';
import { PublicKey } from '../../../components/PublicKey';
import { ParachainStakingCandidate, ParachainStakingInflationInflationInfo } from '../../../hooks/staking/staking';
import { nativeToDecimal } from '../../../shared/parseNumbers';
import { DelegationMode } from './ExecuteDelegationDialogs';

interface DelegateToCollatorDialogProps {
  availableBalance?: string;
  collator?: ParachainStakingCandidate;
  inflationInfo?: ParachainStakingInflationInflationInfo;
  minDelegatorStake: string;
  tokenSymbol: string;
  visible: boolean;
  mode: DelegationMode;
  onClose?: () => void;
  onSubmit?: (amount: string) => void;
}

function DelegateToCollatorDialog(props: DelegateToCollatorDialogProps) {
  const {
    availableBalance = '0',
    collator,
    inflationInfo,
    minDelegatorStake,
    tokenSymbol,
    visible,
    onClose,
    onSubmit,
    mode = 'joining',
  } = props;

  const [amount, setAmount] = useState<string>('');
  const [error, setError] = useState<string>('');
  const annual = inflationInfo?.delegator.rewardRate.annual;

  const CollatorInfo = useMemo(
    () =>
      collator ? (
        <div className="flex flex-col xs:flex-row xs:items-center rounded-lg bg-base-200 justify-between text-right p-5 gap-2">
          <div className="flex flex-row items-center">
            <AmplitudeLogo className="w-8 h-8 mr-2 bg-base-200" width="50" height="50" />
            <PublicKey variant="shorter" publicKey={collator.id} />
          </div>
          <div>
            <div className="text-lg">APR {annual || '0.00%'}</div>
            <div className="text-sm text-neutral-content" hidden={mode === 'delegatingMore'}>
              Min Bond {nativeToDecimal(minDelegatorStake).toFixed(4)} {tokenSymbol}
            </div>
          </div>
        </div>
      ) : (
        <div />
      ),
    [annual, collator, minDelegatorStake, mode, tokenSymbol],
  );

  const titleAction = useMemo(() => (mode === 'unstaking' ? 'Unstake' : 'Stake'), [mode]);
  const available = nativeToDecimal(availableBalance).toFixed(4);

  return (
    <Modal open={visible}>
      <Modal.Header className="font-bold">{titleAction}</Modal.Header>
      <CloseButton
        onClick={() => {
          setAmount('');
          setError('');
          if (onClose) onClose();
        }}
      />
      <Modal.Body>
        {CollatorInfo}
        <div className="mt-4" />
        <LabelledInputField
          type="number"
          value={amount}
          onChange={(val: string) => {
            setAmount(val);
            if (parseFloat(val) > parseFloat(available)) {
              setError('Amount is higher than available.');
            } else {
              setError('');
            }
          }}
          error={error}
          label="Amount"
          secondaryLabel={`Available: ${available} ${tokenSymbol}`}
          placeholder="Enter amount..."
          extraBtnText="Max"
          extraBtnAction={() => setAmount(available)}
        />
      </Modal.Body>
      <Modal.Actions className="justify-center">
        <Button className="px-6" color="primary" onClick={() => onSubmit && onSubmit(amount)} disabled={!!error}>
          {titleAction}
        </Button>
      </Modal.Actions>
    </Modal>
  );
}

export default DelegateToCollatorDialog;
