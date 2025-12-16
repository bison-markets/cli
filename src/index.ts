import { Command } from "commander";
import { createInterface } from "readline";
import { createWalletClient, createPublicClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia, bsc, bscTestnet, foundry } from "viem/chains";
import { BisonClient, VAULT_ABI } from "@bison-markets/sdk-ts";

const BASE_ENVIRONMENTS: Record<string, string> = {
  testnet: "https://testnet-api.bison.markets",
  mainnet: "https://api.bison.markets",
};

const CHAIN_MAP: Record<number, Chain> = {
  8453: base,
  84532: baseSepolia,
  56: bsc,
  97: bscTestnet,
  31337: foundry,
};

function createViemClients(
  privateKey: `0x${string}`,
  rpcUrl: string,
  chainId: number,
) {
  const chain = CHAIN_MAP[chainId];
  if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);
  const account = privateKeyToAccount(privateKey);

  return {
    walletClient: createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    }),
    publicClient: createPublicClient({ chain, transport: http(rpcUrl) }),
  };
}

function getEnvironments(): Record<string, string> {
  const localEnv = process.env.BISON_LOCAL_ENV;
  if (localEnv) {
    return { ...BASE_ENVIRONMENTS, local: localEnv };
  }
  return BASE_ENVIRONMENTS;
}

type Environment = string;

function getEnv(): Environment {
  const environments = getEnvironments();
  const validEnvs = Object.keys(environments);

  const envFlag = program.opts().network as string | undefined;
  const envVar = process.env.BISON_NETWORK;
  const env = envFlag ?? envVar ?? "testnet";

  if (!validEnvs.includes(env)) {
    console.error(`Error: Invalid network: ${env}`);
    process.exit(1);
  }

  return env;
}

function getDevFlags(): { privateKey: `0x${string}`; devAccountId: string } {
  const privateKey = process.env.BISON_PRIVATE_KEY;
  const devAccountId = process.env.BISON_ACCOUNT_ID;

  if (!privateKey) {
    console.error("Error: BISON_PRIVATE_KEY not set");
    process.exit(1);
  }
  if (!devAccountId) {
    console.error("Error: BISON_ACCOUNT_ID not set");
    process.exit(1);
  }

  return {
    privateKey: privateKey as `0x${string}`,
    devAccountId,
  };
}

function createClient(env: Environment): BisonClient {
  const devFlags = getDevFlags();
  const environments = getEnvironments();
  return new BisonClient({
    baseUrl: environments[env],
    devFlags,
  });
}

function formatUusdc(uusdc: number): string {
  return `$${(uusdc / 1_000_000).toFixed(2)}`;
}

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

const program = new Command();

import { version } from "../package.json";

program
  .name("bison")
  .description("Bison developer CLI")
  .version(version)
  .option("-n, --network <network>", "Network (testnet, mainnet)")
  .option("-y, --yes", "Skip confirmation prompts");

