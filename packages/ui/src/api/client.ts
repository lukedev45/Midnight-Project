export interface Credential {
  id: string;
  credentialSecretHex: string;
  leafHex: string;
}

export interface Snapshot {
  contractAddress: string;
  membersCount: number;
  postCount: number;
  pseudonymScores: { pseudonymHex: string; score: number }[];
}

export interface FeedPost {
  postId: number;
  pseudonymHex: string;
  contentHashHex: string;
  contentText: string;
  createdAt: string;
  scored: boolean;
  scoreDelta?: number;
  scoreReasons?: string[];
  currentScore: number;
}

const BASE = import.meta.env.VITE_SCORER_URL ?? 'http://localhost:4000';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const scorerApi = {
  baseUrl: BASE,
  listCredentials: () => api<{ credentials: Credential[] }>('/api/credentials'),
  getState: () => api<Snapshot>('/api/state'),
  getFeed: () => api<{ posts: FeedPost[] }>('/api/feed'),
  enroll: (credentialSecretHex: string) =>
    api<{ pseudonymSecretHex: string; pseudonymHex: string }>('/api/enroll', {
      method: 'POST',
      body: JSON.stringify({ credentialSecretHex }),
    }),
  post: (pseudonymSecretHex: string, content: string) =>
    api<{ pseudonymHex: string; contentHashHex: string; postId: number }>('/api/post', {
      method: 'POST',
      body: JSON.stringify({ pseudonymSecretHex, content }),
    }),
  hashContent: (content: string) =>
    api<{ contentHashHex: string }>('/api/hash-content', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};
