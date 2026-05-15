import {
  deployContract,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type {
  WalletProvider,
  MidnightProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { Contract, ledger } from "@midnight-counter/contract";
import { map, retry, type Observable } from "rxjs";
import { inMemoryPrivateStateProvider } from "./private-state.js";
import type {
  AppProviders,
  ContractState,
  DerivedState,
  ImpureCircuitKeys,
  PrivateState,
} from "./types.js";
import { PRIVATE_STATE_ID } from "./types.js";

export { inMemoryPrivateStateProvider } from "./private-state.js";
export type {
  AppProviders,
  ContractState,
  DerivedState,
  ImpureCircuitKeys,
  PrivateState,
} from "./types.js";
export { PRIVATE_STATE_ID } from "./types.js";

const witnesses = {};

function buildCompiledContract() {
  return CompiledContract.make("counter", Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withFetchedFileAssets(window.location.origin),
  );
}

function deriveProofServerUri(substrateNodeUri: string): string {
  try {
    const url = new URL(substrateNodeUri);
    url.port = "6300";
    url.pathname = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:6300";
  }
}

export async function createProviders(api: ConnectedAPI): Promise<AppProviders> {
  const config = await api.getConfiguration();
  setNetworkId(config.networkId);

  const publicDataProvider = indexerPublicDataProvider(
    config.indexerUri,
    config.indexerWsUri,
  );

  const privateStateProvider = inMemoryPrivateStateProvider<
    typeof PRIVATE_STATE_ID,
    PrivateState
  >();

  const zkConfigProvider = new FetchZkConfigProvider<ImpureCircuitKeys>(
    window.location.origin,
    fetch.bind(window),
  );

  const proofServerUri = deriveProofServerUri(config.substrateNodeUri);
  const proofProvider = httpClientProofProvider<ImpureCircuitKeys>(
    proofServerUri,
    zkConfigProvider,
  );

  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
    await api.getShieldedAddresses();

  const walletProvider: WalletProvider = {
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

  const midnightProvider: MidnightProvider = {
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

export async function deployCounter(providers: AppProviders) {
  return deployContract(providers, {
    compiledContract: buildCompiledContract(),
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: {},
  });
}

export async function joinCounter(
  providers: AppProviders,
  contractAddress: string,
) {
  return findDeployedContract(providers, {
    contractAddress,
    compiledContract: buildCompiledContract(),
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: {},
  });
}

export function createCounterStateObservable(
  providers: AppProviders,
  contractAddress: string,
): Observable<DerivedState> {
  return providers.publicDataProvider
    .contractStateObservable(contractAddress, { type: "latest" })
    .pipe(
      map((state) => ({
        contractState: ledger(state.data) as ContractState,
        privateState: null,
      })),
      retry({ delay: 500 }),
    );
}
