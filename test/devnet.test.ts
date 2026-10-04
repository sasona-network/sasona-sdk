// Checks every instruction this library builds against the program on
// devnet, by simulating it. Nothing is sent and nothing is signed: devnet
// runs the instruction against the real accounts and reports what happened.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  COIN_MINT, DOLLAR, USD_MINT, addDepthInstruction, depositInstruction, getPool, markupOn, payFeeInstruction,
  price, quoteDeposit, slices,
} from "../src/index.js";

const connection = new Connection(process.env.SASONA_RPC ?? "https://api.devnet.solana.com", "confirmed");
// The pool's opener on devnet, which holds test dollars. Its address is public.
const WALLET = new PublicKey("CCsLKV9yCucqYmdb1KarjsTD5pA6q2fzucBa9ozCTSFu");

async function simulate(ix: ReturnType<typeof depositInstruction>) {
  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({ payerKey: WALLET, recentBlockhash: blockhash, instructions: [ix] })
    .compileToV0Message();
  const result = await connection.simulateTransaction(new VersionedTransaction(message), { sigVerify: false });
  return result.value;
}

test("the pool reads, and its records make sense", async () => {
  const pool = await getPool(connection);
  assert.ok(pool.usdMint.equals(USD_MINT));
  assert.ok(pool.coinMint.equals(COIN_MINT));
  assert.ok(pool.usdReserve > 0n && pool.coinReserve > 0n);
  assert.ok(price(pool) > 0);
});

test("a deposit splits as the program splits it", () => {
  const s = slices(100n * DOLLAR);
  assert.deepEqual([s.fee, s.spread, s.guarantee, s.free], [15_000_000n, 12_750_000n, 63_750_000n, 8_500_000n]);
});

test("a deposit is accepted by the program", async () => {
  const pool = await getPool(connection);
  const q = quoteDeposit(pool, 10n * DOLLAR);
  assert.ok(q.freeCoins > 0n);
  const result = await simulate(depositInstruction(WALLET, 10n * DOLLAR));
  assert.equal(result.err, null, (result.logs ?? []).join("\n"));
  assert.ok(result.logs?.some((l) => l.includes("Instruction: Deposit")));
});

test("a fee is accepted by the program", async () => {
  assert.equal(markupOn(10n * DOLLAR), 1_500_000n);
  const result = await simulate(payFeeInstruction(WALLET, markupOn(DOLLAR)));
  assert.equal(result.err, null, (result.logs ?? []).join("\n"));
  assert.ok(result.logs?.some((l) => l.includes("Instruction: PayFee")));
});

test("depth is accepted by the program", async () => {
  const result = await simulate(addDepthInstruction(WALLET, DOLLAR));
  assert.equal(result.err, null, (result.logs ?? []).join("\n"));
  assert.ok(result.logs?.some((l) => l.includes("Instruction: AddDepth")));
});

test("a deposit of nothing is refused, so the simulation is really checking", async () => {
  const result = await simulate(depositInstruction(WALLET, 0n));
  assert.notEqual(result.err, null);
  assert.ok(result.logs?.some((l) => l.includes("NothingDeposited")), (result.logs ?? []).join("\n"));
});
