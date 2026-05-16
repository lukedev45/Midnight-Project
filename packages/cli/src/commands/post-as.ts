import { Flags } from "@oclif/core";
import {
	CompactTypeBytes,
	CompactTypeVector,
	persistentHash,
} from "@midnight-ntwrk/compact-runtime";
import { BaseCommand } from "../base-command.js";
import { buildFacade, getWallet } from "../lib/wallet.js";
import { createProviders } from "../lib/providers.js";
import { join, getDeployedAddress } from "../lib/contract.js";
import { CONTRACT_NAME } from "../lib/constants.js";
import { withSpinner } from "../lib/progress.js";
import { waitForFunds } from "../lib/funding.js";
import { bytesToHex, hexToBytes32 } from "../lib/secrets.js";
import { submitPost, hashPseudonym, type FoundWhistleblower } from "@whistleblower/api";

const Bytes32 = new CompactTypeBytes(32);
const Vec2 = new CompactTypeVector(2, Bytes32);
const enc = new TextEncoder();
const DOMAIN_CONTENT = (() => {
	const out = new Uint8Array(32);
	out.set(enc.encode("wb:content:"));
	return out;
})();

function hashContent(text: string): Uint8Array {
	const payload = new Uint8Array(32);
	const raw = enc.encode(text);
	// Crude hashing for content_hash: persistentHash([DOMAIN_CONTENT, first-32-bytes-of-text]).
	// The scorer reads the original text via the off-chain channel; this hash binds it.
	const slice = raw.subarray(0, 32);
	payload.set(slice);
	return persistentHash(Vec2, [DOMAIN_CONTENT, payload]);
}

export default class PostAs extends BaseCommand {
	static override description =
		"As a member: submit a post under your pseudonym. Hashes content with persistentHash and emits the on-chain post tx.";

	static override flags = {
		...BaseCommand.baseFlags,
		wallet: Flags.string({
			description: "Wallet name to use",
			default: "default",
		}),
		address: Flags.string({
			description: "Contract address (defaults to last deployed)",
		}),
		"pseudonym-secret-hex": Flags.string({
			description: "32-byte hex pseudonym secret (returned from enroll)",
			required: true,
		}),
		content: Flags.string({
			description: "Content text to post",
			required: true,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(PostAs);

		const pseudonymSecret = hexToBytes32(flags["pseudonym-secret-hex"]);
		const pseudonym = hashPseudonym(pseudonymSecret);
		const contentHash = hashContent(flags.content);

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
				pseudonymSecret,
			});

			const tx = await withSpinner("Submitting post...", () =>
				submitPost(providers, deployed as FoundWhistleblower, pseudonymSecret, contentHash),
			);

			if (!this.jsonEnabled) {
				this.log(`Posted under ${bytesToHex(pseudonym).slice(0, 16)}....`);
				this.log(`  Content hash: ${bytesToHex(contentHash)}`);
				this.log(`  Tx:           ${tx.public.txId}`);
			}
			this.outputResult({
				pseudonymHex: bytesToHex(pseudonym),
				contentHashHex: bytesToHex(contentHash),
				txId: tx.public.txId,
				blockHeight: tx.public.blockHeight.toString(),
			});
		} finally {
			await ctx.facade.stop();
		}
	}
}
