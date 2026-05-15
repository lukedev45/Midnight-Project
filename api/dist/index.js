import { deployContract, findDeployedContract, } from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { Contract, ledger } from "@midnight-counter/contract";
import { map, retry } from "rxjs";
import { inMemoryPrivateStateProvider } from "./private-state.js";
import { PRIVATE_STATE_ID } from "./types.js";
export { inMemoryPrivateStateProvider } from "./private-state.js";
export { PRIVATE_STATE_ID } from "./types.js";
const witnesses = {};
function buildCompiledContract() {
    return CompiledContract.make("counter", Contract).pipe(CompiledContract.withWitnesses(witnesses), CompiledContract.withFetchedFileAssets(window.location.origin));
}
function deriveProofServerUri(substrateNodeUri) {
    try {
        const url = new URL(substrateNodeUri);
        url.port = "6300";
        url.pathname = "";
        return url.toString().replace(/\/$/, "");
    }
    catch {
        return "http://localhost:6300";
    }
}
export async function createProviders(api) {
    const config = await api.getConfiguration();
    setNetworkId(config.networkId);
    const publicDataProvider = indexerPublicDataProvider(config.indexerUri, config.indexerWsUri);
    const privateStateProvider = inMemoryPrivateStateProvider();
    const zkConfigProvider = new FetchZkConfigProvider(window.location.origin, fetch.bind(window));
    const proofServerUri = deriveProofServerUri(config.substrateNodeUri);
    const proofProvider = httpClientProofProvider(proofServerUri, zkConfigProvider);
    const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = await api.getShieldedAddresses();
    const walletProvider = {
        getCoinPublicKey: () => shieldedCoinPublicKey,
        getEncryptionPublicKey: () => shieldedEncryptionPublicKey,
        balanceTx: async (tx, newCoins, ttl) => {
            const result = await api.balanceUnsealedTransaction(tx, {
                newCoins,
                ttl,
            });
            return result.tx;
        },
    };
    const midnightProvider = {
        submitTx: async (tx) => {
            await api.submitTransaction(tx);
            return tx.txId;
        },
    };
    return {
        privateStateProvider,
        publicDataProvider,
        zkConfigProvider,
        proofProvider,
        walletProvider,
        midnightProvider,
    };
}
export async function deployCounter(providers) {
    return deployContract(providers, {
        compiledContract: buildCompiledContract(),
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
    });
}
export async function joinCounter(providers, contractAddress) {
    return findDeployedContract(providers, {
        contractAddress,
        compiledContract: buildCompiledContract(),
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
    });
}
export function createCounterStateObservable(providers, contractAddress) {
    return providers.publicDataProvider
        .contractStateObservable(contractAddress, { type: "latest" })
        .pipe(map((state) => ({
        contractState: ledger(state.data),
        privateState: null,
    })), retry({ delay: 500 }));
}
//# sourceMappingURL=index.js.map