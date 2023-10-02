import { SubmittableExtrinsic } from '@polkadot/api/promise/types';
import Big from 'big.js';
import _ from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Button, Checkbox, Modal } from 'react-daisyui';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { Asset } from 'stellar-sdk';
import { useGlobalState } from '../../GlobalStateProvider';
import { useNodeInfoState } from '../../NodeInfoProvider';
import LabelledInputField from '../../components/LabelledInputField';
import { CopyableAddress, PublicKey } from '../../components/PublicKey';
import { AssetSelector, VaultSelector } from '../../components/Selector';
import OpenWallet from '../../components/Wallet';
import { convertCurrencyToStellarAsset } from '../../helpers/spacewalk';
import {
  StellarPublicKeyPattern,
  convertRawHexKeyToPublicKey,
  isCompatibleStellarAmount,
  isPublicKey,
  stringifyStellarAsset,
} from '../../helpers/stellar';
import { getErrors, getEventBySectionAndMethod } from '../../helpers/substrate';
import { useFeePallet } from '../../hooks/spacewalk/fee';
import { RichRedeemRequest, useRedeemPallet } from '../../hooks/spacewalk/redeem';
import { ExtendedRegistryVault, useVaultRegistryPallet } from '../../hooks/spacewalk/vaultRegistry';
import { decimalToStellarNative, nativeStellarToDecimal, nativeToDecimal } from '../../shared/parseNumbers';

interface FeeBoxProps {
  bridgedAsset?: Asset;
  // The amount of the bridged asset denoted in the smallest unit of the asset
  amountNative: Big;
  extrinsic?: SubmittableExtrinsic;
  network: string;
  nativeCurrency: string;
  wrappedCurrencySuffix?: string;
}

function FeeBox(props: FeeBoxProps): JSX.Element {
  const { bridgedAsset, extrinsic, nativeCurrency, wrappedCurrencySuffix, network } = props;
  const amount = props.amountNative;

  const wrappedCurrencyName = bridgedAsset ? (wrappedCurrencySuffix || '') + bridgedAsset.getCode() : '';

  const { getFees, getTransactionFee } = useFeePallet();
  const fees = getFees();

  const [transactionFee, setTransactionFee] = useState<Big>(Big(0));

  useEffect(() => {
    if (!extrinsic) {
      return;
    }

    getTransactionFee(extrinsic).then((fee) => {
      setTransactionFee(nativeToDecimal(fee));
    });
  }, [extrinsic, getTransactionFee, setTransactionFee]);

  const bridgeFee = useMemo(() => {
    return nativeStellarToDecimal(amount.mul(fees.redeemFee));
  }, [amount, fees]);

  const totalAmount = useMemo(() => {
    if (amount.cmp(0) === 0) {
      return 0;
    }

    return nativeStellarToDecimal(amount).sub(bridgeFee);
  }, [amount, bridgeFee]);

  return (
    <div className="shadow bg-base-100 rounded-lg p-4 my-4 flex flex-col">
      <div className="flex justify-between">
        <span>To {network}</span>
        <span>
          {totalAmount.toString()} {wrappedCurrencyName}
        </span>
      </div>
      <div className="flex justify-between mt-2">
        <span>Bridge Fee</span>
        <span>
          {bridgeFee.toString()} {bridgedAsset?.getCode()}
        </span>
      </div>
      <div className="flex justify-between mt-2">
        <span>Transaction Fee</span>
        <span>
          {transactionFee.toFixed(12)} {nativeCurrency}
        </span>
      </div>
    </div>
  );
}

interface ConfirmationDialogProps {
  redeemRequest: RichRedeemRequest | undefined;
  onClose: () => void;
  visible: boolean;
}

