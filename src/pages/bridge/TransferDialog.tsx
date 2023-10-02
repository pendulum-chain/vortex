import { hexToU8a } from '@polkadot/util';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'preact/compat';
import { JSXInternal } from 'preact/src/jsx';
import { Button, Divider, Modal } from 'react-daisyui';
import { useGlobalState } from '../../GlobalStateProvider';
import CancelledDialogIcon from '../../assets/dialog-status-cancelled';
import PendingDialogIcon from '../../assets/dialog-status-pending';
import SuccessDialogIcon from '../../assets/dialog-status-success';
import WarningDialogIcon from '../../assets/dialog-status-warning';
import { CloseButton } from '../../components/CloseButton';
import { CopyableAddress } from '../../components/PublicKey';
import TransferCountdown from '../../components/TransferCountdown';
import { calculateDeadline, convertCurrencyToStellarAsset, deriveShortenedRequestId } from '../../helpers/spacewalk';
import { convertRawHexKeyToPublicKey } from '../../helpers/stellar';
import { toTitle } from '../../helpers/string';
import { useSecurityPallet } from '../../hooks/spacewalk/security';
import { useVaultRegistryPallet } from '../../hooks/spacewalk/vaultRegistry';
import { nativeToDecimal } from '../../shared/parseNumbers';
import { TTransfer, TransferType } from './TransfersColumns';

interface BaseTransferDialogProps {
  id: string;
  visible: boolean;
  showMemo?: boolean;
  transfer: TTransfer;
  title?: string;
  content: JSXInternal.Element;
  footer?: JSXInternal.Element;
  statusIcon: JSXInternal.Element;
  actions?: (onConfirm: (() => void) | undefined) => JSXInternal.Element;
  onClose?: () => void;
  onConfirm?: () => void;
}

const defaultActions = (onConfirm: (() => void) | undefined) => (
  <Button className="px-6" color="primary" onClick={onConfirm}>
    OK
  </Button>
);

function BaseTransferDialog(props: BaseTransferDialogProps) {
  const { id, statusIcon, showMemo, transfer, visible, title, content, footer, actions, onClose, onConfirm } = props;

  const { tenantName } = useGlobalState();
  const tenantNameCapitalized = tenantName ? toTitle(tenantName) : 'Pendulum';

  const [vaultStellarPublicKey, setVaultStellarPublicKey] = useState<string | undefined>(undefined);

  // The `stellarAddress` contained in the request will either be the user's Stellar address or the vault's Stellar address (i.e. equal to `vaultStellarPublicKey`).
  const destinationStellarAddress = convertRawHexKeyToPublicKey(transfer.original.stellarAddress.toHex()).publicKey();
  const { getVaultStellarPublicKey } = useVaultRegistryPallet();

  useEffect(() => {
    getVaultStellarPublicKey(transfer.original.vault.accountId)
      .then((publicKey) => {
        if (publicKey) {
          setVaultStellarPublicKey(publicKey.publicKey());
        }
      })
      .catch((e) => {
        setVaultStellarPublicKey(undefined);
        console.error(e);
      });
  }, [getVaultStellarPublicKey, transfer.original.vault.accountId]);

  const expectedStellarMemo = useMemo(() => {
    return deriveShortenedRequestId(hexToU8a(transfer.transactionId));
  }, [transfer]);

  return (
    <Modal id={id} open={visible} className="bg-base-200">
      <CloseButton onClick={onClose} />
      <Modal.Body>
        <div className="flex flex-col items-center justify-between">
          {statusIcon}
          <div className="mt-4" />
          <h1 className="text-xl mb-5">{title}</h1>
          {content}
          <div id="details" className="rounded flex flex-col p-5 mt-1 w-11/12">
            <div className="flex flex-row justify-between">
              <div className="text-sm">Bridge fee</div>
              <div className="text-sm">{nativeToDecimal(transfer.original.fee.toNumber()).toString()}</div>
            </div>
            <div className="flex flex-row justify-between">
              <div className="text-sm">Destination Address (Stellar)</div>
              <CopyableAddress
                inline={true}
                className="text-sm p0"
                variant="short"
                publicKey={destinationStellarAddress}
              />
            </div>
            <div className="flex flex-row justify-between">
              <div className="text-sm">Vault Address ({tenantNameCapitalized})</div>
              <CopyableAddress
                inline={true}
                className="text-sm p-0"
                variant="short"
                publicKey={transfer.original.vault.accountId.toString()}
              />
            </div>
            {vaultStellarPublicKey && (
              <div className="flex flex-row justify-between">
                <div className="text-sm">Vault Address (Stellar)</div>
                <CopyableAddress
                  inline={true}
                  className="text-sm p-0"
                  variant="short"
                  publicKey={vaultStellarPublicKey}
                />
              </div>
            )}
            {showMemo && (
              <div className="flex flex-row justify-between">
                <div className="text-sm">Memo</div>
                <CopyableAddress
                  inline={true}
                  className="text-sm p-0"
                  variant="short"
                  publicKey={expectedStellarMemo}
                />
              </div>
            )}
          </div>
        </div>
        {footer}
      </Modal.Body>
      <Modal.Actions className="justify-center">
        {actions ? actions(onConfirm) : defaultActions(onConfirm)}
      </Modal.Actions>
    </Modal>
  );
}

