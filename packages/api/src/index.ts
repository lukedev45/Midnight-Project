import { combineLatest, map, retry, Observable } from 'rxjs';

import { inMemoryPrivateStateProvider } from './private-state.js';
import { PRIVATE_STATE_ID, type AppProviders, type ContractState, type DerivedState } from './types.js';
import type { PrivateState } from '@whistleblower/contract';
import { parseLedger } from './derive.js';

export * from './types.js';
export * from './derive.js';
export * from './calls.js';
export * from './contract.js';
export * from './local-executor.js';
export { inMemoryPrivateStateProvider } from './private-state.js';

export function createStateObservable(
  publicDataProvider: AppProviders['publicDataProvider'],
  privateStateProvider: AppProviders['privateStateProvider'],
  contractAddress: string,
): Observable<DerivedState> {
  const public$ = publicDataProvider
    .contractStateObservable(contractAddress, { type: 'latest' })
    .pipe(map((state) => parseLedger(state.data) as ContractState));

  const private$ = new Observable<PrivateState | null>((subscriber) => {
    privateStateProvider
      .get(PRIVATE_STATE_ID)
      .then((s) => subscriber.next(s as PrivateState | null))
      .catch((err) => subscriber.error(err));
  });

  return combineLatest([public$, private$]).pipe(
    map(([contractState, privateState]) => ({ contractState, privateState })),
    retry({ delay: 500 }),
  );
}
