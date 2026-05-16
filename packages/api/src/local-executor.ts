import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, witnesses, type Ledger, type PrivateState } from '@whistleblower/contract';
import { hashMemberLeaf, parseLedger } from './derive.js';

/**
 * In-memory executor that runs the real compiled Compact contract without a
 * chain, proof server, or wallet. This is the same code path the on-chain
 * runtime would invoke; the only difference is that nothing is proved or
 * persisted to a ledger. Used by the offline demo's scorer service.
 */

const COIN_PK_HEX = '00'.repeat(32);

export type ContractStateData = ReturnType<Contract<PrivateState>['initialState']>['currentContractState']['data'];

export interface LocalSnapshot {
  contractData: ContractStateData;
}

type Subscriber = (snapshot: LocalSnapshot) => void;

export class LocalContract {
  private readonly contract: Contract<PrivateState>;
  private snapshot: LocalSnapshot;
  private readonly subscribers = new Set<Subscriber>();

  private constructor(snapshot: LocalSnapshot) {
    this.contract = new Contract<PrivateState>(witnesses);
    this.snapshot = snapshot;
  }

  static deploy(adminPk: Uint8Array, operatorPk: Uint8Array): LocalContract {
    const c = new Contract<PrivateState>(witnesses);
    const cctx = createConstructorContext<PrivateState>({ role: 'unknown' }, COIN_PK_HEX);
    const init = c.initialState(cctx, adminPk, operatorPk);
    return new LocalContract({ contractData: init.currentContractState.data });
  }

  ledger(): Ledger {
    return parseLedger(this.snapshot.contractData);
  }

  private buildContext(ps: PrivateState): CircuitContext<PrivateState> {
    return createCircuitContext<PrivateState>(
      dummyContractAddress(),
      COIN_PK_HEX,
      this.snapshot.contractData,
      ps,
    );
  }

  private commit(ctx: CircuitContext<PrivateState>): void {
    this.snapshot = { contractData: ctx.currentQueryContext.state };
    for (const s of this.subscribers) s(this.snapshot);
  }

  private exec<T>(
    ps: PrivateState,
    invoke: (ctx: CircuitContext<PrivateState>) => { context: unknown; result: T },
  ): T {
    const ctx = this.buildContext(ps);
    const { context, result } = invoke(ctx);
    this.commit(context as CircuitContext<PrivateState>);
    return result;
  }

  addMember(adminSecret: Uint8Array, commitment: Uint8Array): void {
    this.exec({ role: 'admin', adminSecret }, (ctx) =>
      this.contract.impureCircuits.add_member(ctx, commitment) as unknown as { context: unknown; result: [] },
    );
  }

  enroll(args: {
    credentialSecret: Uint8Array;
    pseudonymSecret: Uint8Array;
    pseudonym: Uint8Array;
  }): void {
    const { credentialSecret, pseudonymSecret, pseudonym } = args;
    const ledger = this.ledger();
    const path = ledger.members.findPathForLeaf(this._leafForCredential(credentialSecret));
    if (!path) throw new Error('credential not enrolled by admin');

    this.exec(
      {
        role: 'member',
        credentialSecret,
        pseudonymSecret,
        memberPath: path as unknown as PrivateState['memberPath'],
      },
      (ctx) => this.contract.impureCircuits.enroll(ctx, pseudonym) as unknown as { context: unknown; result: [] },
    );
  }

  post(args: { pseudonymSecret: Uint8Array; pseudonym: Uint8Array; contentHash: Uint8Array }): void {
    this.exec(
      { role: 'member', pseudonymSecret: args.pseudonymSecret },
      (ctx) =>
        this.contract.impureCircuits.post(ctx, args.pseudonym, args.contentHash) as unknown as {
          context: unknown;
          result: [];
        },
    );
  }

  updateScore(operatorSecret: Uint8Array, pseudonym: Uint8Array, newScore: number): void {
    if (newScore < 0 || newScore > 100 || !Number.isInteger(newScore)) {
      throw new Error(`score must be integer in [0, 100], got ${newScore}`);
    }
    this.exec({ role: 'operator', operatorSecret }, (ctx) =>
      this.contract.impureCircuits.update_score(ctx, pseudonym, BigInt(newScore)) as unknown as {
        context: unknown;
        result: [];
      },
    );
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    cb(this.snapshot);
    return () => this.subscribers.delete(cb);
  }

  private _leafForCredential(credentialSecret: Uint8Array): Uint8Array {
    return hashMemberLeaf(credentialSecret);
  }
}
