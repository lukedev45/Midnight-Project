import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Contract } from '@whistleblower/contract';
import { witnesses } from '@whistleblower/contract';
import type { PrivateState } from '@whistleblower/contract';

export const CONTRACT_TAG = 'whistleblower';

export type WhistleblowerContract = InstanceType<typeof Contract<PrivateState>>;

export function buildCompiledContract(compiledAssetsPath: string) {
  return CompiledContract.make<WhistleblowerContract>(CONTRACT_TAG, Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(compiledAssetsPath),
  );
}
