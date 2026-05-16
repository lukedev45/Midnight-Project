import { Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import { buildFacade, getWallet } from "../lib/wallet.js";
import { createProviders } from "../lib/providers.js";
import { join, getDeployedAddress } from "../lib/contract.js";
import { CONTRACT_NAME } from "../lib/constants.js";
import { withSpinner } from "../lib/progress.js";
import { waitForFunds } from "../lib/funding.js";
import {
	hexToBytes32,
	listCredentialFiles,
	loadAdmin,
	loadCredential,
} from "../lib/secrets.js";
import { submitAddMember, type FoundWhistleblower } from "@whistleblower/api";

export default class EnrollMembers extends BaseCommand {
	static override description =
		"As admin: add every credential under .midnight-expert/credentials/ to the on-chain Merkle tree.";

	static override flags = {
		...BaseCommand.baseFlags,
		wallet: Flags.string({
			description: "Wallet name to use",
			default: "default",
		}),
		address: Flags.string({
			description: "Contract address (defaults to last deployed)",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(EnrollMembers);

		const adminCfg = loadAdmin();
		if (!adminCfg) throw new Error("No admin secret found. Run `deploy` first.");
		const adminSecret = hexToBytes32(adminCfg.adminSecretHex);

		const credentialFiles = listCredentialFiles();
		if (credentialFiles.length === 0) {
			throw new Error("No credentials found. Run `bootstrap-roster` first.");
		}

		const address = flags.address ?? getDeployedAddress(CONTRACT_NAME);
		const walletData = getWallet(flags.wallet);
		const ctx = await withSpinner("Building wallet...", () => buildFacade(walletData.seed));
		try {
			await withSpinner("Syncing...", () => waitForFunds(ctx.facade));
			const providers = await withSpinner("Configuring providers...", () =>
				createProviders(
					ctx.facade,
					ctx.shieldedSecretKeys,
					ctx.dustSecretKey,
					ctx.keystore,
					`${CONTRACT_NAME}-private-state`,
				),
			);

			const deployed = await join(providers, address, {
				role: "admin",
				adminSecret,
			});

			const results: { id: string; txId: string; blockHeight: string }[] = [];
			for (const credFile of credentialFiles) {
				const cred = loadCredential(credFile);
				const credentialSecret = hexToBytes32(cred.credentialSecretHex);
				const tx = await withSpinner(`Adding ${cred.id}...`, () =>
					submitAddMember(providers, deployed as FoundWhistleblower, adminSecret, credentialSecret),
				);
				results.push({
					id: cred.id,
					txId: tx.public.txId,
					blockHeight: tx.public.blockHeight.toString(),
				});
			}

			if (!this.jsonEnabled) {
				this.log(`Added ${results.length} member(s) at ${address}.`);
				for (const r of results.slice(0, 5)) this.log(`  ${r.id} → ${r.txId.slice(0, 16)}...`);
			}
			this.outputResult({ contractAddress: address, members: results });
		} finally {
			await ctx.facade.stop();
		}
	}
}