interface TransferDialogProps {
  transfer: TTransfer;
  visible: boolean;
  onClose?: () => void;
}

export function CompletedTransferDialog(props: TransferDialogProps) {
  const { transfer, visible, onClose } = props;
  const stellarAsset = convertCurrencyToStellarAsset(transfer.original.asset)?.getCode();
  const content = (
    <>
      <div className="text-md">{`You have received  ${transfer.amount} ${stellarAsset}`}</div>
      <div className="mt-4" />
      <div className="flex flex-row justify-between w-11/12">
        <div className="text-sm">Spacewalk transaction</div>
        <CopyableAddress inline={true} className="text-sm" variant="hexa" publicKey={transfer.transactionId} />
      </div>
    </>
  );
  return (
    <BaseTransferDialog
      id="completed-transfer-modal"
      transfer={transfer}
      title="Completed!"
      visible={visible}
      content={content}
      statusIcon={<SuccessDialogIcon />}
      onClose={onClose}
      onConfirm={onClose}
    />
  );
}

export function CancelledTransferDialog(props: TransferDialogProps) {
  const { transfer, visible, onClose } = props;
  const stellarAsset = convertCurrencyToStellarAsset(transfer.original.asset)?.getCode();
  const amountToSend = nativeToDecimal(transfer.original.amount.add(transfer.original.fee).toNumber()).toNumber();
  const content = (
    <>
      <div className="text-sm">
        {`You did not send a Stellar transaction in time, or the transferred amount did not meet the requested amount of ${amountToSend} 
          ${stellarAsset}.`}
      </div>
      <div className="mt-4" />
      <div className="text-sm text-accent ">Contact the team for debugging if you think this is an error.</div>
      <Divider />
      <div className="mt-5" />
      <div className="flex flex-row justify-between w-11/12">
        <div className="text-xs">Spacewalk transaction</div>
        <CopyableAddress inline={true} className="text-xs" variant="hexa" publicKey={transfer.transactionId} />
      </div>
    </>
  );
  return (
    <BaseTransferDialog
      id="completed-transfer-modal"
      transfer={transfer}
      title="Cancelled"
      visible={visible}
      content={content}
      statusIcon={<CancelledDialogIcon />}
      onClose={onClose}
      onConfirm={onClose}
    />
  );
}

export function ReimbursedTransferDialog(props: TransferDialogProps) {
  const { transfer, visible, onClose } = props;

  const stellarAsset = convertCurrencyToStellarAsset(transfer.original.asset)?.getCode();
  const collateralAsset = transfer.original.vault.currencies.collateral;

  const content = (
    <>
      <div className="text-md">
        {'Your redeem request failed but you decided to burn ' +
          stellarAsset +
          ' in return for ' +
          convertCurrencyToStellarAsset(collateralAsset)?.getCode()}
      </div>
      <h1 className="text-xl">
        {transfer.amount} {stellarAsset}
      </h1>
      <div className="mt-4" />
    </>
  );
  return (
    <BaseTransferDialog
      id="reimbursed-transfer-modal"
      transfer={transfer}
      title="Reimburse Successful!"
      visible={visible}
      content={content}
      statusIcon={<SuccessDialogIcon />}
      onClose={onClose}
      onConfirm={onClose}
    />
  );
}

