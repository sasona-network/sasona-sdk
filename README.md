# Sasona SDK

Use the Sasona pool from an agent or an app.

> **This is the first design, built on Solana devnet. It has been superseded and is kept as a record.** Nothing here runs on mainnet, and the network's new contract is not built yet.
>
> The SASONA coin is live on Solana mainnet since 20 October 2026, at `8xH5RFEkSyneYBhCZh5gi2svgdyrDCREW9SxCfKuYgFd` only; see [`sasona-coin`](https://github.com/sasona-network/sasona-coin). The devnet coin in this repository is a different token, used only for testing.

## What it does so far

| Function | What it does |
|---|---|
| `getPool`, `price` | Reads the pool's dollars, coins and fees waiting, and the price of a coin |
| `quoteDeposit` | What a deposit would be split into, and the coins it would hand out now |
| `depositInstruction` | Deposits dollars into the pool |
| `payFeeInstruction`, `markupOn` | Pays the fifteen-point markup on a purchase |
| `addDepthInstruction` | Adds dollars to the pool with nothing minted against them |

Each builds a standard Solana instruction you sign and send yourself. This library never holds a key.

```ts
import { Connection, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { DOLLAR, getPool, price, markupOn, payFeeInstruction } from "@sasona/sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const pool = await getPool(connection);
console.log(`one coin costs $${price(pool)}`);

// An agent bought a $2.00 service and pays its markup.
const ix = payFeeInstruction(agent.publicKey, markupOn(2n * DOLLAR));
await sendAndConfirmTransaction(connection, new Transaction().add(ix), [agent]);
```

## Test

```bash
npm install
npm test
```

The tests simulate every instruction against the program on devnet. Nothing is sent and nothing is signed, so they need no keys.

What comes next here is in the [roadmap](https://github.com/sasona-network/roadmap): spending limits an agent's owner sets (part 9), and payment channels for many small purchases (part 8).
