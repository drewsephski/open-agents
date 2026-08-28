import { z } from "zod";

export const MANAGED_INFERENCE_ALLOWANCE_MICROS = 10_000_000;
export const BYOK_SANDBOX_ALLOWANCE_MILLISECONDS = 2 * 60 * 60 * 1000;
export const PRO_SANDBOX_ALLOWANCE_MILLISECONDS = 25 * 60 * 60 * 1000;
export const BYOK_SANDBOX_CONCURRENCY_LIMIT = 1;
export const PRO_SANDBOX_CONCURRENCY_LIMIT = 2;

export const allowancePeriodSchema = z.object({
  start: z.date(),
  end: z.date(),
});

export type AllowancePeriod = z.infer<typeof allowancePeriodSchema>;

export function isWithinAllowancePeriod(
  now: Date,
  period: AllowancePeriod,
): boolean {
  return now >= period.start && now < period.end;
}

export function getUtcCalendarMonthPeriod(now: Date): AllowancePeriod {
  return {
    start: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    ),
    end: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    ),
  };
}
