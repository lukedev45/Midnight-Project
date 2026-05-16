import type { Witnesses } from './managed/whistleblower/contract/index.js';

export type Role = 'member' | 'admin' | 'operator' | 'unknown';

export type MemberPath = {
  leaf: Uint8Array;
  path: { sibling: { field: bigint }; goes_left: boolean }[];
};

export type PrivateState = {
  role: Role;
  adminSecret?: Uint8Array;
  operatorSecret?: Uint8Array;
  pseudonymSecret?: Uint8Array;
  credentialSecret?: Uint8Array;
  memberPath?: MemberPath;
};

export const emptyPrivateState = (): PrivateState => ({ role: 'unknown' });

const must = (val: Uint8Array | undefined, name: string): Uint8Array => {
  if (!val) throw new Error(`witness ${name} called without a value in PrivateState`);
  if (val.length !== 32) throw new Error(`witness ${name} expects 32 bytes, got ${val.length}`);
  return val;
};

export const witnesses: Witnesses<PrivateState> = {
  admin_secret: ({ privateState }) => [privateState, must(privateState.adminSecret, 'admin_secret')],
  operator_secret: ({ privateState }) => [privateState, must(privateState.operatorSecret, 'operator_secret')],
  pseudonym_secret: ({ privateState }) => [privateState, must(privateState.pseudonymSecret, 'pseudonym_secret')],
  credential_secret: ({ privateState }) => [privateState, must(privateState.credentialSecret, 'credential_secret')],
  member_path: ({ privateState }, _leaf) => {
    if (!privateState.memberPath) {
      throw new Error('witness member_path called without a memberPath in PrivateState');
    }
    return [privateState, privateState.memberPath];
  },
};
