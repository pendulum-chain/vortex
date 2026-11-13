import assert from "node:assert/strict";
import test from "node:test";
import { parseUnits } from "viem";
import { createVortexStocksAdapter, BASE_USDC, validateStockQuote, normalizeStockQuote, assertUsdcDelivery } from "../src/lib/vortex-stocks.js";
import { decimalRaw, fundingIntentStore, usdcPriceChanged } from "../src/lib/live-usdc.js";
import { settleRamp } from "../src/lib/ramp-contract.js";
import { serverHistoryRows } from "../src/lib/history.js";
import { NOW, EPHEMERAL, NVDA, fakeSdk, fakeWallet, fakeSession, stores, permitTx, destinationTransferTx, vortexQuote } from "./fake-vortex.mjs";
import { WALLET, jsonMemory } from "./helpers.mjs";

function setup({ direction = "BUY", enabled = true, balance = 1000_000000n, mutatePermit = x => x, mutateDelivery = x => x, maintenance = async () => ({ active:false }), time = () => NOW } = {}) {
  const recovery=stores(), log=[], reads=[];
  const sdk=fakeSdk({quote:request=>vortexQuote(request,{gasless:true,paymentMethod:"usdc",feeCurrency:"USDC",anchorFeeFiat:"0",networkFeeFiat:"0.15",processingFeeFiat:"0.05",totalFeeFiat:"0.20",outputAmount:direction==="BUY"?"0.55":"99.8"})});
  const register=sdk.client.registerRamp.bind(sdk.client);
  sdk.client.registerRamp=async(raw,data)=>{
    const result=await register(raw,data), buy=raw.rampType==="BUY";
    let permit=permitTx({signer:WALLET,amountWei:parseUnits(raw.inputAmount,buy?6:18),token:buy?BASE_USDC.address:NVDA});
    if(buy)permit={...permit,network:"base",txData:{...permit.txData,domain:{...permit.txData.domain,chainId:8453,name:"USD Coin",version:"2"}}};
    const delivery=mutateDelivery({...destinationTransferTx({to:WALLET,amountWei:parseUnits(raw.outputAmount,buy?18:6),token:buy?NVDA:BASE_USDC.address}),network:buy?"robinhood":"base"});
    result.rampProcess.unsignedTxs=[delivery,mutatePermit(permit)];
    result.unsignedTransactions=[mutatePermit(permit)];
    return result;
  };
  const baseClient={getBlockNumber:async()=>100n,readContract:async p=>{reads.push(p);return p.functionName==="nonces"?0n:balance;}};
  const adapter=createVortexStocksAdapter({enabled,network:"robinhood",apiBase:"http://test.invalid",session:fakeSession(),activeRampStore:recovery.activeRampStore,ephemeralStore:recovery.ephemeralStore,createClient:sdk.createClient,paymentMethod:"usdc",baseClient,readBalance:async()=>10n**18n,readMaintenance:maintenance,now:time});
  const wallet=fakeWallet(log);
  return {...recovery,adapter,sdk,log,reads,wallet};
}
const buy = s => s.adapter.quoteBuy({symbol:"NVDA",brlAmount:"100",walletAddress:WALLET});

test("native Base USDC preserves six decimals and rejects wrong routes or hidden ramp fees",()=>{
  const raw=vortexQuote({rampType:"BUY",from:"base",to:"robinhood",network:"robinhood",inputCurrency:"USDC",outputCurrency:"NVDA",inputAmount:"10.000001"},{feeCurrency:"USDC",paymentMethod:"usdc",gasless:true,anchorFeeFiat:"0",networkFeeFiat:"0.000001",processingFeeFiat:"0.005",totalFeeFiat:"0.005001"});
  const validate=q=>validateStockQuote(q,{direction:"BUY",network:"robinhood",id:"NVDA",requested:"10.000001",paymentMethod:"usdc",now:NOW});
  validate(raw);
  for(const bad of [{from:"arbitrum"},{inputCurrency:"USDT"},{feeCurrency:"BRL"},{gasless:false},{anchorFeeFiat:"0.01"},{totalFeeFiat:"0.006"},{nablaFeeSubsidy:{}}]) assert.throws(()=>validate({...raw,...bad}));
});
for(const direction of ["BUY","SELL"]) test(`USDC ${direction} checks delivery, signs exactly one source permit and saves recovery first`,async()=>{
  const s=setup({direction});
  const q=direction==="BUY"?await buy(s):await s.adapter.quoteSell({symbol:"NVDA",tokenAmount:"0.5"});
  const fn=direction==="BUY"?s.adapter.registerBuy:s.adapter.registerSell;
  await fn({quote:q,walletAddress:WALLET,wallet:s.wallet});
  const record=s.activeRampStore.get(WALLET);
  assert.equal(record.paymentMethod,"usdc");assert.equal(record.stage,"ready");assert.equal(record.ephemeralEvmAddress,EPHEMERAL);
  assert.deepEqual(s.sdk.calls.registerRamp[0].data,{walletAddress:WALLET,destinationAddress:WALLET});
  assert.equal(s.log.filter(x=>x==="eth_signTypedData_v4").length,1);assert.equal(s.log.includes("eth_sendTransaction"),false);
  assert.equal(s.log.includes(`wallet_switchEthereumChain:${direction==="BUY"?"0x2105":"0x1237"}`),true);
});

