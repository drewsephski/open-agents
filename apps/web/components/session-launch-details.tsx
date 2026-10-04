"use client";
import type { ActionBindings } from "@/lib/actions/bindings";
import { ACTION_TOOLKITS } from "@/lib/actions/registry";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";

export interface SessionLaunchDetailsData {
  runtime: string;
  model: string | null;
  bindings: ActionBindings | null;
}

export function SessionLaunchDetails({
  name,
  version,
  details,
  repository,
}: {
  name: string;
  version: number;
  details: SessionLaunchDetailsData;
  repository: string | null;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="mb-1 h-auto max-w-full whitespace-normal break-words px-1 py-1 text-left text-xs text-muted-foreground"
          aria-label="Inspect Session launch context"
        >
          {name} · v{version}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="space-y-3 text-xs" align="start">
        <p className="break-words font-medium">
          {name} · v{version}
        </p>
        <dl className="space-y-2">
          <div>
            <dt className="text-muted-foreground">Runtime</dt>
            <dd>
              {details.runtime === "launchstack_native"
                ? "LaunchStack Native"
                : details.runtime}
            </dd>
          </div>
          {details.model && (
            <div>
              <dt className="text-muted-foreground">Launch model</dt>
              <dd className="break-words">{details.model}</dd>
            </div>
          )}
          {repository && (
            <div>
              <dt className="text-muted-foreground">Repository</dt>
              <dd className="break-words">{repository}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Connected apps at launch</dt>
            <dd>
              {details.bindings == null
                ? "Legacy worker · no launch binding recorded"
                : Object.keys(details.bindings).length === 0
                  ? "None required"
                  : (["gmail", "linear"] as const).map((toolkit) => {
                      const account = details.bindings?.[toolkit];
                      return account ? (
                        <p key={toolkit} className="mt-1 break-words">
                          {ACTION_TOOLKITS[toolkit].label} → {account.label}
                          <span className="block text-muted-foreground">
                            {account.accountId}
                          </span>
                        </p>
                      ) : null;
                    })}
            </dd>
          </div>
        </dl>
        <p className="text-pretty text-muted-foreground">
          Account identity is frozen. Authorization is checked live before every
          Action.
        </p>
      </PopoverContent>
    </Popover>
  );
}
