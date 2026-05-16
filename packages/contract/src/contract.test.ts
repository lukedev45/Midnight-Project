import { describe, it, expect } from 'vitest';
import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from './managed/whistleblower/contract/index.js';
import { witnesses, type PrivateState, type MemberPath } from './witnesses.js';

const Bytes32 = new CompactTypeBytes(32);
const Vec2 = new CompactTypeVector(2, Bytes32);
const enc = new TextEncoder();
const pad32 = (s: string): Uint8Array => {
  const b = enc.encode(s);
  if (b.length > 32) throw new Error('domain too long');
  const o = new Uint8Array(32);
  o.set(b);
  return o;
};

const DOMAIN_ADMIN_PK = pad32('wb:admin:pk:');
const DOMAIN_OPERATOR_PK = pad32('wb:operator:pk:');
const DOMAIN_PSEUDONYM = pad32('wb:pseudonym:');
const DOMAIN_NULLIFIER = pad32('wb:enroll-null:');
const DOMAIN_MEMBER_LEAF = pad32('wb:member-leaf:');

const hashDomain = (domain: Uint8Array, payload: Uint8Array) =>
  persistentHash(Vec2, [domain, payload]);

const ADMIN_SECRET = new Uint8Array(32).fill(0x11);
const OPERATOR_SECRET = new Uint8Array(32).fill(0x22);
const CRED_0 = new Uint8Array(32).fill(0x33);
const CRED_1 = new Uint8Array(32).fill(0x44);
const PSEUDONYM_SECRET_0 = new Uint8Array(32).fill(0x55);
const PSEUDONYM_SECRET_1 = new Uint8Array(32).fill(0x66);

const ADMIN_PK = hashDomain(DOMAIN_ADMIN_PK, ADMIN_SECRET);
const OPERATOR_PK = hashDomain(DOMAIN_OPERATOR_PK, OPERATOR_SECRET);

const COIN_PK_HEX = '00'.repeat(32);

function deploy(initialPrivateState: PrivateState) {
  const contract = new Contract<PrivateState>(witnesses);
  const cctx = createConstructorContext<PrivateState>(initialPrivateState, COIN_PK_HEX);
  const init = contract.initialState(cctx, ADMIN_PK, OPERATOR_PK);
  return { contract, init };
}

function buildContext(
  ps: PrivateState,
  contractStateData: ReturnType<typeof Contract.prototype.initialState>['currentContractState']['data']
): CircuitContext<PrivateState> {
  return createCircuitContext<PrivateState>(dummyContractAddress(), COIN_PK_HEX, contractStateData, ps);
}

