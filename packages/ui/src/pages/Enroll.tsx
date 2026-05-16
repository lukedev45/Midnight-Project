import { useEffect, useState } from 'react';
import { scorerApi, type Credential } from '../api/client';
import { savePersona, type Persona } from '../persona/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function EnrollPage(props: { onEnrolled: (p: Persona) => void }) {
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    scorerApi.listCredentials()
      .then(({ credentials }) => setCredentials(credentials))
      .catch((err) => setError((err as Error).message));
  }, []);

  async function pickCredential(c: Credential) {
    setError(null);
    setBusy(c.id);
    try {
      const res = await scorerApi.enroll(c.credentialSecretHex);
      const persona: Persona = {
        pseudonymSecretHex: res.pseudonymSecretHex,
        pseudonymHex: res.pseudonymHex,
        credentialId: c.id,
        enrolledAt: new Date().toISOString(),
      };
      savePersona(persona);
      props.onEnrolled(persona);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Step 1 — Prove membership</CardTitle>
          <CardDescription>
            Pick a demo credential. The scorer will verify you're in the on-chain Merkle tree
            without revealing which member you are, and bind a fresh pseudonym to your post history.
            Your pseudonym secret is generated locally and never leaves this browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          {!credentials && <p className="text-sm text-muted-foreground">Loading roster…</p>}
          {credentials && (
            <div className="grid gap-2">
              {credentials.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="font-mono text-sm">{c.id}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      leaf: {c.leafHex.slice(0, 24)}…
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => pickCredential(c)}
                  >
                    {busy === c.id ? 'Enrolling…' : 'Use this credential'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What's happening under the hood</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The contract runs a <code>HistoricMerkleTree</code> membership check (Compact pattern #16) and
            consumes a one-time enrollment nullifier so the same credential can't enroll twice.
          </p>
          <p>
            <Badge variant="outline">Privacy</Badge> The on-chain transcript only learns that <em>someone</em> in the tree
            enrolled — never which credential.
          </p>
          <p>
            <Badge variant="outline">Demo mode</Badge> No devnet is required. The scorer runs the same
            compiled Compact contract in-memory via <code>@midnight-ntwrk/compact-runtime</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
