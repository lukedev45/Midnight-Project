import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { type Observable } from "rxjs";
import type { AppProviders, DerivedState } from "./types.js";
export { inMemoryPrivateStateProvider } from "./private-state.js";
export type { AppProviders, ContractState, DerivedState, ImpureCircuitKeys, PrivateState, } from "./types.js";
export { PRIVATE_STATE_ID } from "./types.js";
export declare function createProviders(api: ConnectedAPI): Promise<AppProviders>;
export declare function deployCounter(providers: AppProviders): Promise<import("@midnight-ntwrk/midnight-js-contracts").DeployedContract<import("@midnight-ntwrk/compact-js").Contract<undefined, import("@midnight-ntwrk/compact-js").Witnesses<undefined>>>>;
export declare function joinCounter(providers: AppProviders, contractAddress: string): Promise<import("@midnight-ntwrk/midnight-js-contracts").FoundContract<import("@midnight-ntwrk/compact-js").Contract.Any>>;
export declare function createCounterStateObservable(providers: AppProviders, contractAddress: string): Observable<DerivedState>;
//# sourceMappingURL=index.d.ts.map