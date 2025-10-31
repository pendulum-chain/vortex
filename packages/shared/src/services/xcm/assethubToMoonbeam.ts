import { SubmittableExtrinsic } from "@polkadot/api/submittable/types";
import { decodeAddress } from "@polkadot/keyring";
import { ISubmittableResult } from "@polkadot/types/types";
import { u8aToHex } from "@polkadot/util";
import { ApiManager } from "../../index";

export async function createAssethubToMoonbeamTransferWithSwapOnHydration(
  receiverAddress: string,
  rawAmount: string,
  assetAccountKey: string
): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const networkName = "assethub";
  const assethubNode = await apiManager.getApi(networkName);

  const receiverAccountHex = u8aToHex(decodeAddress(receiverAddress));

  // TODO: Make fee amounts and minAmountOut configurable
  const hydrationFeeAmount = "500000"; // 0.5 USDT
  const assethubFeeAmount = "500000000 "; // 0.5 DOT // "100000"; // 0.1 USDT
  const minDotAmountOut = "1000000000"; // 0.1 DOT

  const xcmMessage = {
    V4: [
      {
        WithdrawAsset: [
          {
            fun: { Fungible: rawAmount },
            id: {
              interior: {
                X2: [{ PalletInstance: 50 }, { GeneralIndex: 1984 }] // USDT on AssetHub
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
                        { Parachain: 1000 },
                        { PalletInstance: 50 },
                        { GeneralIndex: 1984 } // USDT on AssetHub
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
                  interior: { X1: [{ Parachain: 2004 }] },
                  parents: 1 // Moonbeam
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
                              AccountKey20: {
                                key: receiverAccountHex,
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

  const maxWeight = { proofSize: "222222", refTime: "22000000000" };

  return assethubNode.api.tx.polkadotXcm.execute(xcmMessage, maxWeight);
}