program
  .command("info")
  .description("View dev account configuration")
  .action(async () => {
    const env = getEnv();
    const client = createClient(env);

    try {
      const info = await client.getDevAccountInfo();

      console.log(`\nDev Account Info (${env})\n`);
      console.log(`ID:      ${info.id}`);
      console.log(`Name:    ${info.name}`);
      console.log(`Email:   ${info.email}`);
      console.log(`\nFee Configuration:`);
      console.log(`  Gross Fee:  ${formatBps(info.grossFeeBps)}`);
      console.log(`  Base Fee:   ${formatUusdc(info.grossBaseFeeUusdc)}`);
      console.log(`  Bison Cut:  ${formatBps(info.bisonFeeCutBps)}`);
      console.log(`\nPayout:`);
      console.log(`  Chain:   ${info.payoutChain}`);
      console.log(`  Address: ${info.signerAddress}`);
      console.log(
        `\nCreated: ${new Date(info.createdAt).toLocaleDateString()}`,
      );
      console.log();
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("fees")
  .description("View accumulated dev account fees")
  .action(async () => {
    const env = getEnv();
    const client = createClient(env);

    try {
      const fees = await client.getDevAccountFees();

      console.log(`\nDev Account Fees (${env})\n`);
      console.log(`Account: ${fees.id} (${fees.name})`);
      console.log(`Chain:   ${fees.payoutChain}`);
      console.log(`Signer:  ${fees.signerAddress}`);
      console.log(`\nBalances:`);
      console.log(`  Pending:   ${formatUusdc(fees.pendingFeesUusdc)}`);
      console.log(`  Locked:    ${formatUusdc(fees.lockedFeesUusdc)}`);
      console.log(`  Unclaimed: ${formatUusdc(fees.unclaimedFeesUusdc)}`);
      console.log();
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("claim-auth")
  .description("Get fee claim authorization (for manual vault withdrawal)")
  .action(async () => {
    const env = getEnv();
    const client = createClient(env);
    const skipConfirm = program.opts().yes === true;

    try {
      const fees = await client.getDevAccountFees();

      if (fees.unclaimedFeesUusdc === 0) {
        console.log("\nNo unclaimed fees available\n");
        return;
      }

      console.log(
        `\nClaiming ${formatUusdc(fees.unclaimedFeesUusdc)} on ${env}`,
      );

      if (!skipConfirm) {
        const confirmed = await confirm("Continue?");
        if (!confirmed) {
          console.log("Aborted\n");
          return;
        }
      }

      const auth = await client.getFeeClaimAuthorization();

      console.log(`\nFee Claim Authorization\n`);
      console.log(`Amount:  ${formatUusdc(auth.amount)}`);
      console.log(`Chain:   ${auth.chain}`);
      console.log(`Expires: ${new Date(auth.expiresAt * 1000).toISOString()}`);
      console.log(`\nAuthorization:`);
      console.log(`  UUID:      ${auth.uuid}`);
      console.log(`  Signer:    ${auth.signerAddress}`);
      console.log(`  Signature: ${auth.signature}`);
      console.log();
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("claim")
  .description("Claim accumulated fees on-chain")
  .option("--payout <address>", "Payout address (defaults to signer address)")
  .action(async (options: { payout?: string }) => {
    const env = getEnv();
    const client = createClient(env);
    const devFlags = getDevFlags();
    const skipConfirm = program.opts().yes === true;

    try {
      const fees = await client.getDevAccountFees();

      if (fees.unclaimedFeesUusdc === 0) {
        console.log("\nNo unclaimed fees available\n");
        return;
      }

      const info = await client.getInfo();
      const chainInfo =
        info.chains[fees.payoutChain as keyof typeof info.chains];

      const payoutAddress = (options.payout ??
        fees.signerAddress) as `0x${string}`;
      const isCustomPayout =
        options.payout &&
        options.payout.toLowerCase() !== fees.signerAddress.toLowerCase();

      console.log(
        `\nClaiming ${formatUusdc(fees.unclaimedFeesUusdc)} on ${fees.payoutChain}`,
      );
      console.log(`Vault: ${chainInfo.vaultAddress}`);

      if (isCustomPayout) {
        console.log(`Payout: ${payoutAddress} (custom)\n`);
      } else {
        console.log(`Payout: ${payoutAddress} (signer default)\n`);
      }

      if (!skipConfirm) {
        const payoutConfirmMsg = isCustomPayout
          ? `Send ${formatUusdc(fees.unclaimedFeesUusdc)} to ${payoutAddress}?`
          : `Send to signer address (${payoutAddress.slice(0, 6)}...${payoutAddress.slice(-4)})?`;

        if (!(await confirm(payoutConfirmMsg))) {
          console.log("Aborted\n");
          return;
        }
      }

      const auth = await client.getFeeClaimAuthorization();
      const { walletClient, publicClient } = createViemClients(
        devFlags.privateKey,
        chainInfo.rpcUrl,
        chainInfo.chainId,
      );

      const vaultCode = await publicClient.getCode({
        address: chainInfo.vaultAddress as `0x${string}`,
      });
      if (!vaultCode || vaultCode === "0x") {
        throw new Error(
          `No contract at vault address ${chainInfo.vaultAddress}`,
        );
      }

      console.log("Submitting transaction...");
      const txHash = await walletClient.writeContract({
        address: chainInfo.vaultAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: "withdrawUSDC",
        args: [
          auth.uuid,
          BigInt(auth.amount),
          payoutAddress,
          BigInt(auth.expiresAt),
          auth.signature as `0x${string}`,
        ],
      });

      console.log(`Transaction: ${txHash}`);
      console.log("Waiting for confirmation...");

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`\nClaimed ${formatUusdc(auth.amount)} successfully!\n`);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("history")
  .description("View past fee claim withdrawals")
  .option("--limit <number>", "Number of claims to show", "10")
  .action(async (options: { limit: string }) => {
    const env = getEnv();
    const client = createClient(env);

    try {
      const limit = parseInt(options.limit, 10);
      const { claims, pagination } = await client.getDevFeeClaimHistory({
        limit,
      });
      const info = await client.getDevAccountInfo();

      console.log(`\nFee Claim History (${env})\n`);
      console.log(`Account: ${info.id}\n`);

      if (claims.length === 0) {
        console.log("No claims found.\n");
        return;
      }

      const dateWidth = 16;
      const amountWidth = 14;
      const chainWidth = 10;

      console.log(
        `${"Date".padEnd(dateWidth)}${"Amount".padEnd(amountWidth)}${"Chain".padEnd(chainWidth)}Payout Address`,
      );
      console.log("─".repeat(54));

      for (const claim of claims) {
        const date = new Date(claim.claimedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const amount = formatUusdc(claim.amountUusdc);
        const addr = `${claim.payoutAddress.slice(0, 6)}...${claim.payoutAddress.slice(-4)}`;

        console.log(
          `${date.padEnd(dateWidth)}${amount.padEnd(amountWidth)}${claim.chain.padEnd(chainWidth)}${addr}`,
        );
      }

      if (pagination.hasMore) {
        console.log(`\n... and more (use --limit to see more)`);
      }
      console.log();
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