describe('whistleblower contract', () => {
  it('deploys and seals admin/operator pks', () => {
    const { init } = deploy({ role: 'unknown' });
    const l = ledger(init.currentContractState.data);
    expect(Buffer.from(l.admin_pk).toString('hex')).toBe(Buffer.from(ADMIN_PK).toString('hex'));
    expect(Buffer.from(l.operator_pk).toString('hex')).toBe(Buffer.from(OPERATOR_PK).toString('hex'));
    expect(l.members.firstFree()).toBe(0n);
    expect(l.consumed_nullifiers.size()).toBe(0n);
    expect(l.pseudonyms.size()).toBe(0n);
    expect(l.score_map.size()).toBe(0n);
    expect(l.post_count).toBe(0n);
  });

  it('admin adds members; non-admin rejected', () => {
    const adminPS: PrivateState = { role: 'admin', adminSecret: ADMIN_SECRET };
    const { contract, init } = deploy(adminPS);

    const leaf0 = hashDomain(DOMAIN_MEMBER_LEAF, CRED_0);
    const leaf1 = hashDomain(DOMAIN_MEMBER_LEAF, CRED_1);

    let ctx = buildContext(adminPS, init.currentContractState.data);
    const step1 = contract.impureCircuits.add_member(ctx, leaf0);
    ctx = step1.context as CircuitContext<PrivateState>;
    const step2 = contract.impureCircuits.add_member(ctx, leaf1);
    ctx = step2.context as CircuitContext<PrivateState>;

    const l = ledger(ctx.currentQueryContext.state);
    expect(l.members.firstFree()).toBe(2n);

    const badPS: PrivateState = { role: 'unknown', adminSecret: new Uint8Array(32) };
    const badCtx = buildContext(badPS, init.currentContractState.data);
    expect(() => contract.impureCircuits.add_member(badCtx, leaf0)).toThrow();
  });

  it('member can enroll once; cannot enroll twice; pseudonym ownership checked', () => {
    // Bootstrap: admin adds 2 members.
    const adminPS: PrivateState = { role: 'admin', adminSecret: ADMIN_SECRET };
    const { contract, init } = deploy(adminPS);
    let ctx = buildContext(adminPS, init.currentContractState.data);

    const leaf0 = hashDomain(DOMAIN_MEMBER_LEAF, CRED_0);
    const leaf1 = hashDomain(DOMAIN_MEMBER_LEAF, CRED_1);
    ctx = contract.impureCircuits.add_member(ctx, leaf0).context as CircuitContext<PrivateState>;
    ctx = contract.impureCircuits.add_member(ctx, leaf1).context as CircuitContext<PrivateState>;

    // Compute path for cred_0
    const stateAfterAdds = ledger(ctx.currentQueryContext.state);
    const path0 = stateAfterAdds.members.findPathForLeaf(leaf0) as unknown as MemberPath;
    expect(path0).toBeDefined();

    // Member enrolls.
    const pseudonym0 = hashDomain(DOMAIN_PSEUDONYM, PSEUDONYM_SECRET_0);
    const memberPS: PrivateState = {
      role: 'member',
      credentialSecret: CRED_0,
      pseudonymSecret: PSEUDONYM_SECRET_0,
      memberPath: path0,
    };
    const memberCtx = { ...ctx, currentPrivateState: memberPS };
    const enrolled = contract.impureCircuits.enroll(memberCtx, pseudonym0);
    const afterEnroll = ledger((enrolled.context as CircuitContext<PrivateState>).currentQueryContext.state);
    expect(afterEnroll.pseudonyms.member(pseudonym0)).toBe(true);
    expect(afterEnroll.score_map.member(pseudonym0)).toBe(true);
    expect(afterEnroll.score_map.lookup(pseudonym0)).toBe(50n);
    expect(afterEnroll.consumed_nullifiers.size()).toBe(1n);

    // Re-enroll same credential → reject.
    const replayCtx = {
      ...(enrolled.context as CircuitContext<PrivateState>),
      currentPrivateState: memberPS,
    };
    expect(() => contract.impureCircuits.enroll(replayCtx, pseudonym0)).toThrow();

    // Different pseudonym secret but pass cred_1 path → mismatched pseudonym should reject.
    const path1 = afterEnroll.members.findPathForLeaf(leaf1) as unknown as MemberPath;
    const wrongPS: PrivateState = {
      role: 'member',
      credentialSecret: CRED_1,
      pseudonymSecret: PSEUDONYM_SECRET_1,
      memberPath: path1,
    };
    const wrongPseudonym = hashDomain(DOMAIN_PSEUDONYM, new Uint8Array(32).fill(0x99));
    const wrongCtx = {
      ...(enrolled.context as CircuitContext<PrivateState>),
      currentPrivateState: wrongPS,
    };
    expect(() => contract.impureCircuits.enroll(wrongCtx, wrongPseudonym)).toThrow();
  });

  it('post requires pseudonym ownership and increments post_count', () => {
    const adminPS: PrivateState = { role: 'admin', adminSecret: ADMIN_SECRET };
    const { contract, init } = deploy(adminPS);
    let ctx = buildContext(adminPS, init.currentContractState.data);
    const leaf0 = hashDomain(DOMAIN_MEMBER_LEAF, CRED_0);
    ctx = contract.impureCircuits.add_member(ctx, leaf0).context as CircuitContext<PrivateState>;

    const path0 = ledger(ctx.currentQueryContext.state).members.findPathForLeaf(leaf0) as unknown as MemberPath;
    const memberPS: PrivateState = {
      role: 'member',
      credentialSecret: CRED_0,
      pseudonymSecret: PSEUDONYM_SECRET_0,
      memberPath: path0,
    };
    const pseudonym = hashDomain(DOMAIN_PSEUDONYM, PSEUDONYM_SECRET_0);
    const enrollCtx = { ...ctx, currentPrivateState: memberPS };
    ctx = contract.impureCircuits.enroll(enrollCtx, pseudonym).context as CircuitContext<PrivateState>;

    const contentHash = new Uint8Array(32).fill(0xAA);
    ctx = { ...ctx, currentPrivateState: memberPS };
    const posted = contract.impureCircuits.post(ctx, pseudonym, contentHash);
    const after = ledger((posted.context as CircuitContext<PrivateState>).currentQueryContext.state);
    expect(after.post_count).toBe(1n);

    // Wrong pseudonym secret → fails ownership check.
    const wrongCtx = {
      ...(posted.context as CircuitContext<PrivateState>),
      currentPrivateState: { ...memberPS, pseudonymSecret: new Uint8Array(32).fill(0x77) },
    };
    expect(() => contract.impureCircuits.post(wrongCtx, pseudonym, contentHash)).toThrow();
  });

  it('operator can update score; non-operator rejected; out-of-range rejected', () => {
    const adminPS: PrivateState = { role: 'admin', adminSecret: ADMIN_SECRET };
    const { contract, init } = deploy(adminPS);
    let ctx = buildContext(adminPS, init.currentContractState.data);
    const leaf0 = hashDomain(DOMAIN_MEMBER_LEAF, CRED_0);
    ctx = contract.impureCircuits.add_member(ctx, leaf0).context as CircuitContext<PrivateState>;

    const path0 = ledger(ctx.currentQueryContext.state).members.findPathForLeaf(leaf0) as unknown as MemberPath;
    const memberPS: PrivateState = {
      role: 'member',
      credentialSecret: CRED_0,
      pseudonymSecret: PSEUDONYM_SECRET_0,
      memberPath: path0,
    };
    const pseudonym = hashDomain(DOMAIN_PSEUDONYM, PSEUDONYM_SECRET_0);
    ctx = contract.impureCircuits.enroll({ ...ctx, currentPrivateState: memberPS }, pseudonym).context as CircuitContext<PrivateState>;

    // Operator updates score to 73.
    const opPS: PrivateState = { role: 'operator', operatorSecret: OPERATOR_SECRET };
    const opCtx = { ...ctx, currentPrivateState: opPS };
    const updated = contract.impureCircuits.update_score(opCtx, pseudonym, 73n);
    const after = ledger((updated.context as CircuitContext<PrivateState>).currentQueryContext.state);
    expect(after.score_map.lookup(pseudonym)).toBe(73n);

    // Non-operator → rejected.
    const badCtx = { ...ctx, currentPrivateState: { role: 'unknown', operatorSecret: new Uint8Array(32) } as PrivateState };
    expect(() => contract.impureCircuits.update_score(badCtx, pseudonym, 50n)).toThrow();

    // Score > 100 → rejected.
    expect(() => contract.impureCircuits.update_score(opCtx, pseudonym, 101n)).toThrow();
  });
});
