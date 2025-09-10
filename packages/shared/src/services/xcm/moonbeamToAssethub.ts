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
  const hydrationFeeAmount = "100000";
  const assetHubFeeAmount = "500000000";
  const minDotAmountOut = "1000000000";

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
                        { Parachain: 1000 }, // AssetHub
                        { PalletInstance: 50 },
                        { GeneralIndex: 1984 } // USDT
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
                        fun: { Fungible: assetHubFeeAmount },
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
