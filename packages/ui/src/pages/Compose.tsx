import { useState } from 'react';
import { scorerApi } from '../api/client';
import type { Persona } from '../persona/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function ComposePage(props: { persona: Persona; onPosted: () => void }) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPost, setLastPost] = useState<{ postId: number; contentHashHex: string } | null>(null);

  async function submit() {
    if (content.trim().length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = await scorerApi.post(props.persona.pseudonymSecretHex, content);
      setLastPost({ postId: res.postId, contentHashHex: res.contentHashHex });
      setContent('');
      props.onPosted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Compose a post</CardTitle>
          <CardDescription>
            Posting from pseudonym <span className="font-mono">{props.persona.pseudonymHex.slice(0, 12)}…</span>{' '}
            (credential <code>{props.persona.credentialId}</code>). The on-chain tx carries only the
            content's <code>persistentHash</code>; the scorer reads the full text via the off-chain channel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="w-full rounded-md border bg-background p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="What happened?  Specific dates, numbers, and named processes raise your trust score; vague rants lower it."
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {content.length} chars
            </div>
            <Button onClick={submit} disabled={busy || content.trim().length === 0}>
              {busy ? 'Submitting…' : 'Post'}
            </Button>
          </div>

          {lastPost && (
            <div className="rounded-md border border-green-700/40 bg-green-700/10 p-3 text-sm">
              <div>
                <Badge variant="outline">Posted</Badge> post #{lastPost.postId}
              </div>
              <div className="font-mono text-xs text-muted-foreground mt-1">
                content_hash {lastPost.contentHashHex.slice(0, 24)}…
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                The scorer will pick this up momentarily; switch to the Feed tab to watch your trust
                score change.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
