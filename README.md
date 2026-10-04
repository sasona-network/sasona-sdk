# Sasona SDK

Use the Sasona pool from an agent or an app.

> Devnet only. The coin has no value.

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
