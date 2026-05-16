import { Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import { buildFacade, getWallet } from "../lib/wallet.js";
import { createProviders } from "../lib/providers.js";
import { deploy } from "../lib/contract.js";
import { CONTRACT_NAME } from "../lib/constants.js";
import { withSpinner } from "../lib/progress.js";
import { waitForFunds } from "../lib/funding.js";
import {
	hexToBytes32,
	loadAdmin,
	loadOperator,
	randomSecretHex,
	saveAdmin,
	saveOperator,
} from "../lib/secrets.js";
import { hashAdminPk, hashOperatorPk } from "@whistleblower/api";

export default class Deploy extends BaseCommand {
	static override description =
		"Deploy the whistleblower contract. Generates (or reuses) admin and operator secrets and seals their hashes on chain.";

	static override flags = {
		...BaseCommand.baseFlags,
		wallet: Flags.string({
			description: "Wallet name to use for deployment",
			default: "default",
		}),
		"new-secrets": Flags.boolean({
			description: "Force-regenerate admin and operator secrets even if existing ones are saved",
			default: false,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Deploy);
		const walletData = getWallet(flags.wallet);

		const adminCfg = flags["new-secrets"] ? null : loadAdmin();
		const operatorCfg = flags["new-secrets"] ? null : loadOperator();
		const adminSecretHex = adminCfg?.adminSecretHex ?? randomSecretHex();
		const operatorSecretHex = operatorCfg?.operatorSecretHex ?? randomSecretHex();
		if (!adminCfg || flags["new-secrets"]) saveAdmin(adminSecretHex);
		if (!operatorCfg || flags["new-secrets"]) saveOperator(operatorSecretHex);

		const adminSecret = hexToBytes32(adminSecretHex);
		const operatorSecret = hexToBytes32(operatorSecretHex);
		const adminPk = hashAdminPk(adminSecret);
		const operatorPk = hashOperatorPk(operatorSecret);

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

			const result = await deploy(
				providers,
				{ role: "admin", adminSecret, operatorSecret },
				[adminPk, operatorPk],
			);

			if (!this.jsonEnabled) {
				this.log("  Contract deployed!");
				this.log(`  Address:      ${result.contractAddress}`);
				this.log(`  Transaction:  ${result.txId}`);
				this.log(`  Block:        ${result.blockHeight.toString()}`);
				this.log("");
				this.log("  Admin/operator secrets saved to .midnight-expert/{admin,operator}.json");
				this.log("  Keep operator.json safe - give a copy to the scorer service only.");
			}
			this.outputResult({
				contractAddress: result.contractAddress,
				txId: result.txId,
				blockHeight: result.blockHeight.toString(),
			});
		} finally {
			await ctx.facade.stop();
		}
	}
}
