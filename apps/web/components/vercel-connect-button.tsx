"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Button } from "./ui/button";

export function VercelConnectButton({
  connected,
  disabled,
}: {
  connected: boolean;
  disabled?: boolean;
}) {
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    try {
      const result = await authClient.linkSocial({
        provider: "vercel",
        callbackURL: window.location.pathname,
      });
      if (result.error) throw new Error(result.error.message);
    } catch {
      toast.error("Could not connect Vercel. Please try again.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || connecting}
      onClick={connect}
    >
      {connecting && <Loader2Icon className="size-3.5 animate-spin" />}
      {connected ? "Reconnect Vercel" : "Connect Vercel"}
    </Button>
  );
}
