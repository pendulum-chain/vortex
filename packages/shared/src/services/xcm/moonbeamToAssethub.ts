import { ApiManager } from "@packages/shared";
import { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";

export async function createMoonbeamToAssethubTransfer(
  receiverAddress: string,
  rawAmount: string,
  assetAccountKey: string
): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const networkName = "moonbeam";
  const moonbeamNode = await apiManager.getApi(networkName);

  const receiverAccountHex = u8aToHex(decodeAddress(receiverAddress));

  const destination = { V3: { interior: { X1: { Parachain: 1000 } }, parents: 1 } };
  const beneficiary = {
    V3: { interior: { X1: { AccountId32: { id: receiverAccountHex, network: undefined } } }, parents: 0 }
  };
  const assets = {
    V3: [
      {
        fun: { Fungible: rawAmount },
        id: {
          Concrete: {
            interior: { X2: [{ PalletInstance: 110 }, { AccountKey20: { key: assetAccountKey, network: undefined } }] },
            parents: 0
          }
        }
      }
    ]
  };
  const feeAssetItem = 0;
  const weightLimit = "Unlimited";

  const xcm = moonbeamNode.api.tx.polkadotXcm.transferAssets(destination, beneficiary, assets, feeAssetItem, weightLimit);

  return xcm;
}

/// This function creates an XCM transfer from Moonbeam to AssetHub via Hydration with an asset swap on Hydration.
/// It withdraws the specified asset from Moonbeam, sends it to Hydration, swaps it for DOT, and then forwards the DOT to AssetHub.
/// Finally, it deposits the DOT into the receiver's account on AssetHub.
/// Note: Fee amounts and minimum output amounts are hardcoded for demonstration purposes and should be made configurable.
/// **WARNING**: The resulting XCM transaction does not work because Moonbeam does not allow polkadotXcm::execute calls, see [here](https://github.com/moonbeam-foundation/moonbeam/blob/d4afe3ef43edc1e2c25e478eb14c0a266f1c5f77/runtime/moonbeam/src/xcm_config.rs#L358)
export async function createMoonbeamToAssethubTransferWithSwapOnHydration(
  receiverAddress: string,
  rawAmount: string,
  assetAccountKey: string
): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const networkName = "moonbeam";
  const moonbeamNode = await apiManager.getApi(networkName);

  const receiverAccountHex = u8aToHex(decodeAddress(receiverAddress));

  // TODO: Make fee amounts and minAmountOut configurable
  const hydrationFeeAmount = "500000"; // 0.5 USDT
  const assethubFeeAmount = "900000000"; // 0.09 DOT
  const minDotAmountOut = "1000000000"; // 0.1 DOT

  const xcmMessage = {
    V4: [
      {
        WithdrawAsset: [
          {
            fun: { Fungible: rawAmount },
            id: {
              interior: {
                X2: [{ PalletInstance: 110 }, { AccountKey20: { key: assetAccountKey, network: undefined } }]
              },
              parents: 0
            }
          }
        ]
      },
      {
        SetFeesMode: {
          jitWithdraw: true
        }
      },
      {
        DepositReserveAsset: {
          assets: {
            Wild: {
              AllCounted: 1
            }
          },
          dest: {
            interior: { X1: [{ Parachain: 2034 }] },
            parents: 1 // Hydration
          },
          xcm: [
            {
              BuyExecution: {
                fees: {
                  fun: { Fungible: hydrationFeeAmount },
                  id: {
                    interior: {
                      X3: [
                        { Parachain: 2004 },
                        { PalletInstance: 110 },
                        { AccountKey20: { key: assetAccountKey, network: undefined } }
                      ]
                    },
                    parents: 1
                  }
                },
                weightLimit: "Unlimited"
              }
            },
            {
              ExchangeAsset: {
                give: {
                  Wild: {
                    AllCounted: 1
                  }
                },
                maximal: true,
                want: [
                  {
                    fun: { Fungible: minDotAmountOut },
                    id: {
                      interior: "Here",
                      parents: 1 // DOT on Hydration
                    }
                  }
                ]
              }
            },
            {
              InitiateReserveWithdraw: {
                assets: {
                  Wild: {
                    AllOf: {
                      fun: "Fungible",
                      id: {
                        interior: "Here",
                        parents: 1
                      }
                    }
                  }
                },
                reserve: {
                  interior: { X1: [{ Parachain: 1000 }] },
                  parents: 1 // AssetHub
                },
                xcm: [
                  {
                    BuyExecution: {
                      fees: {
                        fun: { Fungible: assethubFeeAmount },
                        id: {
                          interior: "Here",
                          parents: 1 // DOT on AssetHub
                        }
                      },
                      weightLimit: "Unlimited"
                    }
                  },
                  {
                    DepositAsset: {
                      assets: {
                        Wild: {
                          AllOf: {
                            fun: "Fungible",
                            id: {
                              interior: "Here",
                              parents: 1
                            }
                          }
                        }
                      },
                      beneficiary: {
                        interior: {
                          X1: [
                            {
                              AccountId32: {
                                id: receiverAccountHex,
                                network: undefined
                              }
                            }
                          ]
                        },
                        parents: 0
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    ]
  };

  const maxWeight = { proofSize: "2222220", refTime: "220000000000" };

  return moonbeamNode.api.tx.polkadotXcm.execute(xcmMessage, maxWeight);
}
