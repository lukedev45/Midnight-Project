import { Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import {
	bytesToHex,
	credentialsDir,
	listCredentialFiles,
	randomSecretHex,
	saveCredential,
	hexToBytes32,
} from "../lib/secrets.js";
import { hashMemberLeaf } from "@whistleblower/api";

export default class BootstrapRoster extends BaseCommand {
	static override description =
		"Generate demo credentials (one secret + leaf per member) and write them to .midnight-expert/credentials/.";

	static override flags = {
		...BaseCommand.baseFlags,
		count: Flags.integer({
			description: "Number of credentials to generate",
			default: 15,
		}),
		prefix: Flags.string({
			description: "Filename prefix",
			default: "cred",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(BootstrapRoster);
		const existing = listCredentialFiles();
		if (existing.length > 0 && !this.jsonEnabled) {
			this.warn(`${existing.length} credential file(s) already exist in ${credentialsDir()} - new ones will be added alongside.`);
		}

		const startIndex = existing.length;
		const generated: { id: string; leafHex: string; file: string }[] = [];
		for (let i = 0; i < flags.count; i++) {
			const id = `${flags.prefix}-${String(startIndex + i).padStart(3, "0")}`;
			const credentialSecretHex = randomSecretHex();
			const leaf = hashMemberLeaf(hexToBytes32(credentialSecretHex));
			const leafHex = bytesToHex(leaf);
			const file = saveCredential({
				id,
				credentialSecretHex,
				leafHex,
				createdAt: new Date().toISOString(),
			});
			generated.push({ id, leafHex, file });
		}

		if (!this.jsonEnabled) {
			this.log(`Generated ${flags.count} credentials in ${credentialsDir()}`);
			for (const g of generated.slice(0, 5)) {
				this.log(`  ${g.id} → leaf ${g.leafHex.slice(0, 16)}...`);
			}
			if (flags.count > 5) this.log(`  ... and ${flags.count - 5} more.`);
		}

		this.outputResult({ count: flags.count, credentialsDir: credentialsDir(), generated });
	}
}
