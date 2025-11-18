import {
  ERC20_EURE_POLYGON_DECIMALS,
  ERC20_EURE_POLYGON_V2,
  getAddressForFormat,
  getOnChainTokenDetails,
  multiplyByPowerOfTen,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import { readContract, signTypedData } from "@wagmi/core";
import { RampService } from "../../services/api";
import { MoneriumService } from "../../services/api/monerium.service";
import { signAndSubmitEvmTransaction, signAndSubmitSubstrateTransaction } from "../../services/transactions/userSigning";
import { wagmiConfig } from "../../wagmiConfig";
import { RampContext, RampMachineActor, RampState } from "../types";

export enum SignRampErrorType {
  InvalidInput = "INVALID_INPUT",
  UserRejected = "USER_REJECTED",
  UnknownError = "UNKNOWN_ERROR"
}
export class SignRampError extends Error {
  type: SignRampErrorType;
  constructor(message: string, type: SignRampErrorType) {
    super(message);
    this.type = type;
  }
}

async function signERC2612Permit(
  owner: `0x${string}`,
  spender: `0x${string}`,
  valueUnits: string
): Promise<{ r: `0x${string}`; s: `0x${string}`; v: number; deadline: number }> {
  const value = multiplyByPowerOfTen(valueUnits, ERC20_EURE_POLYGON_DECIMALS);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  const nonce = (await readContract(wagmiConfig, {
    abi: [
      {
        inputs: [{ name: "owner", type: "address" }],
        name: "nonces",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function"
      }
    ],
    address: ERC20_EURE_POLYGON_V2,
    args: [owner],
    functionName: "nonces"
  })) as bigint;

  const domain = {
    chainId: BigInt(137), // TODO find.
    name: "Monerium EURe",
    verifyingContract: ERC20_EURE_POLYGON_V2,
    version: "1"
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  };

  const message = {
    deadline,
    nonce,
    owner,
    spender,
    value
  };
  console.log("DEBUG: Signing ERC2612 Permit with message:", message);

  const signature = await signTypedData(wagmiConfig, {
    account: owner,
    domain,
    message,
    primaryType: "Permit",
    types
  });

  const v = parseInt(signature.slice(130, 132), 16);
  const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`;

  return { deadline: Number(deadline), r, s, v };
}

export const signTransactionsActor = async ({
  input
}: {
  input: { parent: RampMachineActor; context: RampContext };
}): Promise<RampState> => {
  const {
    rampState,
    rampDirection,
    quote,
    connectedWalletAddress,
    chainId,
    executionInput,
    substrateWalletAccount,
    getMessageSignature
  } = input.context;

  if (!rampState || !connectedWalletAddress || chainId === undefined) {
    throw new SignRampError("Missing required context for signing", SignRampErrorType.InvalidInput);
  }

  const userTxs = rampState?.ramp?.unsignedTxs?.filter(tx => {
    // If a monerium wallet address is provided in the execution input, we use that as the signer address.
    const signerAddress = executionInput?.moneriumWalletAddress || connectedWalletAddress;
    if (!signerAddress) {
      return false;
    }

    return chainId < 0 && (tx.network === Networks.Pendulum || tx.network === Networks.AssetHub)
      ? getAddressForFormat(tx.signer, 0) === getAddressForFormat(signerAddress, 0)
      : tx.signer.toLowerCase() === signerAddress.toLowerCase();
  });

  // Add userTx for monerium onramp. Signature is required, which is created in this process.
  if (rampDirection === RampDirection.BUY && quote?.from === "sepa") {
    userTxs?.push({
      meta: {},
      network: Networks.Polygon,
      nonce: 0,
      phase: "moneriumOnrampMint",
      signer: executionInput?.moneriumWalletAddress as `0x${string}`,
      txData: {} as any // Placeholder, actual txData is not needed for signing the permit
    });
  }
  if (!userTxs || userTxs.length === 0) {
    console.log("No user transactions found requiring signature.");
    return rampState;
  }

  let squidRouterApproveHash: string | undefined = undefined;
  let squidRouterSwapHash: string | undefined = undefined;
  let assethubToPendulumHash: string | undefined = undefined;
  let moneriumOfframpSignature: string | undefined = undefined;
  let moneriumOnrampApproveHash: string | undefined = undefined;
  let moneriumOnrampPermit: { v: number; r: `0x${string}`; s: `0x${string}`; deadline: number } | undefined = undefined;

  const sortedTxs = userTxs?.sort((a, b) => a.nonce - b.nonce);

  // Monerium onramp
  if (rampDirection === RampDirection.SELL && quote?.from === "sepa") {
    if (!getMessageSignature) throw new Error("getMessageSignature not available");
    const offrampMessage = await MoneriumService.createRampMessage(rampState.quote.outputAmount, "THIS WILL BE THE IBAN");
    moneriumOfframpSignature = await getMessageSignature(offrampMessage);
  }

  if (!sortedTxs) {
    throw new SignRampError("Missing sorted transactions", SignRampErrorType.UnknownError);
  }

  const isNativeTokenTransfer = Boolean(
    executionInput?.onChainToken && getOnChainTokenDetails(executionInput.network, executionInput.onChainToken)?.isNative
  );

  try {
    for (const tx of sortedTxs) {
      if (tx.phase === "squidRouterApprove") {
        if (isNativeTokenTransfer) {
          input.parent.send({ phase: "started", type: "SIGNING_UPDATE" });
          continue;
        }
        input.parent.send({ phase: "started", type: "SIGNING_UPDATE" });
        squidRouterApproveHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ phase: "signed", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "squidRouterSwap") {
        squidRouterSwapHash = await signAndSubmitEvmTransaction(tx);
        input.parent.send({ phase: "finished", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "assethubToPendulum") {
        if (!substrateWalletAccount) {
          throw new Error("Missing substrateWalletAccount, user needs to be connected to a wallet account. ");
        }
        input.parent.send({ phase: "started", type: "SIGNING_UPDATE" });
        assethubToPendulumHash = await signAndSubmitSubstrateTransaction(tx, substrateWalletAccount);
        input.parent.send({ phase: "finished", type: "SIGNING_UPDATE" });
      } else if (tx.phase === "moneriumOnrampMint") {
        input.parent.send({ phase: "login", type: "SIGNING_UPDATE" });
        moneriumOnrampPermit = await signERC2612Permit(
          executionInput?.moneriumWalletAddress as `0x${string}`,
          executionInput?.ephemerals.evmEphemeral.address as `0x${string}`,
          rampState.quote.inputAmount
        );
        input.parent.send({ phase: "finished", type: "SIGNING_UPDATE" });
      } else {
        throw new Error(`Unknown transaction received to be signed by user: ${tx.phase}`);
      }
    }
  } catch (error) {
    console.log("Error during signing transactions: ", error);
    // We try to catch an error caused by user rejection of the signature request.
    if (error instanceof Error && error.message) {
      if (error.message.includes("User rejected the request")) {
        throw new SignRampError("User rejected the signature request.", SignRampErrorType.UserRejected);
      }
      throw new SignRampError("Error signing transaction", SignRampErrorType.UnknownError);
    }
    throw new SignRampError("Error signing transaction", SignRampErrorType.UnknownError);
  }

  const additionalData = {
    assethubToPendulumHash,
    moneriumOfframpSignature,
    moneriumOnrampPermit,
    squidRouterApproveHash,
    squidRouterSwapHash
  };

  if (!rampState.ramp) {
    throw new Error("Ramp state is missing, cannot update ramp with user signatures.");
  }
  const updatedRampProcess = await RampService.updateRamp(rampState.ramp.id, [], additionalData);

  return {
    ...rampState,
    ramp: updatedRampProcess,
    userSigningMeta: {
      assethubToPendulumHash,
      moneriumOnrampPermit,
      squidRouterApproveHash,
      squidRouterSwapHash
    }
  };
};
