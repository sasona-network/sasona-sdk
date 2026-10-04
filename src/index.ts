// Use the Sasona pool from an agent: read its price, deposit, pay a
// purchase's fee, add depth. Devnet only; the coin has no value.
//
// Instructions are built by hand from the program's account order and
// Anchor's encoding, so this library needs nothing from the program but its
// address. The tests check every one against devnet.

import { createHash } from "node:crypto";
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

export const PROGRAM_ID = new PublicKey("7eiHSnDkM4WjJdY36D2Yqsjw893mCMUtBAwMCQ5adL99");
/** The stand-in dollar the devnet pool accepts. */
export const USD_MINT = new PublicKey("ACPdQtaC6HKgT8V4GVRke57vtZrbv3zDqTwvENBoRPCy");

const seed = (s: string) => Buffer.from(s, "utf8");
export const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];

export const POOL = pda(seed("pool"));
export const COIN_MINT = pda(seed("coin"));
export const POOL_USD = pda(seed("pool-usd"));
export const POOL_COIN = pda(seed("pool-coin"));
export const FEES = pda(seed("fees"));
export const NETWORK = pda(seed("network"));
export const COVER = pda(seed("cover"));
export const COVER_VAULT = pda(seed("cover-vault"));

/** Dollars and coins both have six decimals: one dollar is 1,000,000 units. */
export const DOLLAR = 1_000_000n;

export interface Pool {
  usdMint: PublicKey;
  coinMint: PublicKey;
  /** Dollar units in the pool. */
  usdReserve: bigint;
  /** Coin units in the pool. */
  coinReserve: bigint;
  /** Coin units outside the pool: held by people, or in the cover. */
  outside: bigint;
  /** Entry fees waiting to be settled, in dollar units. */
  feesHeld: bigint;
}

/** Read the pool's records. */
export async function getPool(connection: Connection): Promise<Pool> {
  const info = await connection.getAccountInfo(POOL, "confirmed");
  if (!info) throw new Error("the pool is not open");
  if (!info.owner.equals(PROGRAM_ID)) throw new Error("the pool account is not the program's");
  const d = info.data;
  return {
    usdMint: new PublicKey(d.subarray(9, 41)),
    coinMint: new PublicKey(d.subarray(41, 73)),
    usdReserve: d.readBigUInt64LE(73),
    coinReserve: d.readBigUInt64LE(81),
    outside: d.readBigUInt64LE(89),
    feesHeld: d.readBigUInt64LE(97),
  };
}

/** Dollars for one coin, as a decimal number for display. */
export function price(pool: Pool): number {
  return Number(pool.usdReserve) / Number(pool.coinReserve);
}

/** What a deposit of `amount` dollar units is split into, as the program does it. */
export function slices(amount: bigint) {
  const bps = (x: bigint, b: bigint) => (x * b) / 10_000n;
  const fee = bps(amount, 1_500n);
  const rest = amount - fee;
  const spread = bps(rest, 1_500n);
  const guarantee = bps(rest, 7_500n);
  const free = rest - spread - guarantee;
  return { fee, rest, spread, guarantee, free };
}

/** The coins a deposit would hand out now, rounded down as the program rounds. */
export function quoteDeposit(pool: Pool, amount: bigint) {
  const s = slices(amount);
  const at = (x: bigint) => (x * pool.coinReserve) / pool.usdReserve;
  return { ...s, freeCoins: at(s.free), guaranteeCoins: at(s.guarantee) };
}

// ------------------------------------------------------------- instructions

function discriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

const w = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: true });
const r = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });
const signer = (pubkey: PublicKey, isWritable: boolean) => ({ pubkey, isSigner: true, isWritable });

/** Deposit `amount` dollar units from `depositor`'s dollar account. */
export function depositInstruction(depositor: PublicKey, amount: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(depositor, true),
      w(POOL),
      w(COIN_MINT),
      r(USD_MINT),
      w(POOL_USD),
      w(POOL_COIN),
      w(FEES),
      w(getAssociatedTokenAddressSync(USD_MINT, depositor)),
      w(getAssociatedTokenAddressSync(COIN_MINT, depositor)),
      w(COVER),
      w(COVER_VAULT),
      r(pda(seed("guarantee-vault"), depositor.toBuffer())),
      w(pda(seed("guarantee"), depositor.toBuffer())),
      r(TOKEN_PROGRAM_ID),
      r(ASSOCIATED_TOKEN_PROGRAM_ID),
      r(SystemProgram.programId),
    ],
    data: Buffer.concat([discriminator("deposit"), u64(amount)]),
  });
}

/** Pay the fifteen-point markup on a purchase, `markup` dollar units. */
export function payFeeInstruction(payer: PublicKey, markup: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(payer, true),
      w(POOL),
      w(COIN_MINT),
      r(USD_MINT),
      w(POOL_USD),
      w(POOL_COIN),
      w(getAssociatedTokenAddressSync(USD_MINT, payer)),
      r(FEES),
      w(NETWORK),
      r(TOKEN_PROGRAM_ID),
      r(SystemProgram.programId),
    ],
    data: Buffer.concat([discriminator("pay_fee"), u64(markup)]),
  });
}

/** The markup on a purchase whose seller asks `price` dollar units: fifteen points. */
export function markupOn(price: bigint): bigint {
  return (price * 15n) / 100n;
}

/** Add `amount` dollar units to the pool with nothing minted against them. */
export function addDepthInstruction(giver: PublicKey, amount: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      signer(giver, false),
      w(POOL),
      r(COIN_MINT),
      r(USD_MINT),
      w(POOL_USD),
      r(FEES),
      w(getAssociatedTokenAddressSync(USD_MINT, giver)),
      r(TOKEN_PROGRAM_ID),
    ],
    data: Buffer.concat([discriminator("add_depth"), u64(amount)]),
  });
}
