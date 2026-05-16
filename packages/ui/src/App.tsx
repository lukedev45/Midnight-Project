import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScorerStream } from './api/stream';
import { clearPersona, loadPersona, type Persona } from './persona/storage';
import { EnrollPage } from './pages/Enroll';
import { ComposePage } from './pages/Compose';
import { FeedPage } from './pages/Feed';

type Tab = 'feed' | 'compose' | 'enroll';

export function App() {
  const [persona, setPersona] = useState<Persona | null>(() => loadPersona());
  const [tab, setTab] = useState<Tab>(persona ? 'feed' : 'enroll');
  const { state, feed, connected } = useScorerStream();

  function reset() {
    clearPersona();
    setPersona(null);
    setTab('enroll');
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">whistleblower</h1>
            <Badge variant="outline" className="text-xs">
              {connected ? '● live' : '○ offline'}
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              demo · contract runs in-process · no devnet required
            </span>
          </div>
          <div className="flex items-center gap-2">
            {persona ? (
              <>
                <Badge variant="secondary" className="font-mono text-xs">
                  {persona.credentialId} · {persona.pseudonymHex.slice(0, 8)}…
                </Badge>
                <Button variant="outline" size="sm" onClick={reset}>
                  Reset persona
                </Button>
              </>
            ) : (
              <Badge variant="outline" className="text-xs">not enrolled</Badge>
            )}
          </div>
        </div>
        <nav className="container mx-auto flex gap-2 px-4 pb-2">
          {(
            [
              ['feed', 'Feed'],
              ['compose', 'Compose'],
              ['enroll', 'Enroll'],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1 text-sm transition ${
                tab === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
              disabled={(id === 'compose' || id === 'feed') && !persona && id === 'compose'}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {tab === 'feed' && <FeedPage feed={feed} state={state} persona={persona} />}
        {tab === 'compose' && persona && (
          <ComposePage persona={persona} onPosted={() => setTab('feed')} />
        )}
        {tab === 'compose' && !persona && (
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            Enroll first to compose posts.
          </div>
        )}
        {tab === 'enroll' && (
          <EnrollPage
            onEnrolled={(p) => {
              setPersona(p);
              setTab('compose');
            }}
          />
        )}
      </main>
    </div>
  );
}
