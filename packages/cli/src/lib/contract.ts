import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { Contract, witnesses, type PrivateState } from "@whistleblower/contract";
import type { Providers } from "./providers.js";
import {
	CONTRACT_NAME,
	CONTRACTS_FILE,
	FILE_MODE_PUBLIC,
	STATE_DIR,
	ZK_CONFIG_PATH,
} from "./constants.js";
import { withSpinner } from "./progress.js";

function resolveZkConfigPath(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "..", ZK_CONFIG_PATH);
}

export const PRIVATE_STATE_ID = `${CONTRACT_NAME}-private-state`;

export function loadCompiledContract() {
	return CompiledContract.make(CONTRACT_NAME, Contract).pipe(
		CompiledContract.withWitnesses(witnesses),
		CompiledContract.withCompiledFileAssets(resolveZkConfigPath()),
	);
}

export interface DeployResult {
	contractAddress: string;
	txId: string;
	blockHeight: bigint;
}

export async function deploy(
	providers: Providers,
	initialPrivateState: PrivateState,
	args: [adminPkSeed: Uint8Array, operatorPkSeed: Uint8Array],
): Promise<DeployResult> {
	return withSpinner("Deploying contract (this may take 30-60 seconds)...", async () => {
		const compiledContract = loadCompiledContract();
		const deployed = await deployContract(providers, {
			compiledContract,
			privateStateId: PRIVATE_STATE_ID,
			initialPrivateState,
			args,
		});

		const result: DeployResult = {
			contractAddress: deployed.deployTxData.public.contractAddress,
			txId: deployed.deployTxData.public.txId,
			blockHeight: deployed.deployTxData.public.blockHeight,
		};
		saveDeployedContract(CONTRACT_NAME, result);
		return result;
	});
}

export async function join(
	providers: Providers,
	contractAddress: string,
	initialPrivateState: PrivateState,
) {
	return withSpinner("Joining contract...", async () => {
		const compiledContract = loadCompiledContract();
		return findDeployedContract(providers, {
			contractAddress,
			compiledContract,
			privateStateId: PRIVATE_STATE_ID,
			initialPrivateState,
		});
	});
}

interface DeployedContractStore {
	[name: string]: {
		address: string;
		deployedAt: string;
		txId: string;
	};
}

function contractsPath(): string {
	return path.join(process.cwd(), STATE_DIR, CONTRACTS_FILE);
}

export function loadDeployedContracts(): DeployedContractStore {
	const filePath = contractsPath();
	if (!fs.existsSync(filePath)) {
		return {};
	}
	return JSON.parse(fs.readFileSync(filePath, "utf-8")) as DeployedContractStore;
}

export function getDeployedAddress(name: string = CONTRACT_NAME): string {
	const store = loadDeployedContracts();
	const entry = store[name];
	if (!entry) throw new Error(`No deployed contract recorded for "${name}". Run \`deploy\` first.`);
	return entry.address;
}

function saveDeployedContract(name: string, result: DeployResult): void {
	const store = loadDeployedContracts();
	store[name] = {
		address: result.contractAddress,
		deployedAt: new Date().toISOString(),
		txId: result.txId,
	};
	const dir = path.join(process.cwd(), STATE_DIR);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(contractsPath(), JSON.stringify(store, null, "\t") + "\n", {
		mode: FILE_MODE_PUBLIC,
	});
}
