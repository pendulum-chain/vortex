// @ts-nocheck
import Big from "big.js";

interface AxelarScanStatusFees {
  base_fee: number;
  source_base_fee: number;
  destination_base_fee: number;
  source_express_fee: {
    total: number;
  };
  source_confirm_fee: number;
  destination_express_fee: {
    total: number;
  };
  source_token: {
    gas_price: string;
    gas_price_in_units: {
      decimals: number;
      value: string;
    };
  };
  execute_gas_multiplier: number;
}

interface AxelarScanStatusResponse {
  is_insufficient_fee: boolean;
  status: string;
  fees: AxelarScanStatusFees;
  id: string;
}

const DEFAULT_SQUIDROUTER_GAS_ESTIMATE = "800000";

function calculateGasFeeInUnits(feeResponse: AxelarScanStatusFees, estimatedGas: string | number): string {
  const baseFeeInUnitsBig = Big(feeResponse.source_base_fee);

  const estimatedGasBig = Big(estimatedGas);
  const sourceGasPriceBig = Big(feeResponse.source_token.gas_price);

  const executionFeeUnits = estimatedGasBig.mul(sourceGasPriceBig);

  const multiplier = feeResponse.execute_gas_multiplier;
  const executionFeeWithMultiplier = executionFeeUnits.mul(multiplier);

  const totalGasFee = baseFeeInUnitsBig.add(executionFeeWithMultiplier);

  const sourceDecimals = feeResponse.source_token.gas_price_in_units.decimals;
  const totalGasFeeRaw = totalGasFee.mul(Big(10).pow(sourceDecimals));

  return totalGasFeeRaw.lt(0) ? "0" : totalGasFeeRaw.toFixed(0, 0);
}

async function getStatusAxelarScan(swapHash: string): Promise<AxelarScanStatusResponse> {
  try {
    const response = await fetch("https://api.axelarscan.io/gmp/searchGMP", {
      body: JSON.stringify({
        txHash: swapHash
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Error fetching status from axelar scan API: ${response.statusText}`);
    }
    const responseData = await response.json();
    return (responseData as { data: unknown[] }).data[0] as AxelarScanStatusResponse;
  } catch (error) {
    if ((error as { response: unknown }).response) {
      console.error(`Couldn't get status for ${swapHash} from AxelarScan:`, (error as { response: unknown }).response);
    }
    throw error;
  }
}

async function main() {
  const txHash = process.argv[2];
  if (!txHash) {
    console.error(" provide a transaction hash as an argument.");
    process.exit(1);
  }

  console.log(`Fetching status for txHash: ${txHash}`);

  try {
    const axelarScanStatus = await getStatusAxelarScan(txHash);
    if (!axelarScanStatus || !axelarScanStatus.fees) {
      console.error("Could not retrieve fees for the given transaction hash.");
      return;
    }
    const gasFee = calculateGasFeeInUnits(axelarScanStatus.fees, DEFAULT_SQUIDROUTER_GAS_ESTIMATE);
    console.log(`Calculated Gas Fee in Units: ${gasFee}`);
  } catch (error) {
    console.error("Error calculating gas fee:", error);
  }
}

main();
