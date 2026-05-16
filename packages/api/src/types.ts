import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { Ledger } from '@whistleblower/contract';

export type { PrivateState, Role, MemberPath } from '@whistleblower/contract';
export { emptyPrivateState } from '@whistleblower/contract';
import type { PrivateState } from '@whistleblower/contract';

export type ImpureCircuitKeys = 'add_member' | 'enroll' | 'post' | 'update_score';

export const PRIVATE_STATE_ID = 'whistleblower-private-state' as const;

export type ContractState = Ledger;

export interface DerivedScore {
  pseudonym: Uint8Array;
  score: number;
}

export interface PostEntry {
  postId: bigint;
  pseudonym: Uint8Array;
  contentHash: Uint8Array;
  txId: string;
  blockHeight?: bigint;
}

export interface DerivedState {
  contractState: ContractState | null;
  privateState: PrivateState | null;
}

export type AppProviders = MidnightProviders<ImpureCircuitKeys, typeof PRIVATE_STATE_ID, PrivateState>;
