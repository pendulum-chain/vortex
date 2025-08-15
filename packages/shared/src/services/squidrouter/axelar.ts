import logger from "../../logger";

export interface AxelarScanStatusFees {
  base_fee: number; // in units of the native token.
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
  status: string; // executed or express_executed (for complete).
  fees: AxelarScanStatusFees;
  id: string; // the id of the swap.
}
export async function getStatusAxelarScan(swapHash: string): Promise<AxelarScanStatusResponse> {
  try {
    // POST call, https://api.axelarscan.io/gmp/searchGMP
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
      logger.current.error(`Couldn't get status for ${swapHash} from AxelarScan:`, (error as { response: unknown }).response);
    }
    throw error;
  }
}
