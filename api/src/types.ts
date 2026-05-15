import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";

export type ImpureCircuitKeys = "increment";

export const PRIVATE_STATE_ID = "counterState" as const;

export interface ContractState {
  counter: bigint;
}

export interface PrivateState {}

export interface DerivedState {
  contractState: ContractState | null;
  privateState: PrivateState | null;
}

export type AppProviders = MidnightProviders<
  ImpureCircuitKeys,
  typeof PRIVATE_STATE_ID,
  PrivateState
>;
