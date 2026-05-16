import { describe, it, expect } from 'vitest';
import { LocalContract } from './local-executor.js';
import {
  hashAdminPk,
  hashOperatorPk,
  hashPseudonym,
  hashMemberLeaf,
} from './derive.js';

const ADMIN_SECRET = new Uint8Array(32).fill(0xA1);
const OPERATOR_SECRET = new Uint8Array(32).fill(0xB2);
const CRED_0 = new Uint8Array(32).fill(0xC3);
const CRED_1 = new Uint8Array(32).fill(0xC4);
const PSK_0 = new Uint8Array(32).fill(0xD5);

describe('LocalContract', () => {
  it('runs the full enroll → post → score lifecycle', () => {
    const adminPk = hashAdminPk(ADMIN_SECRET);
    const operatorPk = hashOperatorPk(OPERATOR_SECRET);
    const c = LocalContract.deploy(adminPk, operatorPk);

    expect(Buffer.from(c.ledger().admin_pk).toString('hex')).toBe(Buffer.from(adminPk).toString('hex'));
    expect(c.ledger().members.firstFree()).toBe(0n);

    // Admin adds two members.
    c.addMember(ADMIN_SECRET, hashMemberLeaf(CRED_0));
    c.addMember(ADMIN_SECRET, hashMemberLeaf(CRED_1));
    expect(c.ledger().members.firstFree()).toBe(2n);

    // Member 0 enrolls.
    const pseudonym = hashPseudonym(PSK_0);
    c.enroll({ credentialSecret: CRED_0, pseudonymSecret: PSK_0, pseudonym });
    expect(c.ledger().score_map.lookup(pseudonym)).toBe(50n);
    expect(c.ledger().pseudonyms.member(pseudonym)).toBe(true);
    expect(c.ledger().consumed_nullifiers.size()).toBe(1n);

    // Member 0 posts.
    const contentHash = new Uint8Array(32).fill(0xEE);
    c.post({ pseudonymSecret: PSK_0, pseudonym, contentHash });
    expect(c.ledger().post_count).toBe(1n);

    // Operator updates score.
    c.updateScore(OPERATOR_SECRET, pseudonym, 73);
    expect(c.ledger().score_map.lookup(pseudonym)).toBe(73n);

    // Re-enrollment of same credential is rejected.
    expect(() => c.enroll({ credentialSecret: CRED_0, pseudonymSecret: PSK_0, pseudonym })).toThrow();
  });

  it('emits snapshots to subscribers on every state change', () => {
    const c = LocalContract.deploy(hashAdminPk(ADMIN_SECRET), hashOperatorPk(OPERATOR_SECRET));
    const snaps: number[] = [];
    const unsub = c.subscribe(() => snaps.push(snaps.length));
    expect(snaps).toHaveLength(1); // initial fire-on-subscribe

    c.addMember(ADMIN_SECRET, hashMemberLeaf(CRED_0));
    expect(snaps).toHaveLength(2);

    unsub();
    c.addMember(ADMIN_SECRET, hashMemberLeaf(CRED_1));
    expect(snaps).toHaveLength(2); // unsubscribed, no more events
  });
});