function ConfirmationDialog(props: ConfirmationDialogProps): JSX.Element {
  const { redeemRequest, visible, onClose } = props;

  const totalAmount = redeemRequest ? nativeStellarToDecimal(redeemRequest.request.amount.toString()).toString() : '';
  const currency = redeemRequest?.request.asset;
  const asset = currency && convertCurrencyToStellarAsset(currency);

  const destination = useMemo(() => {
    const rawDestinationAddress = redeemRequest?.request.stellarAddress;
    return rawDestinationAddress ? convertRawHexKeyToPublicKey(rawDestinationAddress.toHex()).publicKey() : '';
  }, [redeemRequest?.request.stellarAddress]);

  return (
    <Modal open={visible}>
      <Modal.Header className="font-bold">Back to Stellar</Modal.Header>
      <Button color="ghost" size="md" shape="circle" className="absolute right-4 top-4" onClick={onClose}>
        ✕
      </Button>
      <Modal.Body>
        <div className="text-center">
          <div className="text-xl">
            You will receive {totalAmount} {asset?.getCode()}
          </div>
          {asset && asset.getIssuer() && (
            <>
              issued by <PublicKey variant="short" publicKey={asset?.getIssuer()} />
            </>
          )}
          <div className="text-sm text-secondary mt-4">Your request is being processed</div>
        </div>
        <div className="mt-6 text-secondary">
          <div className="flex items-center justify-between">
            <span>Stellar destination address</span>
            <CopyableAddress variant="short" publicKey={destination} />
          </div>
          <div className="text-sm mt-2">
            We will inform you when the PEN payment is executed. This typically takes only a few minutes but may
            sometimes take up to 6 hours.
          </div>
        </div>
      </Modal.Body>

      <Modal.Actions className="justify-center">
        <Button color="primary" onClick={onClose}>
          View Progress
        </Button>
      </Modal.Actions>
    </Modal>
  );
}

interface RedeemFormInputs {
  amount: string;
  stellarAddress: string;
}

interface RedeemProps {
  network: string;
  wrappedCurrencySuffix: string;
  nativeCurrency: string;
}

