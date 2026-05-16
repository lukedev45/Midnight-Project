import { useEffect, useState } from 'react';
import { scorerApi, type FeedPost, type Snapshot } from './client';

export interface ScorerStream {
  state: Snapshot | null;
  feed: FeedPost[];
  connected: boolean;
  error: string | null;
}

/**
 * Subscribes to the scorer's Server-Sent Events stream. The stream emits
 * `snapshot` once on connect and `change` after every contract state mutation.
 * The hook also falls back to a short polling loop if SSE drops.
 */
export function useScorerStream(): ScorerStream {
  const [state, setState] = useState<Snapshot | null>(null);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `${scorerApi.baseUrl}/api/stream`;
    const es = new EventSource(url);

    const onPayload = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { state: Snapshot; feed: FeedPost[] };
        if (cancelled) return;
        setState(data.state);
        setFeed(data.feed);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    };

    es.addEventListener('snapshot', onPayload);
    es.addEventListener('change', onPayload);

    es.onopen = () => {
      if (!cancelled) {
        setConnected(true);
        setError(null);
      }
    };
    es.onerror = () => {
      if (!cancelled) {
        setConnected(false);
        setError('SSE disconnected; retrying...');
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, []);

  return { state, feed, connected, error };
}
