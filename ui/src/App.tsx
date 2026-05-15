import { useState, useCallback, useMemo } from "react";
import { WalletProvider } from "@/providers/wallet-context";
import { MidnightProvidersProvider } from "@/providers/midnight-providers";
import { useMidnightProviders } from "@/providers/midnight-providers";
import { WalletWidget } from "@/components/wallet-widget";
import { NetworkBadge } from "@/components/network-badge";
import { ProofServerStatus } from "@/components/proof-server-status";
import { useWallet } from "@/hooks/use-wallet";
import { useContractState } from "@/hooks/use-contract-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  deployCounter,
  joinCounter,
  createCounterStateObservable,
} from "midnight-counter-api";

type ContractMode = "idle" | "deploying" | "joining" | "active";

function CounterPanel() {
  const { providers, isReady } = useMidnightProviders();
  const { status } = useWallet();

  const [mode, setMode] = useState<ContractMode>("idle");
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [isIncrementing, setIsIncrementing] = useState(false);
  const [deployedContract, setDeployedContract] = useState<Awaited<
    ReturnType<typeof deployCounter>
  > | null>(null);

  const stateObservable = useMemo(
    () =>
      providers && contractAddress
        ? createCounterStateObservable(providers, contractAddress)
        : null,
    [providers, contractAddress],
  );

  const { state } = useContractState(stateObservable);

  const handleDeploy = useCallback(async () => {
    if (!providers) return;
    setMode("deploying");
    setTxStatus("Deploying contract…");
    try {
      const deployed = await deployCounter(providers);
      const address =
        deployed.deployTxData.public.contractAddress;
      setDeployedContract(deployed);
      setContractAddress(address);
      setMode("active");
      setTxStatus(null);
    } catch (err) {
      setTxStatus(`Deploy failed: ${err instanceof Error ? err.message : String(err)}`);
      setMode("idle");
    }
  }, [providers]);

  const handleJoin = useCallback(async () => {
    if (!providers || !joinInput.trim()) return;
    setMode("joining");
    setTxStatus("Joining contract…");
    try {
      const found = await joinCounter(providers, joinInput.trim());
      setDeployedContract(found as typeof deployedContract);
      setContractAddress(joinInput.trim());
      setMode("active");
      setTxStatus(null);
    } catch (err) {
      setTxStatus(`Join failed: ${err instanceof Error ? err.message : String(err)}`);
      setMode("idle");
    }
  }, [providers, joinInput]);

  const handleIncrement = useCallback(async () => {
    if (!deployedContract) return;
    setIsIncrementing(true);
    setTxStatus("Submitting transaction…");
    try {
      await deployedContract.callTx.increment();
      setTxStatus("Incremented!");
    } catch (err) {
      setTxStatus(`Increment failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsIncrementing(false);
    }
  }, [deployedContract]);

  if (status !== "connected") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Counter</CardTitle>
          <CardDescription>
            Connect your Lace wallet to deploy or join a counter contract.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Counter</CardTitle>
          <CardDescription>Initializing providers…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (mode === "idle") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Counter</CardTitle>
          <CardDescription>
            Deploy a new counter contract or join an existing one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleDeploy} className="w-full">
            Deploy New Counter
          </Button>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border px-3 py-2 text-sm"
              placeholder="Contract address…"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
            />
            <Button variant="outline" onClick={handleJoin} disabled={!joinInput.trim()}>
              Join
            </Button>
          </div>
          {txStatus && (
            <p className="text-sm text-muted-foreground">{txStatus}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (mode === "deploying" || mode === "joining") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Counter</CardTitle>
          <CardDescription>{txStatus ?? "Please wait…"}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Counter</CardTitle>
        <CardDescription className="font-mono text-xs break-all">
          {contractAddress}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Current count</p>
          <p className="text-6xl font-bold tabular-nums">
            {state?.contractState != null
              ? state.contractState.counter.toString()
              : "…"}
          </p>
        </div>
        <Button
          onClick={handleIncrement}
          disabled={isIncrementing}
          className="w-full"
        >
          {isIncrementing ? "Submitting…" : "Increment"}
        </Button>
        {txStatus && (
          <p className="text-sm text-muted-foreground text-center">{txStatus}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function App() {
  return (
    <WalletProvider>
      <MidnightProvidersProvider>
        <div className="min-h-screen bg-background">
          <header className="border-b">
            <div className="container mx-auto flex items-center justify-between px-4 py-3">
              <h1 className="text-lg font-semibold">Counter DApp</h1>
              <div className="flex items-center gap-3">
                <NetworkBadge />
                <ProofServerStatus />
                <WalletWidget />
              </div>
            </div>
          </header>
          <main className="container mx-auto px-4 py-8 max-w-lg">
            <CounterPanel />
          </main>
        </div>
      </MidnightProvidersProvider>
    </WalletProvider>
  );
}
