import express, { type Request, type Response } from 'express';
import cors from 'cors';
import {
  bytesToHex,
  hashContentText,
  hashPseudonym,
  hexToBytes,
} from '@whistleblower/api';
import { bootstrapState, enrollPseudonym, submitPost, type ScorerState } from './state.js';
import { PostStore, type StoredPost } from './store.js';
import { scoreContent } from './scoring.js';

export interface ServerOptions {
  rosterSize?: number;
  seedPosts?: Array<{ credentialIndex: number; content: string }>;
}

export interface ServerHandle {
  app: express.Express;
  state: ScorerState;
  posts: PostStore;
  scoreNextPendingPost: () => boolean;
  scoreAllPending: () => number;
}

type StateChangeListener = () => void;

export function createServer(opts: ServerOptions = {}): ServerHandle {
  const state = bootstrapState(opts.rosterSize ?? 15);
  const posts = new PostStore();
  const listeners = new Set<StateChangeListener>();

  // Pseudonyms enrolled through this server, keyed by their pseudonym secret hex,
  // so a returning UI session can prove ownership by knowing the secret.
  // For the offline demo we never expose this map; the UI keeps its own copy
  // of (pseudonymSecretHex, pseudonymHex) per persona.

  function emitChange(): void {
    for (const l of listeners) {
      try { l(); } catch { /* swallow per-listener errors */ }
    }
  }

  state.contract.subscribe(() => emitChange());

  function snapshot(): {
    contractAddress: string;
    membersCount: number;
    postCount: number;
    pseudonymScores: { pseudonymHex: string; score: number }[];
  } {
    const ledger = state.contract.ledger();
    const pseudonymScores: { pseudonymHex: string; score: number }[] = [];
    for (const [key, val] of ledger.score_map) {
      pseudonymScores.push({ pseudonymHex: bytesToHex(key), score: Number(val) });
    }
    return {
      contractAddress: 'local-demo',
      membersCount: Number(ledger.members.firstFree()),
      postCount: Number(ledger.post_count),
      pseudonymScores,
    };
  }

  function rebuildFeed(): Array<StoredPost & { currentScore: number }> {
    const ledger = state.contract.ledger();
    return posts.list().map((p) => ({
      ...p,
      currentScore: ledger.score_map.member(hexToBytes(p.pseudonymHex))
        ? Number(ledger.score_map.lookup(hexToBytes(p.pseudonymHex)))
        : 0,
    }));
  }

  function scoreNextPendingPost(): boolean {
    const pending = posts.pendingScoring();
    if (pending.length === 0) return false;
    const next = pending[0];
    const ledger = state.contract.ledger();
    const pseudonymBytes = hexToBytes(next.pseudonymHex);
    if (!ledger.score_map.member(pseudonymBytes)) {
      // Pseudonym was rejected on chain; skip.
      posts.markScored(next.contentHashHex, 0, ['pseudonym not enrolled, skipped']);
      return true;
    }
    const currentScore = Number(ledger.score_map.lookup(pseudonymBytes));
    const result = scoreContent(next.contentText, currentScore);
    state.contract.updateScore(state.operatorSecret, pseudonymBytes, result.newScore);
    posts.markScored(next.contentHashHex, result.delta, result.reasons);
    return true;
  }

  function scoreAllPending(): number {
    let n = 0;
    while (scoreNextPendingPost()) n++;
    return n;
  }

  // Seed posts after server is ready (so the score loop has something to chew on).
  if (opts.seedPosts && opts.seedPosts.length > 0) {
    for (const seed of opts.seedPosts) {
      const cred = state.credentials[seed.credentialIndex];
      if (!cred) continue;
      const enrolled = enrollPseudonym(state, cred.credentialSecretHex);
      const submitted = submitPost(state, enrolled.pseudonymSecretHex, seed.content);
      posts.ingest(hexToBytes(submitted.contentHashHex), seed.content, submitted.pseudonymHex);
    }
    scoreAllPending();
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '64kb' }));

  // ---- Roster ----
  app.get('/api/credentials', (_req, res) => {
    res.json({ credentials: state.credentials });
  });

  // ---- Contract state snapshot ----
  app.get('/api/state', (_req, res) => {
    res.json(snapshot());
  });

  // ---- Feed (posts + current scores) ----
  app.get('/api/feed', (_req, res) => {
    res.json({ posts: rebuildFeed() });
  });

  // ---- Enroll: derive a new pseudonym + bind to credential ----
  app.post('/api/enroll', (req, res) => {
    const body = req.body as { credentialSecretHex?: string };
    if (!body.credentialSecretHex) {
      res.status(400).json({ error: 'credentialSecretHex required' });
      return;
    }
    try {
      const result = enrollPseudonym(state, body.credentialSecretHex);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ---- Post: submit content; scorer queues it for scoring ----
  app.post('/api/post', (req, res) => {
    const body = req.body as { pseudonymSecretHex?: string; content?: string };
    if (!body.pseudonymSecretHex || typeof body.content !== 'string') {
      res.status(400).json({ error: 'pseudonymSecretHex and content required' });
      return;
    }
    try {
      const submitted = submitPost(state, body.pseudonymSecretHex, body.content);
      const stored = posts.ingest(
        hexToBytes(submitted.contentHashHex),
        body.content,
        submitted.pseudonymHex,
      );
      res.json({ ...submitted, postId: stored.postId });
      // Kick the scorer asynchronously so the UI sees the new post before it's scored.
      queueMicrotask(() => scoreAllPending());
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // ---- Hash a content string ----
  // Useful when the UI wants to display the content hash up-front.
  app.post('/api/hash-content', (req, res) => {
    const body = req.body as { content?: string };
    if (typeof body.content !== 'string') {
      res.status(400).json({ error: 'content required' });
      return;
    }
    res.json({ contentHashHex: bytesToHex(hashContentText(body.content)) });
  });

  // ---- Server-Sent Events stream of state changes ----
  app.get('/api/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    function send(type: string, data: unknown): void {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    send('snapshot', { state: snapshot(), feed: rebuildFeed() });

    const listener = () => send('change', { state: snapshot(), feed: rebuildFeed() });
    listeners.add(listener);
    req.on('close', () => listeners.delete(listener));
  });

  return { app, state, posts, scoreNextPendingPost, scoreAllPending };
}