export function PendingTransferDialog(props: TransferDialogProps) {
  const { transfer, visible, onClose } = props;
  const stellarAsset = convertCurrencyToStellarAsset(transfer.original.asset)?.getCode();
  const destinationStellarAddress = convertRawHexKeyToPublicKey(transfer.original.stellarAddress.toHex()).publicKey();
  const amountToSend = nativeToDecimal(transfer.original.amount.add(transfer.original.fee).toNumber());
  const { getActiveBlockNumber } = useSecurityPallet();
  const [, setDeadline] = useState<DateTime>();

  useEffect(() => {
    getActiveBlockNumber().then((active) => {
      setDeadline(
        calculateDeadline(active as number, transfer.original.opentime.toNumber(), transfer.original.period.toNumber()),
      );
    });
  }, [getActiveBlockNumber, setDeadline, transfer.original.opentime, transfer.original.period]);

  const expectedStellarMemo = useMemo(() => {
    // For issue requests we use a shorter identifier for the memo
    return deriveShortenedRequestId(hexToU8a(transfer.transactionId));
  }, [transfer]);

  const issueContent = (
    <>
      <>
        <div
          className="text-xl"
          title={amountToSend.toString()}
        >{`Send ${amountToSend.toNumber()} ${stellarAsset}`}</div>
        <div className="mt-2" />
        <div className="text">With the text memo</div>
        <div className="mt-2" />
        <CopyableAddress inline={true} variant="short" publicKey={expectedStellarMemo} />
        <div className="mt-2" />
        <div className="text-md">In a single transaction to</div>
        <div className="mt-2" />
        <CopyableAddress inline={true} className="text-sm p-0" variant="short" publicKey={destinationStellarAddress} />
        <div className="text-md mt-2">
          Within <TransferCountdown request={transfer.original} />
        </div>
      </>
      <div className="mt-4" />
      <div className="mt-4" />
      <div className="text-sm">
        Note: If you already made the payment, please wait for a few minutes for it to be confirmed.
      </div>
      <div className="mt-4" />
    </>
  );
  const redeemContent = (
    <>
      <div className="text-xl mb-2">{`${amountToSend} ${stellarAsset}`}</div>
      <div className="text-md">The vault has to complete the transaction in:</div>
      <TransferCountdown request={transfer.original} />
      <div className="mt-2" />

      <div className="mt-2" />
    </>
  );
  return (
    <BaseTransferDialog
      id="pending-transfer-modal"
      transfer={transfer}
      title={'Pending'}
      visible={visible}
      showMemo={transfer.type === TransferType.issue}
      content={transfer.type === TransferType.issue ? issueContent : redeemContent}
      statusIcon={<PendingDialogIcon />}
      onClose={onClose}
      onConfirm={onClose}
    />
  );
}

export function FailedTransferDialog(props: TransferDialogProps) {
  const { transfer, visible, onClose } = props;
  const stellarAsset = convertCurrencyToStellarAsset(transfer.original.asset)?.getCode();
  const amountToSend = nativeToDecimal(transfer.original.amount.add(transfer.original.fee).toNumber()).toNumber();
  const compensation = 0.05;
  const content = (
    <>
      <div className="text-xl">{`${amountToSend} ${stellarAsset}`}</div>
      <div className="mt-4" />
    </>
  );
  const footer = (
    <div className="px-5 py-2">
      <div className="text-sm">
        The vault did not send PEN to you on time. Don`t worry - your funds are safe! You`ll get {compensation} PEN
        compensation.
      </div>
      <div className="mt-4" />
      <div className="text-md font-bold pb-1">
        To redeem your {stellarAsset}, you must now pick one of the two options:
      </div>
      <div className="text-md pl-2 pb-1">
        1. Receive compensation of {compensation} {stellarAsset} and retry with another vault.
      </div>
      <div className="text-md pl-2">
        2. Burn {stellarAsset} and get {amountToSend} {stellarAsset} with added {compensation} {stellarAsset} as
        compensation.
      </div>
    </div>
  );
  const actions = () => (
    <>
      <Button className="px-6" variant="outline" color="primary" onClick={() => undefined}>
        1. Compensate
      </Button>
      <Button className="px-6" variant="outline" color="primary" onClick={() => undefined}>
        2. Remburse
      </Button>
    </>
  );
  return (
    <BaseTransferDialog
      id="completed-transfer-modal"
      transfer={transfer}
      title="Your Back to Stellar Request has Failed"
      visible={visible}
      content={content}
      footer={footer}
      statusIcon={<WarningDialogIcon />}
      onClose={onClose}
      onConfirm={onClose}
      actions={actions}
    />
  );
}

export default BaseTransferDialog;
