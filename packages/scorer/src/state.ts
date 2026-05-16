import crypto from 'node:crypto';
import {
  LocalContract,
  bytesToHex,
  hashAdminPk,
  hashContentText,
  hashMemberLeaf,
  hashOperatorPk,
  hashPseudonym,
  hexToBytes,
} from '@whistleblower/api';

export interface DemoCredential {
  id: string;
  credentialSecretHex: string;
  leafHex: string;
}

export interface ScorerState {
  contract: LocalContract;
  adminSecret: Uint8Array;
  operatorSecret: Uint8Array;
  credentials: DemoCredential[];
}

function random32(): Uint8Array {
  return new Uint8Array(crypto.randomBytes(32));
}

/**
 * Bootstraps a brand-new demo state: fresh admin + operator secrets, a roster
 * of N credentials, all members already added to the on-chain tree. The
 * credentials are returned to the caller so they can be served to the UI for
 * the enrollment demo.
 */
export function bootstrapState(rosterSize = 15): ScorerState {
  const adminSecret = random32();
  const operatorSecret = random32();
  const contract = LocalContract.deploy(hashAdminPk(adminSecret), hashOperatorPk(operatorSecret));

  const credentials: DemoCredential[] = [];
  for (let i = 0; i < rosterSize; i++) {
    const credentialSecret = random32();
    const leaf = hashMemberLeaf(credentialSecret);
    contract.addMember(adminSecret, leaf);
    credentials.push({
      id: `cred-${String(i).padStart(3, '0')}`,
      credentialSecretHex: bytesToHex(credentialSecret),
      leafHex: bytesToHex(leaf),
    });
  }

  return { contract, adminSecret, operatorSecret, credentials };
}

export function findCredentialBySecret(state: ScorerState, credentialSecretHex: string): DemoCredential | undefined {
  return state.credentials.find((c) => c.credentialSecretHex === credentialSecretHex);
}

export function enrollPseudonym(
  state: ScorerState,
  credentialSecretHex: string,
): { pseudonymSecretHex: string; pseudonymHex: string } {
  const credentialSecret = hexToBytes(credentialSecretHex);
  const pseudonymSecret = random32();
  const pseudonym = hashPseudonym(pseudonymSecret);

  state.contract.enroll({ credentialSecret, pseudonymSecret, pseudonym });

  return { pseudonymSecretHex: bytesToHex(pseudonymSecret), pseudonymHex: bytesToHex(pseudonym) };
}

export function submitPost(
  state: ScorerState,
  pseudonymSecretHex: string,
  contentText: string,
): { pseudonymHex: string; contentHashHex: string; postId: number } {
  const pseudonymSecret = hexToBytes(pseudonymSecretHex);
  const pseudonym = hashPseudonym(pseudonymSecret);
  const contentHash = hashContentText(contentText);
  state.contract.post({ pseudonymSecret, pseudonym, contentHash });
  return {
    pseudonymHex: bytesToHex(pseudonym),
    contentHashHex: bytesToHex(contentHash),
    postId: Number(state.contract.ledger().post_count) - 1,
  };
}
