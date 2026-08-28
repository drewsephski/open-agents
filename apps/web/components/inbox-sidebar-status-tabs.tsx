"use client";

import { Archive } from "lucide-react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useRef } from "react";
import {
  SlidingTabIndicator,
  slidingTabProps,
  useSlidingTabBox,
} from "@/components/ui/sliding-tab-indicator";
import { cn } from "@/lib/utils";

type InboxSidebarStatusTabsProps = {
  showArchived: boolean;
  activeCount: number;
  archivedCount: number;
  onShowArchivedChange: (showArchived: boolean) => void;
};

export function InboxSidebarStatusTabs({
  showArchived,
  activeCount,
  archivedCount,
  onShowArchivedChange,
}: InboxSidebarStatusTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const archiveTabRef = useRef<HTMLButtonElement>(null);
  const activeKey = showArchived ? "archived" : "active";
  const box = useSlidingTabBox(listRef, activeKey);

  function handleTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    const nextShowArchived = !showArchived;
    onShowArchivedChange(nextShowArchived);
    const nextTab = nextShowArchived
      ? archiveTabRef.current
      : activeTabRef.current;
    nextTab?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Filter sessions"
      className="relative flex overflow-hidden rounded-md bg-sidebar-accent p-0.5"
      onKeyDown={handleTabListKeyDown}
    >
      <SlidingTabIndicator
        box={box}
        variant="pill"
        className="bg-black/5 shadow-none dark:bg-black/30"
      />
      <StatusTab
        ref={activeTabRef}
        selected={!showArchived}
        onSelect={() => onShowArchivedChange(false)}
      >
        Active
        {activeCount > 0 ? (
          <span className="ml-1.5 tabular-nums text-muted-foreground">
            {activeCount}
          </span>
        ) : null}
      </StatusTab>
      <StatusTab
        ref={archiveTabRef}
        selected={showArchived}
        onSelect={() => onShowArchivedChange(true)}
      >
        <Archive className="size-3" />
        Archive
        {archivedCount > 0 ? (
          <span className="ml-1 tabular-nums text-muted-foreground">
            {archivedCount}
          </span>
        ) : null}
      </StatusTab>
    </div>
  );
}

function StatusTab({
  ref,
  selected,
  onSelect,
  children,
}: {
  ref?: Ref<HTMLButtonElement>;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "relative z-10 flex flex-1 items-center justify-center gap-1 rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors duration-500 ease-out",
        selected
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
      {...slidingTabProps(selected)}
    >
      {children}
    </button>
  );
}
