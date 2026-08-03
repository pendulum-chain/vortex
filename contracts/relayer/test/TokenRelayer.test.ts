import assert from "node:assert/strict";
import { ethers } from "hardhat";

describe("TokenRelayer", () => {
  async function deployFixture() {
    const [deployer, owner, executor, recipient] = await ethers.getSigners();
    const destination = await ethers.deployContract("MockRelayerDestination");
    const relayer = await ethers.deployContract("TokenRelayer", [await destination.getAddress()]);
    const token = await ethers.deployContract("MockERC20Permit");
    return { deployer, destination, executor, owner, recipient, relayer, token };
  }

  async function signedExecution(
    fixture: Awaited<ReturnType<typeof deployFixture>>,
    options: { payloadData: string; payloadNonce?: bigint; payloadValue?: bigint; value: bigint }
  ) {
    const { owner, relayer, token } = fixture;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const tokenAddress = await token.getAddress();
    const relayerAddress = await relayer.getAddress();
    const deadline = ethers.MaxUint256;
    const payloadNonce = options.payloadNonce ?? 1n;
    const payloadValue = options.payloadValue ?? 0n;

    const permitSignature = ethers.Signature.from(
      await owner.signTypedData(
        {
          chainId,
          name: "Mock Permit Token",
          verifyingContract: tokenAddress,
          version: "1"
        },
        {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
          ]
        },
        {
          deadline,
          nonce: await token.nonces(owner.address),
          owner: owner.address,
          spender: relayerAddress,
          value: options.value
        }
      )
    );

    const payloadSignature = ethers.Signature.from(
      await owner.signTypedData(
        {
          chainId,
          name: "TokenRelayer",
          verifyingContract: relayerAddress,
          version: "1"
        },
        {
          Payload: [
            { name: "destination", type: "address" },
            { name: "owner", type: "address" },
            { name: "token", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
            { name: "ethValue", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
          ]
        },
        {
          data: options.payloadData,
          deadline,
          destination: await fixture.destination.getAddress(),
          ethValue: payloadValue,
          nonce: payloadNonce,
          owner: owner.address,
          token: tokenAddress,
          value: options.value
        }
      )
    );

    return {
      deadline,
      owner: owner.address,
      payloadData: options.payloadData,
      payloadDeadline: deadline,
      payloadNonce,
      payloadR: payloadSignature.r,
      payloadS: payloadSignature.s,
      payloadV: payloadSignature.v,
      payloadValue,
      permitR: permitSignature.r,
      permitS: permitSignature.s,
      permitV: permitSignature.v,
      token: tokenAddress,
      value: options.value
    };
  }

  async function findEvent(transaction: Promise<unknown>, contract: Awaited<ReturnType<typeof ethers.deployContract>>, name: string) {
    const response = (await transaction) as { wait(): Promise<{ logs: Array<{ data: string; topics: string[] }> }> };
    const receipt = await response.wait();
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === name) {
          return parsed;
        }
      } catch {
        // A transaction receipt contains logs from every participating contract.
      }
    }
    assert.fail(`Event ${name} was not emitted`);
  }

  it("rejects a codeless immutable destination", async () => {
    const [, codeless] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("TokenRelayer");
    await assert.rejects(factory.deploy(codeless.address), /InvalidDestination/);
  });

  it("records measured receipt and consumption for an exact transfer", async () => {
    const fixture = await deployFixture();
    const amount = 100n;
    await fixture.token.mint(fixture.owner.address, amount);
    const payloadData = fixture.destination.interface.encodeFunctionData("pull", [
      await fixture.token.getAddress(),
      fixture.recipient.address,
      amount
    ]);
    const params = await signedExecution(fixture, { payloadData, value: amount });

    const event = await findEvent(
      fixture.relayer.connect(fixture.executor).execute(params),
      fixture.relayer,
      "RelayerTransferObserved"
    );
    assert.deepEqual([...event.args], [
      fixture.owner.address,
      await fixture.token.getAddress(),
      amount,
      amount,
      amount
    ]);

    assert.equal(await fixture.token.balanceOf(fixture.recipient.address), amount);
    assert.equal(await fixture.token.balanceOf(await fixture.relayer.getAddress()), 0n);
  });

  it("rejects a fee-on-transfer shortfall without consuming a pre-existing balance", async () => {
    const fixture = await deployFixture();
    const amount = 100n;
    await fixture.token.mint(fixture.owner.address, amount);
    await fixture.token.mint(await fixture.relayer.getAddress(), 10n);
    await fixture.token.setFeeBps(1_000);
    const payloadData = fixture.destination.interface.encodeFunctionData("pull", [
      await fixture.token.getAddress(),
      fixture.recipient.address,
      amount
    ]);
    const params = await signedExecution(fixture, { payloadData, value: amount });

    await assert.rejects(fixture.relayer.connect(fixture.executor).execute(params), /TokenReceiptMismatch/);

    assert.equal(await fixture.token.balanceOf(await fixture.relayer.getAddress()), 10n);
    assert.equal(await fixture.token.balanceOf(fixture.recipient.address), 0n);
    assert.equal(await fixture.relayer.usedPayloadNonces(fixture.owner.address, params.payloadNonce), false);
  });

  it("rolls back a successful destination call that consumes only part of the execution balance", async () => {
    const fixture = await deployFixture();
    const amount = 100n;
    await fixture.token.mint(fixture.owner.address, amount);
    const payloadData = fixture.destination.interface.encodeFunctionData("pull", [
      await fixture.token.getAddress(),
      fixture.recipient.address,
      60n
    ]);
    const params = await signedExecution(fixture, { payloadData, value: amount });

    await assert.rejects(fixture.relayer.connect(fixture.executor).execute(params), /TokenBalanceNotRestored/);

    assert.equal(await fixture.token.balanceOf(fixture.owner.address), amount);
    assert.equal(await fixture.token.balanceOf(fixture.recipient.address), 0n);
  });

  it("returns native refunds to the executor that supplied msg.value", async () => {
    const fixture = await deployFixture();
    const amount = 100n;
    const supplied = ethers.parseEther("1");
    const refund = ethers.parseEther("0.4");
    await fixture.token.mint(fixture.owner.address, amount);
    const payloadData = fixture.destination.interface.encodeFunctionData("pullAndRefund", [
      await fixture.token.getAddress(),
      fixture.recipient.address,
      amount,
      refund
    ]);
    const params = await signedExecution(fixture, { payloadData, payloadNonce: 2n, payloadValue: supplied, value: amount });

    const event = await findEvent(
      fixture.relayer.connect(fixture.executor).execute(params, { value: supplied }),
      fixture.relayer,
      "NativeRefunded"
    );
    assert.deepEqual([...event.args], [fixture.executor.address, refund]);

    assert.equal(await ethers.provider.getBalance(await fixture.relayer.getAddress()), 0n);
    assert.equal(await ethers.provider.getBalance(await fixture.destination.getAddress()), supplied - refund);
  });
});
