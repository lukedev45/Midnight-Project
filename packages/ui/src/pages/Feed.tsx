import type { Persona } from '../persona/storage';
import type { FeedPost, Snapshot } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function scoreColor(score: number): string {
  if (score >= 75) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (score >= 50) return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
  if (score >= 25) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  return 'bg-red-500/20 text-red-300 border-red-500/40';
}

function shortHex(h: string, n = 12): string {
  return `${h.slice(0, n)}…`;
}

export function FeedPage(props: {
  feed: FeedPost[];
  state: Snapshot | null;
  persona: Persona | null;
}) {
  const sorted = [...props.feed].sort((a, b) => b.postId - a.postId);

  return (
    <div className="space-y-4">
      {props.state && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Forum state</CardTitle>
          </CardHeader>
          <CardContent className="text-sm flex flex-wrap items-center gap-3">
            <Badge variant="outline">{props.state.membersCount} members</Badge>
            <Badge variant="outline">{props.state.postCount} posts</Badge>
            <Badge variant="outline">{props.state.pseudonymScores.length} pseudonyms scored</Badge>
            {props.persona && (
              <Badge variant="secondary" className="font-mono">
                you · {shortHex(props.persona.pseudonymHex)}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {sorted.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No posts yet. Be the first.
            </CardContent>
          </Card>
        )}

        {sorted.map((p) => {
          const isMine = props.persona && p.pseudonymHex === props.persona.pseudonymHex;
          return (
            <Card key={p.postId} className={isMine ? 'ring-2 ring-primary/40' : ''}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{p.postId} · {shortHex(p.pseudonymHex)}
                    </span>
                    {isMine && <Badge variant="secondary">you</Badge>}
                  </div>
                  <div className={`rounded-md border px-2 py-1 text-xs font-mono ${scoreColor(p.currentScore)}`}>
                    score {p.currentScore}
                    {p.scoreDelta !== undefined && p.scoreDelta !== 0 && (
                      <span className="ml-1 opacity-70">
                        ({p.scoreDelta > 0 ? '+' : ''}
                        {p.scoreDelta})
                      </span>
                    )}
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm">{p.contentText}</p>
                {p.scoreReasons && p.scoreReasons.length > 0 && (
                  <div className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                    <div className="font-medium mb-1">AI score reasoning</div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {p.scoreReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="font-mono text-[10px] text-muted-foreground/60">
                  hash {shortHex(p.contentHashHex, 24)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
