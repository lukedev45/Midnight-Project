import { Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import { buildFacade, getWallet } from "../lib/wallet.js";
import { createProviders } from "../lib/providers.js";
import { join, getDeployedAddress } from "../lib/contract.js";
import { CONTRACT_NAME } from "../lib/constants.js";
import { withSpinner } from "../lib/progress.js";
import { waitForFunds } from "../lib/funding.js";
import { hexToBytes32, loadOperator } from "../lib/secrets.js";
import { submitUpdateScore, type FoundWhistleblower } from "@whistleblower/api";

export default class Score extends BaseCommand {
	static override description =
		"As operator: set the trust score for a pseudonym (0..100). Uses the operator secret saved at deploy time.";

	static override flags = {
		...BaseCommand.baseFlags,
		wallet: Flags.string({
			description: "Wallet name to use",
			default: "default",
		}),
		address: Flags.string({
			description: "Contract address (defaults to last deployed)",
		}),
		pseudonym: Flags.string({
			description: "Pseudonym hex (32 bytes, no 0x prefix)",
			required: true,
		}),
		"new-score": Flags.integer({
			description: "New score, integer in [0, 100]",
			required: true,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Score);

		const opCfg = loadOperator();
		if (!opCfg) throw new Error("No operator secret found. Run `deploy` first.");
		const operatorSecret = hexToBytes32(opCfg.operatorSecretHex);
		const pseudonym = hexToBytes32(flags.pseudonym);

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

			const deployed = await join(providers, address, { role: "operator", operatorSecret });

			const tx = await withSpinner("Submitting update_score...", () =>
				submitUpdateScore(
					providers,
					deployed as FoundWhistleblower,
					operatorSecret,
					pseudonym,
					flags["new-score"],
				),
			);

			if (!this.jsonEnabled) {
				this.log(`Updated score for ${flags.pseudonym.slice(0, 16)}... to ${flags["new-score"]}.`);
				this.log(`  Tx: ${tx.public.txId}`);
			}
			this.outputResult({
				pseudonymHex: flags.pseudonym,
				newScore: flags["new-score"],
				txId: tx.public.txId,
				blockHeight: tx.public.blockHeight.toString(),
			});
		} finally {
			await ctx.facade.stop();
		}
	}
}
