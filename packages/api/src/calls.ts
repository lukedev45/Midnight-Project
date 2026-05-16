import {
  deployContract,
  findDeployedContract,
  type DeployedContract,
  type FoundContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { PrivateState, MemberPath } from '@whistleblower/contract';
import { buildCompiledContract, type WhistleblowerContract } from './contract.js';
import { PRIVATE_STATE_ID, type AppProviders } from './types.js';
import {
  hashAdminPk,
  hashOperatorPk,
  hashPseudonym,
  hashMemberLeaf,
  findMemberPath,
  parseLedger,
} from './derive.js';

export type DeployedWhistleblower = DeployedContract<WhistleblowerContract>;
export type FoundWhistleblower = FoundContract<WhistleblowerContract>;

async function setPrivateState(providers: AppProviders, ps: PrivateState): Promise<void> {
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, ps);
}

export async function deployWhistleblower(
  providers: AppProviders,
  compiledAssetsPath: string,
  adminSecret: Uint8Array,
  operatorSecret: Uint8Array,
): Promise<DeployedWhistleblower> {
  const compiledContract = buildCompiledContract(compiledAssetsPath);
  const adminPk = hashAdminPk(adminSecret);
  const operatorPk = hashOperatorPk(operatorSecret);

  return deployContract<WhistleblowerContract>(providers, {
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: { role: 'admin', adminSecret, operatorSecret } satisfies PrivateState,
    args: [adminPk, operatorPk],
  });
}

export async function findDeployedWhistleblower(
  providers: AppProviders,
  compiledAssetsPath: string,
  contractAddress: string,
): Promise<FoundWhistleblower> {
  const compiledContract = buildCompiledContract(compiledAssetsPath);
  return findDeployedContract<WhistleblowerContract>(providers, {
    compiledContract,
    contractAddress,
    privateStateId: PRIVATE_STATE_ID,
  });
}

export async function submitAddMember(
  providers: AppProviders,
  deployed: FoundWhistleblower,
  adminSecret: Uint8Array,
  credentialSecret: Uint8Array,
) {
  await setPrivateState(providers, { role: 'admin', adminSecret });
  const leaf = hashMemberLeaf(credentialSecret);
  return deployed.callTx.add_member(leaf);
}

export async function submitEnroll(
  providers: AppProviders,
  deployed: FoundWhistleblower,
  contractAddress: string,
  credentialSecret: Uint8Array,
  pseudonymSecret: Uint8Array,
) {
  const leaf = hashMemberLeaf(credentialSecret);

  // Resolve the merkle path from the latest public state.
  const latest = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!latest) throw new Error('contract state not found');
  const ledgerState = parseLedger(latest.data);
  const memberPath = findMemberPath(ledgerState, leaf);

  const pseudonym = hashPseudonym(pseudonymSecret);

  await setPrivateState(providers, {
    role: 'member',
    credentialSecret,
    pseudonymSecret,
    memberPath,
  });
  return deployed.callTx.enroll(pseudonym);
}

export async function submitPost(
  providers: AppProviders,
  deployed: FoundWhistleblower,
  pseudonymSecret: Uint8Array,
  contentHash: Uint8Array,
) {
  const pseudonym = hashPseudonym(pseudonymSecret);
  await setPrivateState(providers, { role: 'member', pseudonymSecret });
  return deployed.callTx.post(pseudonym, contentHash);
}

export async function submitUpdateScore(
  providers: AppProviders,
  deployed: FoundWhistleblower,
  operatorSecret: Uint8Array,
  pseudonym: Uint8Array,
  newScore: number,
) {
  if (newScore < 0 || newScore > 100 || !Number.isInteger(newScore)) {
    throw new Error(`newScore must be integer in [0, 100], got ${newScore}`);
  }
  await setPrivateState(providers, { role: 'operator', operatorSecret });
  return deployed.callTx.update_score(pseudonym, BigInt(newScore));
}

export type { MemberPath };
