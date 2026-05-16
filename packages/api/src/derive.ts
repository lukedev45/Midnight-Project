import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash as runtimePersistentHash,
  type StateValue,
  type ChargedState,
} from '@midnight-ntwrk/compact-runtime';
import { ledger as parseLedgerState } from '@whistleblower/contract';
import type { Ledger, MemberPath } from '@whistleblower/contract';

const Bytes32 = new CompactTypeBytes(32);
const Vector2Bytes32 = new CompactTypeVector(2, Bytes32);

const encoder = new TextEncoder();

export function pad32(input: string): Uint8Array {
  const bytes = encoder.encode(input);
  if (bytes.length > 32) {
    throw new Error(`pad32: input too long (${bytes.length} > 32 bytes)`);
  }
  const out = new Uint8Array(32);
  out.set(bytes);
  return out;
}

export const DOMAIN_ADMIN_PK = pad32('wb:admin:pk:');
export const DOMAIN_OPERATOR_PK = pad32('wb:operator:pk:');
export const DOMAIN_PSEUDONYM = pad32('wb:pseudonym:');
export const DOMAIN_NULLIFIER = pad32('wb:enroll-null:');
export const DOMAIN_MEMBER_LEAF = pad32('wb:member-leaf:');
export const DOMAIN_CONTENT = pad32('wb:content:');

function hashDomain(domain: Uint8Array, payload: Uint8Array): Uint8Array {
  if (payload.length !== 32) {
    throw new Error(`hashDomain: payload must be 32 bytes, got ${payload.length}`);
  }
  return runtimePersistentHash(Vector2Bytes32, [domain, payload]);
}

export const hashAdminPk = (secret: Uint8Array) => hashDomain(DOMAIN_ADMIN_PK, secret);
export const hashOperatorPk = (secret: Uint8Array) => hashDomain(DOMAIN_OPERATOR_PK, secret);
export const hashPseudonym = (secret: Uint8Array) => hashDomain(DOMAIN_PSEUDONYM, secret);
export const hashNullifier = (credentialSecret: Uint8Array) => hashDomain(DOMAIN_NULLIFIER, credentialSecret);
export const hashMemberLeaf = (credentialSecret: Uint8Array) => hashDomain(DOMAIN_MEMBER_LEAF, credentialSecret);

/**
 * Hashes a UTF-8 string into a 32-byte content_hash via persistentHash([DOMAIN_CONTENT, ...]).
 * The text is padded to 32 bytes (truncated/zero-padded). Used by the off-chain ingest path
 * so the on-chain content_hash binds to the exact text the scorer sees.
 */
export function hashContentText(text: string): Uint8Array {
  const raw = encoder.encode(text);
  // Padding scheme: zero-pad or truncate to 32 bytes. Collisions for long text
  // are acceptable for the demo since the on-chain log binds only to this hash;
  // a real system would chunk-and-merkle the text.
  const payload = new Uint8Array(32);
  payload.set(raw.subarray(0, 32));
  return hashDomain(DOMAIN_CONTENT, payload);
}

export function randomBytes32(): Uint8Array {
  const out = new Uint8Array(32);
  crypto.getRandomValues(out);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('hex string must have even length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

export function parseLedger(stateData: StateValue | ChargedState): Ledger {
  return parseLedgerState(stateData);
}

export function findMemberPath(ledger: Ledger, leaf: Uint8Array): MemberPath {
  const path = ledger.members.findPathForLeaf(leaf);
  if (!path) {
    throw new Error('leaf not in members tree');
  }
  return path as unknown as MemberPath;
}
