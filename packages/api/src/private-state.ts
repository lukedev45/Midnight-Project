import type { PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';

export function inMemoryPrivateStateProvider<PSI extends string, PS>(): PrivateStateProvider<PSI, PS> {
  const store = new Map<string, PS>();
  let contractAddress: string | undefined;

  const scopedKey = (id: PSI): string => `${contractAddress ?? '_'}::${id}`;

  return {
    setContractAddress: (address: string) => {
      contractAddress = address;
    },
    get: async (id: PSI) => store.get(scopedKey(id)) ?? null,
    set: async (id: PSI, state: PS) => {
      store.set(scopedKey(id), state);
    },
    remove: async (id: PSI) => {
      store.delete(scopedKey(id));
    },
  } as unknown as PrivateStateProvider<PSI, PS>;
}
