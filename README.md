# Anonymous Whistleblower Forum with AI Trust Score

A Midnight hackathon entry: a forum where a verified member of a closed group
(school, company) can post anonymously, and a persistent pseudonym accumulates an
AI-derived "Reliability Score" that follows them across posts — without ever
exposing who they are.

## What this demonstrates

| Privacy primitive | Where |
|---|---|
| Anonymous Merkle membership (Compact pattern #16) | `enroll` circuit, [`whistleblower.compact:121`](packages/contract/src/whistleblower.compact#L121) |
| Single-use enrollment nullifier (prevents one credential enrolling twice) | `enroll` circuit, same file |
| Persistent pseudonym pre-image proof | `enroll` and `post` circuits |
| Operator-attested score map (Compact pattern #1, hash-of-secret gate) | `update_score` circuit |
| Off-chain AI scoring bound to on-chain pseudonym | [`packages/scorer`](packages/scorer/) |

The AI trust model is **operator-signed**: a backend "Scorer" service holds an
operator secret, runs the AI (a heuristic stub for the demo), and writes scores
through the contract's operator-only `update_score` circuit. The contract has
no LLM in-circuit — that's not what Compact is for. The design is explicit
about the trust model.

## Repository layout

```
packages/
├── contract/   Compact source + compiled artifacts + TS witnesses + smoke tests
├── api/        Shared helpers: hash mirrors, merkle path lookup, LocalContract executor
├── cli/        oclif admin tool (deploy, bootstrap-roster, enroll-members, score)
├── scorer/     Node backend: REST + SSE, holds the in-memory contract state, runs AI scoring
└── ui/         Vite + React 19 + Tailwind v4: Enroll / Compose / Feed
```

## Why "offline demo"

The on-chain version of this design needs a running devnet, a funded wallet, a
proof server, and a several-minute proving-key build. For the 48-hour hackathon
we run the **same compiled Compact contract** in-memory inside the scorer
service via `@midnight-ntwrk/compact-runtime`. Every circuit, every assertion,
every disclosure is the same code path the chain would execute — the only
thing skipped is proof generation, the indexer, and transaction submission.

The architecture diagram is unchanged. In a chain deployment you'd swap
`LocalContract` for `findDeployedContract` and the rest of the system keeps
working.

## Run the demo

Prerequisites: Node ≥ 22, pnpm 11.

```bash
pnpm install

# Compile the contract (idempotent; --skip-zk for fast iteration)
COMPACT_DIRECTORY=./.compact compact compile --skip-zk \
  packages/contract/src/whistleblower.compact \
  packages/contract/src/managed/whistleblower

# Terminal 1 — start the scorer (bootstraps 15 members, seeds 5 posts)
pnpm dev:scorer

# Terminal 2 — start the UI
pnpm dev:ui
```

Open http://localhost:5173 in two browser tabs (or one normal + one private
window) to play two different members:

1. **Tab A** — pick a credential, post `"On 2026-05-16, found 7% discrepancy in invoice batch 884"` → watch the score jump above 50.
2. **Tab B** — pick a different credential, post `"OBVIOUSLY THE WHOLE THING IS A SCAM!!!"` → watch the score drop below 50.
3. Both tabs show the live feed via SSE; both pseudonyms have independent scores.

The scorer's stdout shows each tx and each score update.

## Run the tests

```bash
pnpm -r test
```

Coverage breakdown:

- **`packages/contract`** — 5 tests exercise the contract via
  `@midnight-ntwrk/compact-runtime` directly. Verifies admin gating, single-use
  nullifier, pseudonym ownership in `post`, operator gating, score range check.
- **`packages/api`** — 2 tests cover the `LocalContract` executor including the
  subscriber observable.
- **`packages/scorer`** — 5 in-process REST tests using `supertest`. Covers
  credential listing, enroll → post → autoscore, seed posts, rejection of
  unknown credentials, rejection of double-enrollment.
- **`packages/ui`** — 2 smoke tests; the meaningful coverage is in the scorer.

## Design holes (worth saying out loud)

1. **Enrollment timing leak.** The admin who hands out the credentials sees the
   enrollment tx land and can link `credential → nullifier → pseudonym` in the
   same transaction. Production fix: blinded credential distribution or
   delayed redemption.
2. **Operator key custody.** The operator secret lives in the scorer's
   in-memory state today. Production: HSM-backed key, or a TEE-attested signer.
3. **Pseudonym compromise = full impersonation.** No key-rotation circuit in
   v1. The pseudonym secret never leaves the browser, but a malicious
   extension can still exfiltrate it.
4. **Score gaming.** The scorer is a single trusted entity. A real deployment
   would either decentralize the scorer (multi-signer attestation) or use TEE
   attestation over the LLM call.

## Where to look in the code

- Contract: [`packages/contract/src/whistleblower.compact`](packages/contract/src/whistleblower.compact)
- Witnesses (TypeScript): [`packages/contract/src/witnesses.ts`](packages/contract/src/witnesses.ts)
- Contract smoke tests: [`packages/contract/src/contract.test.ts`](packages/contract/src/contract.test.ts)
- In-memory executor: [`packages/api/src/local-executor.ts`](packages/api/src/local-executor.ts)
- Domain-separated hash mirrors: [`packages/api/src/derive.ts`](packages/api/src/derive.ts)
- Scorer state + REST: [`packages/scorer/src/server.ts`](packages/scorer/src/server.ts)
- AI heuristic: [`packages/scorer/src/scoring.ts`](packages/scorer/src/scoring.ts)
- UI entry: [`packages/ui/src/App.tsx`](packages/ui/src/App.tsx)
- CLI admin commands: [`packages/cli/src/commands/`](packages/cli/src/commands/)