test("confirmed balance reads two blocks behind head; partial funds never register or spend gas",async()=>{
  const s=setup({balance:99_999999n}),q=await buy(s);
  await assert.rejects(s.adapter.registerBuy({quote:q,walletAddress:WALLET,wallet:s.wallet}),e=>e.code==="INSUFFICIENT_BALANCE");
  assert.equal(s.sdk.calls.registerRamp.length,0);assert.equal(s.log.length,0);assert.equal(s.reads[0].blockNumber,98n);
});
for(const defect of ["network","token","recipient","amount"]) test(`wrong ${defect} delivery stops USDC authorization`,async()=>{
  const s=setup({mutateDelivery:tx=>defect==="network"?{...tx,network:"base"}:defect==="token"?{...tx,txData:{...tx.txData,to:BASE_USDC.address}}:destinationTransferTx({to:defect==="recipient"?EPHEMERAL:WALLET,amountWei:parseUnits(defect==="amount"?"1":"0.55",18)})});
  const q=await buy(s);await assert.rejects(s.adapter.registerBuy({quote:q,walletAddress:WALLET,wallet:s.wallet}),e=>e.code==="WRONG_ROUTE"&&/A entrega não confere/.test(e.message));assert.equal(s.log.includes("eth_signTypedData_v4"),false);
});
test("an unreadable Base balance is worded in Portuguese, without the RPC's English",async()=>{
  const s=setup(),rpc=Object.assign(new Error("HTTP request failed.\n\nURL: https://mainnet.base.org"),{shortMessage:"HTTP request failed."});
  const adapter=createVortexStocksAdapter({enabled:true,network:"robinhood",apiBase:"http://test.invalid",session:fakeSession(),activeRampStore:s.activeRampStore,ephemeralStore:s.ephemeralStore,createClient:s.sdk.createClient,paymentMethod:"usdc",baseClient:{getBlockNumber:async()=>{throw rpc;}},readMaintenance:async()=>({active:false}),now:()=>NOW});
  await assert.rejects(adapter.readBaseBalance(WALLET),e=>e.code==="SERVER_ERROR"&&/saldo de USDC na Base/.test(e.message)&&!/http/i.test(e.message));
});
for(const defect of ["spender","value","nonce","chain"]) test(`a changed permit ${defect} cannot access Base USDC`,async()=>{
  const s=setup({mutatePermit:tx=>({...tx,txData:{...tx.txData,domain:{...tx.txData.domain,...(defect==="chain"?{chainId:4663}:{})},message:{...tx.txData.message,...(defect==="spender"?{spender:WALLET}:defect==="value"?{value:"101000000"}:defect==="nonce"?{nonce:"1"}:{})}}})});
  await assert.rejects(s.adapter.registerBuy({quote:await buy(s),walletAddress:WALLET,wallet:s.wallet}));assert.equal(s.log.includes("eth_signTypedData_v4"),false);
});
test("a possible USDC permit keeps recovery even when a status response says failed",()=>{
  const s=stores();s.activeRampStore.save({rampId:"ambiguous",walletAddress:WALLET,paymentMethod:"usdc",rampType:"BUY",stage:"signing",createdAt:NOW});
  settleRamp(s.activeRampStore,{id:"ambiguous",classification:"failure"},{walletAddress:WALLET,now:NOW+1000});assert.equal(s.activeRampStore.get(WALLET).rampId,"ambiguous");
});
test("a declined USDC permit frees the wallet once the order fails; a returned signature keeps recovery",async()=>{
  const s=setup(),q=await buy(s),rejected=Object.assign(new Error("User rejected the request."),{code:4001});
  const declining={...s.wallet,provider:{request:async a=>{if(a.method==="eth_signTypedData_v4")throw rejected;return s.wallet.provider.request(a);}}};
  await assert.rejects(s.adapter.registerBuy({quote:q,walletAddress:WALLET,wallet:declining}),e=>Number(e.code)===4001);
  const declined=s.activeRampStore.get(WALLET);assert.equal(declined.stage,"registered");
  settleRamp(s.activeRampStore,{id:declined.rampId,classification:"failure"},{walletAddress:WALLET,now:NOW+30*60_000});assert.equal(s.activeRampStore.get(WALLET),null);
  const t=setup(),submit=t.sdk.client.submitUserTransactions.bind(t.sdk.client);
  t.sdk.client.submitUserTransactions=async(...args)=>{await submit(...args);throw new Error("update timed out");};
  await assert.rejects(t.adapter.registerBuy({quote:await buy(t),walletAddress:WALLET,wallet:t.wallet}));
  const signed=t.activeRampStore.get(WALLET);assert.equal(signed.stage,"signing");
  settleRamp(t.activeRampStore,{id:signed.rampId,classification:"failure"},{walletAddress:WALLET,now:NOW+30*60_000});assert.equal(t.activeRampStore.get(WALLET).rampId,signed.rampId);
});
test("funding intents are wallet-scoped, expire, survive partial funding and authorize nothing",()=>{
  const {storage}=jsonMemory(),store=fundingIntentStore(storage);
  store.save(WALLET,{symbol:"NVDA",amount:"100",expiresAt:NOW+1000});
  assert.equal(store.get(WALLET,NOW).amount,"100");assert.equal(store.get(EPHEMERAL,NOW),null);assert.equal(store.get(WALLET,NOW+1000),null);
  store.clear(WALLET);assert.equal(store.get(WALLET,NOW),null);
  assert.equal(decimalRaw("10.000001"),10000001n);assert.throws(()=>decimalRaw("10.0000001"));
});
test("fresh quote protection includes signed rate effects without adding fees twice",async()=>{
  const s=setup(),old=await buy(s);
  assert.equal(usdcPriceChanged(old,old),false);
  assert.equal(usdcPriceChanged(old,{...old,tokenAmountWei:(BigInt(old.tokenAmountWei)*9949n/10000n).toString()}),true);
  assert.equal(usdcPriceChanged(old,{...old,rawQuote:{...old.rawQuote,totalFeeFiat:"0.26"}}),true);
});
test("history identifies USDC amounts instead of labeling them BRL",()=>{
  const rows=serverHistoryRows({transactions:[{id:"usdc",type:"BUY",from:"base",to:"robinhood",fromCurrency:"USDC",toCurrency:"NVDA",fromAmount:"100",toAmount:"0.55",currentPhase:"complete",status:"COMPLETE"}]} ,"robinhood");
  assert.equal(rows[0].brlAmount,null);assert.equal(rows[0].usdcAmount,"100");assert.equal(rows[0].paymentMethod,"usdc");
});

test("turning off new USDC quotes still permits only owned registered recovery and start", async () => {
  const s=setup({enabled:false});
  s.activeRampStore.save({rampId:"owned",walletAddress:WALLET,paymentMethod:"usdc",rampType:"BUY",stage:"ready",createdAt:NOW,quoteId:"quote",symbol:"NVDA",tokenAddress:NVDA,inputAmount:"100",outputAmount:"0.5",ephemeralEvmAddress:EPHEMERAL});
  await s.adapter.startRamp("owned",{walletAddress:WALLET});assert.equal(s.sdk.calls.startRamp.length,1);
  await assert.rejects(s.adapter.startRamp("other",{walletAddress:WALLET}),e=>e.code==="STOCKS_RAMP_NOT_ENABLED");
  await assert.rejects(s.adapter.resumeSell({rampId:"other",walletAddress:WALLET,wallet:s.wallet}),e=>e.code==="STOCKS_RAMP_NOT_ENABLED");
  await assert.rejects(buy(s),e=>e.code==="STOCKS_RAMP_NOT_ENABLED");
});
