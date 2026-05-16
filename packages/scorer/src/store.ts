import { bytesToHex } from '@whistleblower/api';

export interface StoredPost {
  postId: number;
  pseudonymHex: string;
  contentHash: Uint8Array;
  contentHashHex: string;
  contentText: string;
  createdAt: string;
  scored: boolean;
  scoreDelta?: number;
  scoreReasons?: string[];
}

/**
 * In-memory post log. Keyed by content_hash hex so duplicate POSTs are
 * idempotent. Iteration order is insertion order, which matches the
 * post_count sequence we use elsewhere.
 */
export class PostStore {
  private posts: StoredPost[] = [];
  private byHash = new Map<string, StoredPost>();

  ingest(contentHash: Uint8Array, contentText: string, pseudonymHex: string): StoredPost {
    const contentHashHex = bytesToHex(contentHash);
    const existing = this.byHash.get(contentHashHex);
    if (existing) return existing;

    const post: StoredPost = {
      postId: this.posts.length,
      pseudonymHex,
      contentHash,
      contentHashHex,
      contentText,
      createdAt: new Date().toISOString(),
      scored: false,
    };
    this.posts.push(post);
    this.byHash.set(contentHashHex, post);
    return post;
  }

  markScored(contentHashHex: string, delta: number, reasons: string[]): void {
    const post = this.byHash.get(contentHashHex);
    if (!post) return;
    post.scored = true;
    post.scoreDelta = delta;
    post.scoreReasons = reasons;
  }

  list(): StoredPost[] {
    return [...this.posts];
  }

  pendingScoring(): StoredPost[] {
    return this.posts.filter((p) => !p.scored);
  }
}
