export interface BusyInterval {
  readonly start: Date;
  readonly end: Date;
}

export interface Gap {
  readonly start: Date;
  readonly end: Date;
}

export interface GapOptions {
  readonly minGapMinutes: number;
  readonly maxGapMinutes: number;
  readonly cooldownMinutes: number;
  readonly earliestHourLocal: number;
  readonly latestHourLocal: number;
}

export const DEFAULT_GAP_OPTIONS: GapOptions = {
  minGapMinutes: 5,
  maxGapMinutes: 60,
  cooldownMinutes: 30,
  earliestHourLocal: 9,
  latestHourLocal: 17,
};

interface LocalDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
}

function formatParts(date: Date, timeZone: string): LocalDateTime {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const result: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of formatter.formatToParts(date)) {
    result[part.type] = part.value;
  }
  const year = Number(result.year);
  const month = Number(result.month);
  const day = Number(result.day);
  const hour = Number(result.hour);
  if (![year, month, day, hour].every(Number.isFinite)) {
    throw new RangeError(`Unable to resolve time zone '${timeZone}'.`);
  }
  return { year, month, day, hour };
}

function offsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  });
  const offset = formatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  if (offset === undefined || offset === "GMT") {
    return 0;
  }
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(offset);
  if (match === null) {
    throw new RangeError(`Unable to resolve UTC offset for '${timeZone}'.`);
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function localTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const nominal = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
  let candidate = nominal;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    candidate = nominal - offsetMinutes(new Date(candidate), timeZone) * 60_000;
  }
  return new Date(candidate);
}

function localMidnightAfter(date: LocalDateTime): LocalDateTime {
  const tomorrow = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return {
    year: tomorrow.getUTCFullYear(),
    month: tomorrow.getUTCMonth() + 1,
    day: tomorrow.getUTCDate(),
    hour: 0,
  };
}

function compareDates(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function clipAndMerge(
  intervals: readonly BusyInterval[],
  from: Date,
  to: Date,
): BusyInterval[] {
  const clipped = intervals
    .map((interval) => ({
      start: interval.start.getTime() < from.getTime() ? from : interval.start,
      end: interval.end.getTime() > to.getTime() ? to : interval.end,
    }))
    .filter((interval) => interval.end.getTime() > interval.start.getTime())
    .filter(
      (interval) =>
        interval.end.getTime() > from.getTime() &&
        interval.start.getTime() < to.getTime(),
    )
    .sort((left, right) => compareDates(left.start, right.start));

  const merged: BusyInterval[] = [];
  for (const interval of clipped) {
    const last = merged.at(-1);
    if (last === undefined || interval.start.getTime() > last.end.getTime()) {
      merged.push(interval);
      continue;
    }
    if (interval.end.getTime() > last.end.getTime()) {
      merged[merged.length - 1] = { start: last.start, end: interval.end };
    }
  }
  return merged;
}

function complement(
  busy: readonly BusyInterval[],
  from: Date,
  to: Date,
): Gap[] {
  const free: Gap[] = [];
  let cursor = from;
  for (const interval of busy) {
    if (interval.start.getTime() > cursor.getTime()) {
      free.push({ start: cursor, end: interval.start });
    }
    if (interval.end.getTime() > cursor.getTime()) {
      cursor = interval.end;
    }
  }
  if (cursor.getTime() < to.getTime()) {
    free.push({ start: cursor, end: to });
  }
  return free;
}

function allowedLocalWindows(
  from: Date,
  to: Date,
  timeZone: string,
  options: GapOptions,
): Gap[] {
  let local = formatParts(from, timeZone);
  const final = formatParts(to, timeZone);
  const windows: Gap[] = [];
  while (
    local.year < final.year ||
    (local.year === final.year && local.month < final.month) ||
    (local.year === final.year &&
      local.month === final.month &&
      local.day <= final.day)
  ) {
    const start = localTimeToUtc(
      local.year,
      local.month,
      local.day,
      options.earliestHourLocal,
      timeZone,
    );
    const end =
      options.latestHourLocal === 24
        ? localTimeToUtc(
            localMidnightAfter(local).year,
            localMidnightAfter(local).month,
            localMidnightAfter(local).day,
            0,
            timeZone,
          )
        : localTimeToUtc(
            local.year,
            local.month,
            local.day,
            options.latestHourLocal,
            timeZone,
          );
    if (end.getTime() > start.getTime()) {
      windows.push({ start, end });
    }
    local = localMidnightAfter(local);
  }
  return windows;
}

function intersect(left: readonly Gap[], right: readonly Gap[]): Gap[] {
  const result: Gap[] = [];
  for (const leftInterval of left) {
    for (const rightInterval of right) {
      const start =
        leftInterval.start.getTime() > rightInterval.start.getTime()
          ? leftInterval.start
          : rightInterval.start;
      const end =
        leftInterval.end.getTime() < rightInterval.end.getTime()
          ? leftInterval.end
          : rightInterval.end;
      if (end.getTime() > start.getTime()) {
        result.push({ start, end });
      }
    }
  }
  return result.sort((first, second) =>
    compareDates(first.start, second.start),
  );
}

function applyCooldown(
  gaps: readonly Gap[],
  deliveries: readonly Date[],
  cooldownMinutes: number,
): Gap[] {
  if (deliveries.length === 0 || cooldownMinutes === 0) {
    return [...gaps];
  }
  const cooldown = cooldownMinutes * 60_000;
  return gaps.flatMap((gap) => {
    let blocker: Date | undefined;
    for (const delivery of deliveries) {
      if (
        delivery.getTime() < gap.end.getTime() &&
        delivery.getTime() + cooldown > gap.start.getTime() &&
        (blocker === undefined || delivery.getTime() > blocker.getTime())
      ) {
        blocker = delivery;
      }
    }
    if (blocker === undefined) {
      return [gap];
    }
    const start = new Date(
      Math.max(gap.start.getTime(), blocker.getTime() + cooldown),
    );
    return start.getTime() < gap.end.getTime() ? [{ start, end: gap.end }] : [];
  });
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

export function detectGaps(
  busyIntervals: readonly BusyInterval[],
  from: Date,
  to: Date,
  recentDeliveries: readonly Date[],
  timeZone: string,
  options: GapOptions = DEFAULT_GAP_OPTIONS,
  now = new Date(),
): Gap[] {
  if (to.getTime() <= from.getTime()) {
    return [];
  }
  const merged = clipAndMerge(busyIntervals, from, to);
  const afterNow = complement(merged, from, to)
    .map((gap) => ({
      start: gap.start.getTime() < now.getTime() ? now : gap.start,
      end: gap.end,
    }))
    .filter((gap) => gap.end.getTime() > gap.start.getTime());
  const allowed = allowedLocalWindows(from, to, timeZone, options);
  const cooldownApplied = applyCooldown(
    intersect(afterNow, allowed),
    recentDeliveries,
    options.cooldownMinutes,
  );
  const minDuration = options.minGapMinutes * 60_000;
  const maxDuration = options.maxGapMinutes * 60_000;
  return cooldownApplied.flatMap((gap) => {
    const duration = gap.end.getTime() - gap.start.getTime();
    if (duration < minDuration) {
      return [];
    }
    return [
      {
        start: gap.start,
        end: new Date(gap.start.getTime() + Math.min(duration, maxDuration)),
      },
    ];
  });
}
