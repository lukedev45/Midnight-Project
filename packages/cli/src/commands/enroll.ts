import crypto from "node:crypto";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import { buildFacade, getWallet } from "../lib/wallet.js";
import { createProviders } from "../lib/providers.js";
import { join, getDeployedAddress } from "../lib/contract.js";
import { CONTRACT_NAME } from "../lib/constants.js";
import { withSpinner } from "../lib/progress.js";
import { waitForFunds } from "../lib/funding.js";
import { bytesToHex, hexToBytes32, loadCredential } from "../lib/secrets.js";
import { submitEnroll, hashPseudonym, type FoundWhistleblower } from "@whistleblower/api";

export default class Enroll extends BaseCommand {
	static override description =
		"As a member: enroll a fresh pseudonym using a credential file.";

	static override flags = {
		...BaseCommand.baseFlags,
		wallet: Flags.string({
			description: "Wallet name to use",
			default: "default",
		}),
		address: Flags.string({
			description: "Contract address (defaults to last deployed)",
		}),
		credential: Flags.string({
			description: "Path to the credential JSON file",
			required: true,
		}),
		"pseudonym-secret-hex": Flags.string({
			description: "Optional 32-byte hex pseudonym secret; if omitted a fresh one is generated",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Enroll);

		const cred = loadCredential(flags.credential);
		const credentialSecret = hexToBytes32(cred.credentialSecretHex);
		const pseudonymSecretHex =
			flags["pseudonym-secret-hex"] ?? crypto.randomBytes(32).toString("hex");
		const pseudonymSecret = hexToBytes32(pseudonymSecretHex);
		const pseudonym = hashPseudonym(pseudonymSecret);

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
				role: "member",
				credentialSecret,
				pseudonymSecret,
			});

			const tx = await withSpinner("Enrolling pseudonym...", () =>
				submitEnroll(
					providers,
					deployed as FoundWhistleblower,
					address,
					credentialSecret,
					pseudonymSecret,
				),
			);

			if (!this.jsonEnabled) {
				this.log(`Enrolled credential ${cred.id}.`);
				this.log(`  Pseudonym:        ${bytesToHex(pseudonym)}`);
				this.log(`  Pseudonym secret: ${pseudonymSecretHex}  (keep this private!)`);
				this.log(`  Tx:               ${tx.public.txId}`);
			}
			this.outputResult({
				credentialId: cred.id,
				pseudonymHex: bytesToHex(pseudonym),
				pseudonymSecretHex,
				txId: tx.public.txId,
				blockHeight: tx.public.blockHeight.toString(),
			});
		} finally {
			await ctx.facade.stop();
		}
	}
}
