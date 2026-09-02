"use client";

import {
  MISSION_DEFINITIONS,
  getMissionDefinition,
  isMissionType,
  type MissionType,
} from "@/lib/missions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";

interface SessionStarterMissionFieldsProps {
  missionType: MissionType;
  task: string;
  disabled: boolean;
  onMissionTypeChange: (missionType: MissionType) => void;
  onTaskChange: (task: string) => void;
}

export function SessionStarterMissionFields({
  missionType,
  task,
  disabled,
  onMissionTypeChange,
  onTaskChange,
}: SessionStarterMissionFieldsProps) {
  const mission = getMissionDefinition(missionType);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-start">
        <label
          htmlFor="repository-mission"
          className="pt-2 text-sm font-medium text-foreground"
        >
          Mission
        </label>
        <div className="space-y-1.5">
          <Select
            value={missionType}
            onValueChange={(value) => {
              if (isMissionType(value)) {
                onMissionTypeChange(value);
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger
              id="repository-mission"
              aria-label="Mission"
              className="w-full bg-background/80 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {MISSION_DEFINITIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{mission.description}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="repository-mission-task"
          className="text-sm font-medium text-foreground"
        >
          Desired outcome
        </label>
        <Textarea
          id="repository-mission-task"
          value={task}
          onChange={(event) => onTaskChange(event.target.value)}
          placeholder={mission.placeholder}
          disabled={disabled}
          className="min-h-20 resize-none bg-background/80 leading-relaxed dark:bg-white/[0.03]"
        />
        <p className="text-xs text-muted-foreground">
          This becomes your first message in the session.
        </p>
      </div>
    </div>
  );
}