function Redeem(props: RedeemProps): JSX.Element {
  const [selectedVault, setSelectedVault] = useState<ExtendedRegistryVault>();
  const [selectedAsset, setSelectedAsset] = useState<Asset>();
  const [confirmationDialogVisible, setConfirmationDialogVisible] = useState(false);
  const [submissionPending, setSubmissionPending] = useState(false);
  const [submittedRedeemRequest, setSubmittedRedeemRequest] = useState<RichRedeemRequest | undefined>(undefined);
  const [manualVaultSelection, setManualVaultSelection] = useState(false);
  const [vaults, setExtendedVaults] = useState<ExtendedRegistryVault[]>();

  const { createRedeemRequestExtrinsic, getRedeemRequest } = useRedeemPallet();
  const { getVaults, getVaultsWithRedeemableTokens } = useVaultRegistryPallet();
  const { walletAccount, dAppName } = useGlobalState();
  const { api } = useNodeInfoState().state;

  const { control, handleSubmit, watch } = useForm<RedeemFormInputs>({
    defaultValues: {
      amount: '0',
      stellarAddress: '',
    },
  });

  const { wrappedCurrencySuffix, nativeCurrency } = props;

  // We watch the amount because we need to re-render the FeeBox constantly
  const amount = watch('amount');
  const stellarAddress = watch('stellarAddress');

  useEffect(() => {
    const combinedVaults: ExtendedRegistryVault[] = [];
    getVaultsWithRedeemableTokens().then((vaultsWithRedeemableTokens) => {
      getVaults().forEach((vaultFromRegistry) => {
        const found = vaultsWithRedeemableTokens?.find(([id, _]) => id.eq(vaultFromRegistry.id));
        const extended: ExtendedRegistryVault = vaultFromRegistry;
        extended.redeemableTokens = found ? found[1] : undefined;
        combinedVaults.push(extended);
      });
      setExtendedVaults(combinedVaults);
    });
  }, [getVaults, setExtendedVaults, getVaultsWithRedeemableTokens]);

  // The amount represented in the units of the native currency (as integer)
  const amountNative = useMemo(() => {
    return amount ? decimalToStellarNative(amount) : Big(0);
  }, [amount]);

  const wrappedAssets = useMemo(() => {
    if (!vaults) return;

    const assets = vaults
      .map((vault) => {
        const currency = vault.id.currencies.wrapped;
        return convertCurrencyToStellarAsset(currency);
      })
      .filter((asset): asset is Asset => {
        return asset != null;
      });
    // Deduplicate assets
    return _.uniqBy(assets, (asset: Asset) => stringifyStellarAsset(asset));
  }, [vaults]);

  const vaultsForCurrency = useMemo(() => {
    if (!vaults) return;

    return vaults.filter((vault) => {
      if (!selectedAsset) {
        return false;
      }

      const vaultCurrencyAsAsset = convertCurrencyToStellarAsset(vault.id.currencies.wrapped);
      return vaultCurrencyAsAsset && vaultCurrencyAsAsset.equals(selectedAsset);
    });
  }, [selectedAsset, vaults]);

  useEffect(() => {
    if (vaultsForCurrency && wrappedAssets) {
      if (!manualVaultSelection) {
        // TODO build a better algorithm for automatically selecting a vault
        if (vaultsForCurrency.length > 0) {
          setSelectedVault(vaultsForCurrency[0]);
        }
        if (!selectedAsset && wrappedAssets.length > 0) {
          setSelectedAsset(wrappedAssets[0]);
        }
      } else {
        // If the user manually selected a vault, but it's not available anymore, we reset the selection
        if (selectedVault && vaultsForCurrency.length > 0 && !vaultsForCurrency.includes(selectedVault)) {
          setSelectedVault(vaultsForCurrency[0]);
        }
      }
    }
  }, [manualVaultSelection, selectedAsset, selectedVault, vaultsForCurrency, wrappedAssets]);

  const requestRedeemExtrinsic = useMemo(() => {
    if (!selectedVault || !api || !stellarAddress || !isPublicKey(stellarAddress)) {
      return undefined;
    }

    return createRedeemRequestExtrinsic(amountNative.toString(), stellarAddress, selectedVault.id);
  }, [amountNative, api, createRedeemRequestExtrinsic, selectedVault, stellarAddress]);

  const submitRequestRedeemExtrinsic = useCallback(() => {
    if (!requestRedeemExtrinsic || !api || !selectedVault) {
      return;
    }

    if (!walletAccount) {
      return;
    }

    setSubmissionPending(true);

    requestRedeemExtrinsic
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .signAndSend(walletAccount.address, { signer: walletAccount.signer as any }, (result) => {
        const { status, events } = result;

        const errors = getErrors(events, api);
        if (status.isInBlock) {
          if (errors.length > 0) {
            const errorMessage = `Transaction failed with errors: ${errors.join('\n')}`;
            console.error(errorMessage);
            toast(errorMessage, { type: 'error' });
          }
        } else if (status.isFinalized) {
          const requestRedeemEvents = getEventBySectionAndMethod(events, 'redeem', 'RequestRedeem');

          // We only expect one event but loop over all of them just in case
          for (const requestRedeemEvent of requestRedeemEvents) {
            // We do not have a proper type for this event, so we have to cast it to any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const redeemId = (requestRedeemEvent.data as any).redeemId;

            getRedeemRequest(redeemId).then((redeemRequest) => {
              setSubmittedRedeemRequest(redeemRequest);
            });
          }

          setSubmissionPending(false);

          if (errors.length === 0) {
            setConfirmationDialogVisible(true);
          }
        }
      })
      .catch((error) => {
        console.error('Transaction submission failed', error);
        toast('Transaction submission failed:' + error.toString(), {
          type: 'error',
        });
        setSubmissionPending(false);
      });
  }, [api, getRedeemRequest, requestRedeemExtrinsic, selectedVault, walletAccount]);

  return (
    <div className="flex items-center justify-center h-full space-walk py-4 w-full">
      <ConfirmationDialog
        redeemRequest={submittedRedeemRequest}
        visible={confirmationDialogVisible}
        onClose={() => setConfirmationDialogVisible(false)}
      />
      <div className="w-full">
        <form className="px-5 flex flex-col">
          <div className="flex items-center">
            <Controller
              control={control}
              rules={{
                required: 'Amount is required',
                validate: (value) => {
                  if (!isCompatibleStellarAmount(value)) {
                    return 'Max 7 decimals';
                  }
                  if (selectedVault?.issuableTokens) {
                    const bigValue = new Big(value);
                    const maxIssuable = nativeToDecimal(selectedVault?.issuableTokens?.toString());
                    if (bigValue.gt(maxIssuable)) {
                      return 'Amount is higher than the vault can issue.';
                    }
                  }
                  if (parseFloat(value) <= 0) {
                    return 'Amount should be a positive number.';
                  }
                },
              }}
              name="amount"
              render={({ field, fieldState: { error } }) => (
                <LabelledInputField
                  autoSelect
                  error={error?.message}
                  label="From Amplitude"
                  type="number"
                  min="0"
                  step="any"
                  style={{ flexGrow: 2 }}
                  onKeyPress={(e: KeyboardEvent) => {
                    if (e.code === 'Minus' || e.code === 'KeyE') {
                      e.preventDefault();
                    }
                  }}
                  {...field}
                />
              )}
            />
            <div className="px-1" />
            {wrappedAssets && (
              <AssetSelector
                assetSuffix={wrappedCurrencySuffix}
                selectedAsset={selectedAsset}
                assets={wrappedAssets}
                onChange={setSelectedAsset}
                style={{ flexGrow: 1 }}
              />
            )}
          </div>
          <div className="flex align-center mt-4">
            <span className="text-sm">{`Max redeemable: ${nativeToDecimal(
              selectedVault?.redeemableTokens?.toString() || 0,
            ).toFixed(2)} 
              ${selectedAsset?.code}`}</span>
          </div>

          <div className="flex align-center mt-4">
            <Checkbox
              size="sm"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                if (e.target instanceof HTMLInputElement) {
                  setManualVaultSelection(e.target.checked);
                }
              }}
              checked={manualVaultSelection}
            />
            <span className="ml-2">Manually select vault</span>
          </div>
          {manualVaultSelection && vaultsForCurrency && (
            <VaultSelector
              vaults={vaultsForCurrency}
              onChange={setSelectedVault}
              selectedVault={selectedVault}
              showMaxTokensFor="redeemableTokens"
            />
          )}
          <Controller
            control={control}
            rules={{
              required: 'Stellar address is required',
              pattern: {
                value: StellarPublicKeyPattern,
                message: 'Stellar address is invalid',
              },
            }}
            render={({ field, fieldState: { error } }) => (
              <LabelledInputField
                label="Stellar Address"
                error={error?.message}
                placeholder="Enter target Stellar address"
                type="text"
                {...field}
                style={{ marginTop: 8 }}
              />
            )}
            name="stellarAddress"
          />
          <FeeBox
            amountNative={amountNative}
            bridgedAsset={selectedAsset}
            extrinsic={requestRedeemExtrinsic}
            network="Stellar"
            nativeCurrency={nativeCurrency}
          />
          {walletAccount ? (
            <Button
              className="w-full"
              color="primary"
              loading={submissionPending}
              onSubmit={handleSubmit(submitRequestRedeemExtrinsic)}
              type="button"
            >
              Bridge
            </Button>
          ) : (
            <OpenWallet dAppName={dAppName} />
          )}
        </form>
      </div>
    </div>
  );
}

export default Redeem;
