# Bison CLI

[![npm version](https://badge.fury.io/js/@bison-markets%2Fcli.svg)](https://badge.fury.io/js/@bison-markets%2Fcli)

Developer CLI for managing your Bison Markets integration.

[Documentation](https://docs.bison.markets/general/cli)

## Installation

```bash
npm install -g @bison-markets/cli
```

## Configuration

The CLI requires two environment variables:

```bash
export BISON_PRIVATE_KEY="0x..."   # Your dev account signer private key
export BISON_ACCOUNT_ID="..."      # Your Bison dev account ID
export BISON_NETWORK="testnet"     # Default network (testnet or mainnet)
```

## Commands

### Network Selection

All commands accept `-n, --network <network>` to override the default:

```bash
bison info -n mainnet
```

Use `-y, --yes` to skip confirmation prompts.

### `bison info`

View your dev account configuration.

```bash
$ bison info

Dev Account Info (testnet)

ID:      abc123
Name:    My App
Email:   dev@example.com

Fee Configuration:
  Gross Fee:  1.00%
  Base Fee:   $0.05
  Bison Cut:  20.00%

Payout:
  Chain:   base-sepolia
  Address: 0x...
```

### `bison fees`

View accumulated fee balances.

```bash
$ bison fees

Dev Account Fees (testnet)

Account: abc123 (My App)
Chain:   base-sepolia
Signer:  0x...

Balances:
  Pending:   $12.50
  Locked:    $0.00
  Unclaimed: $87.30
```

### `bison claim`

Claim accumulated fees on-chain. Submits a withdrawal transaction to the Bison vault.

```bash
$ bison claim

Claiming $87.30 on base-sepolia
Vault: 0x...
Payout: 0x... (signer default)

Send to signer address (0x1234...5678)? [y/N] y
Submitting transaction...
Transaction: 0x...
Waiting for confirmation...

Claimed $87.30 successfully!
```

Options:

- `--payout <address>` — Send funds to a different address than your signer

### `bison claim-auth`

Get a signed fee claim authorization without submitting a transaction. Useful for manual vault interactions or debugging.

```bash
$ bison claim-auth

Fee Claim Authorization

Amount:  $87.30
Chain:   base-sepolia
Expires: 2024-01-15T12:00:00.000Z

Authorization:
  UUID:      550e8400-e29b-41d4-a716-446655440000
  Signer:    0x...
  Signature: 0x...
```

### `bison history`

View past fee claim withdrawals.

```bash
$ bison history

Fee Claim History (testnet)

Account: abc123

Date            Amount        Chain     Payout Address
──────────────────────────────────────────────────────
Dec 10, 2024    $87.30        base-sepolia  0x1234...5678
Nov 28, 2024    $45.00        base-sepolia  0x1234...5678
Nov 15, 2024    $120.50       base-sepolia  0x1234...5678
```

Options:

- `--limit <number>` — Number of claims to show (default: 10)
