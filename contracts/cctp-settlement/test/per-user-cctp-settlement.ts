import { expect } from "chai";
import { ethers } from "hardhat";

const ETHEREUM_DOMAIN = 0;
const STANDARD_FINALITY_THRESHOLD = 2000;
const ZERO_BYTES32 = ethers.ZeroHash;
const FORWARD_HOOK_DATA = "0x636374702d666f72776172640000000000000000000000000000000000000000";

function addressToBytes32(address: string) {
  return ethers.zeroPadValue(address, 32);
}

describe("PerUserCctpSettlement", () => {
  async function deployFixture() {
    const [deployer, recipient, caller, otherRecipient] = await ethers.getSigners();

    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    const tokenMessenger = await ethers.deployContract("MockTokenMessengerV2");
    const settlement = await ethers.deployContract("PerUserCctpSettlement", [
      await usdc.getAddress(),
      await tokenMessenger.getAddress(),
      recipient.address
    ]);

    return { caller, deployer, otherRecipient, recipient, settlement, tokenMessenger, usdc };
  }

  it("stores immutable CCTP configuration", async () => {
    const { recipient, settlement, tokenMessenger, usdc } = await deployFixture();

    expect(await settlement.usdc()).to.equal(await usdc.getAddress());
    expect(await settlement.tokenMessenger()).to.equal(await tokenMessenger.getAddress());
    expect(await settlement.ethereumMintRecipient()).to.equal(recipient.address);
    expect(await settlement.mintRecipientBytes32()).to.equal(addressToBytes32(recipient.address));
    expect(await settlement.DESTINATION_CALLER()).to.equal(ZERO_BYTES32);
    expect(await settlement.ETHEREUM_DESTINATION_DOMAIN()).to.equal(ETHEREUM_DOMAIN);
    expect(await settlement.FORWARD_HOOK_DATA()).to.equal(FORWARD_HOOK_DATA);
  });

  it("reverts when there is no USDC balance", async () => {
    const { settlement } = await deployFixture();

    await expect(settlement.sweepUsdc(0, STANDARD_FINALITY_THRESHOLD)).to.be.revertedWith("No USDC balance");
  });

  it("sweeps the full USDC balance into CCTP forwarding with the immutable Ethereum recipient", async () => {
    const { caller, recipient, settlement, tokenMessenger, usdc } = await deployFixture();
    const amount = 1_000_000n;
    const maxFee = 1_000n;

    await usdc.mint(await settlement.getAddress(), amount);

    await expect(settlement.connect(caller).sweepUsdc(maxFee, STANDARD_FINALITY_THRESHOLD))
      .to.emit(settlement, "UsdcSweptAndForwarded")
      .withArgs(
        caller.address,
        amount,
        ETHEREUM_DOMAIN,
        addressToBytes32(recipient.address),
        ZERO_BYTES32,
        maxFee,
        STANDARD_FINALITY_THRESHOLD,
        FORWARD_HOOK_DATA
      )
      .and.to.emit(tokenMessenger, "DepositForBurn")
      .withArgs(
        await usdc.getAddress(),
        amount,
        await settlement.getAddress(),
        addressToBytes32(recipient.address),
        ETHEREUM_DOMAIN,
        ZERO_BYTES32,
        maxFee,
        STANDARD_FINALITY_THRESHOLD,
        FORWARD_HOOK_DATA
      );

    expect(await usdc.balanceOf(await settlement.getAddress())).to.equal(0n);
    expect(await usdc.balanceOf(await tokenMessenger.getAddress())).to.equal(amount);

    const burnCall = await tokenMessenger.lastBurnCall();
    expect(burnCall.amount).to.equal(amount);
    expect(burnCall.destinationDomain).to.equal(ETHEREUM_DOMAIN);
    expect(burnCall.mintRecipient).to.equal(addressToBytes32(recipient.address));
    expect(burnCall.burnToken).to.equal(await usdc.getAddress());
    expect(burnCall.destinationCaller).to.equal(ZERO_BYTES32);
    expect(burnCall.maxFee).to.equal(maxFee);
    expect(burnCall.minFinalityThreshold).to.equal(STANDARD_FINALITY_THRESHOLD);
    expect(burnCall.hookData).to.equal(FORWARD_HOOK_DATA);
    expect(burnCall.depositor).to.equal(await settlement.getAddress());
  });

  it("revokes the TokenMessenger allowance after a successful burn", async () => {
    const { settlement, tokenMessenger, usdc } = await deployFixture();

    await usdc.mint(await settlement.getAddress(), 1_000_000n);
    await settlement.sweepUsdc(0, STANDARD_FINALITY_THRESHOLD);

    expect(await usdc.allowance(await settlement.getAddress(), await tokenMessenger.getAddress())).to.equal(0n);
  });

  it("prevents reentrant sweeps through the TokenMessenger call", async () => {
    const { settlement, tokenMessenger, usdc } = await deployFixture();

    await usdc.mint(await settlement.getAddress(), 1_000_000n);
    await tokenMessenger.setReenter(
      await settlement.getAddress(),
      settlement.interface.encodeFunctionData("sweepUsdc", [0, STANDARD_FINALITY_THRESHOLD])
    );

    await expect(settlement.sweepUsdc(0, STANDARD_FINALITY_THRESHOLD)).to.be.revertedWithCustomError(
      settlement,
      "ReentrancyGuardReentrantCall"
    );
  });

  it("has no owner withdrawal surface", async () => {
    const { settlement } = await deployFixture();
    const functionNames = settlement.interface.fragments
      .filter(fragment => fragment.type === "function")
      .map(fragment => fragment.name);

    expect(functionNames).to.not.include("withdrawToken");
    expect(functionNames).to.not.include("withdrawETH");
    expect(functionNames).to.not.include("execute");
  });

  it("requires non-zero custody-critical constructor addresses", async () => {
    const { recipient, tokenMessenger, usdc } = await deployFixture();

    await expect(
      ethers.deployContract("PerUserCctpSettlement", [ethers.ZeroAddress, await tokenMessenger.getAddress(), recipient.address])
    ).to.be.revertedWith("Invalid USDC");

    await expect(
      ethers.deployContract("PerUserCctpSettlement", [await usdc.getAddress(), ethers.ZeroAddress, recipient.address])
    ).to.be.revertedWith("Invalid messenger");

    await expect(
      ethers.deployContract("PerUserCctpSettlement", [
        await usdc.getAddress(),
        await tokenMessenger.getAddress(),
        ethers.ZeroAddress
      ])
    ).to.be.revertedWith("Invalid recipient");
  });

  it("deploys per-user settlement contracts through the factory", async () => {
    const { recipient, tokenMessenger, usdc } = await deployFixture();
    const factory = await ethers.deployContract("PerUserCctpSettlementFactory", [
      await usdc.getAddress(),
      await tokenMessenger.getAddress()
    ]);
    const settlementAddress = await factory.deploySettlement.staticCall(recipient.address);

    await expect(factory.deploySettlement(recipient.address))
      .to.emit(factory, "SettlementDeployed")
      .withArgs(settlementAddress, recipient.address);

    const settlement = await ethers.getContractAt("PerUserCctpSettlement", settlementAddress);
    expect(await settlement.usdc()).to.equal(await usdc.getAddress());
    expect(await settlement.tokenMessenger()).to.equal(await tokenMessenger.getAddress());
    expect(await settlement.ethereumMintRecipient()).to.equal(recipient.address);
    expect(await settlement.DESTINATION_CALLER()).to.equal(ZERO_BYTES32);
  });
});
