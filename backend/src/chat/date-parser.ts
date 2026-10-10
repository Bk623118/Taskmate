export interface ParsedDateTime {
  date?: string;
  time?: string;
  leftover: string;
}

interface ParseDateTimeOptions {
  bareNumberAsDayOfMonth?: boolean;
}

const monthNames: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3,
  april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

const weekdays: Record<string, number> = {
  sunday: 0, sun: 0, ravivar: 0, रविवार: 0,
  monday: 1, mon: 1, somvar: 1, somvaar: 1, सोमवार: 1,
  tuesday: 2, tue: 2, mangalvar: 2, mangalvaar: 2, मंगलवार: 2,
  wednesday: 3, wed: 3, budhvar: 3, budhwaar: 3, बुधवार: 3,
  thursday: 4, thu: 4, guruwar: 4, guruvaar: 4, गुरुवार: 4, बृहस्पतिवार: 4,
  friday: 5, fri: 5, shukravar: 5, shukravaar: 5, शुक्रवार: 5,
  saturday: 6, sat: 6, shanivar: 6, shanivaar: 6, शनिवार: 6,
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function plusDays(now: Date, days: number): Date {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() + days);
  return date;
}

function cleanLeftover(text: string): string {
  return text
    .replace(/[,:;.!?]+/g, ' ')
    .replace(/\b(?:by|on|at|due|tak|ko|ka|ki|ke|mein|me|par|baje)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseDateTime(
  input: string,
  now: Date,
  options: ParseDateTimeOptions = {},
): ParsedDateTime {
  let leftover = input;
  let parsedDate: Date | undefined;
  let time: string | undefined;

  const yyyyMmDd = leftover.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/u);
  if (yyyyMmDd) {
    parsedDate = validDate(Number(yyyyMmDd[1]), Number(yyyyMmDd[2]) - 1, Number(yyyyMmDd[3])) ?? undefined;
    leftover = leftover.replace(yyyyMmDd[0], ' ');
  }

  if (!parsedDate) {
    const numericDate = leftover.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/u);
    if (numericDate) {
      let year = numericDate[3] ? Number(numericDate[3]) : now.getFullYear();
      let date = validDate(year, Number(numericDate[2]) - 1, Number(numericDate[1]));
      if (!numericDate[3] && date && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        year += 1;
        date = validDate(year, Number(numericDate[2]) - 1, Number(numericDate[1]));
      }
      parsedDate = date ?? undefined;
      leftover = leftover.replace(numericDate[0], ' ');
    }
  }

  if (!parsedDate) {
    const dayMonth = leftover.match(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/iu,
    );
    const monthDay = leftover.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/iu,
    );
    const dateMatch = dayMonth ?? monthDay;
    if (dateMatch) {
      const day = Number(dayMonth ? dateMatch[1] : dateMatch[2]);
      const month = monthNames[(dayMonth ? dateMatch[2] : dateMatch[1]).toLowerCase()];
      let year = Number(dayMonth ? dateMatch[3] : dateMatch[3]) || now.getFullYear();
      let date = validDate(year, month, day);
      if (!dateMatch[3] && date && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        year += 1;
        date = validDate(year, month, day);
      }
      parsedDate = date ?? undefined;
      leftover = leftover.replace(dateMatch[0], ' ');
    }
  }

  if (!parsedDate) {
    const bareDay = options.bareNumberAsDayOfMonth
      ? leftover.match(/^\s*(\d{1,2})(?:st|nd|rd|th)?\s*$/iu)
      : null;
    const day = Number(bareDay?.[1]);
    if (bareDay && day >= 1 && day <= 31) {
      for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
        const monthStart = new Date(
          now.getFullYear(),
          now.getMonth() + monthOffset,
          1,
        );
        const candidate = validDate(
          monthStart.getFullYear(),
          monthStart.getMonth(),
          day,
        );
        if (
          candidate &&
          candidate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
        ) {
          parsedDate = candidate;
          leftover = leftover.replace(bareDay[0], ' ');
          break;
        }
      }
    }
  }

  if (!parsedDate) {
    const weekdayMatch = leftover.match(
      /\b(?:(next|this|agle|is)\s+)?(sunday|sun|ravivar|monday|mon|somvar|somvaar|tuesday|tue|mangalvar|mangalvaar|wednesday|wed|budhvar|budhwaar|thursday|thu|guruwar|guruvaar|friday|fri|shukravar|shukravaar|saturday|sat|shanivar|shanivaar)\b/iu,
    ) ?? leftover.match(/(अगले\s*)?(रविवार|सोमवार|मंगलवार|बुधवार|गुरुवार|बृहस्पतिवार|शुक्रवार|शनिवार)/u);
    if (weekdayMatch) {
      const word = weekdayMatch[2] ?? weekdayMatch[1] ?? '';
      const target = weekdays[word.toLowerCase()];
      const difference = ((target ?? now.getDay()) - now.getDay() + 7) % 7;
      const hasThis = /^(?:this|is)\b/iu.test(weekdayMatch[1] ?? '');
      const hasAgle = /अगले/gu.test(weekdayMatch[1] ?? '');
      const days = hasThis && difference !== 0 ? difference : difference || 7;
      parsedDate = plusDays(now, days);
      if (hasAgle) parsedDate = plusDays(now, difference || 7);
      leftover = leftover.replace(weekdayMatch[0], ' ');
    }
  }

  if (!parsedDate) {
    const dayCount = leftover.match(/(?:\bin\s+)?(\d+)\s*(?:days?|din)(?:\s+baad)?/iu);
    if (dayCount) {
      parsedDate = plusDays(now, Number(dayCount[1]));
      leftover = leftover.replace(dayCount[0], ' ');
    }
  }

  if (!parsedDate) {
    const relative = leftover.match(
      /\b(?:in\s+)?(\d+)\s*(days?|din)\s*(?:baad)?\b|\b(\d+)\s*din\s*baad\b|\b(\d+)\s*(?:hours?|ghante)\s*(?:mein|me)?\b|\b(\d+)\s*(?:minutes?|mins?)\b|\bnext\s+week\b|\bparso\b|\bday after tomorrow\b|\bkal\b|\baaj\b|\btoday\b|\btomorrow\b|\btonight\b|आज|कल|परसों|आज\s*रात/giu,
    );
    if (relative) {
      const matched = relative[0].toLowerCase();
      const count = Number(relative[1] ?? relative[3] ?? relative[4] ?? relative[5] ?? 0);
      if (/hours?|ghante|minutes?|mins?/iu.test(matched)) {
        const milliseconds =
          /minutes?|mins?/iu.test(matched) ? count * 60_000 : count * 3_600_000;
        parsedDate = new Date(now.getTime() + milliseconds);
        time = `${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}`;
      } else if (count) {
        parsedDate = plusDays(now, count);
      } else if (/parso|day after tomorrow|परसों/iu.test(matched)) {
        parsedDate = plusDays(now, 2);
      } else if (/next\s+week/iu.test(matched)) {
        parsedDate = plusDays(now, 7);
      } else if (/tomorrow|kal|कल/iu.test(matched)) {
        parsedDate = plusDays(now, 1);
      } else {
        parsedDate = plusDays(now, 0);
      }
      leftover = leftover.replace(relative[0], ' ');
    }
  }

  const meridiemTime = leftover.match(
    /\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/iu,
  );
  const explicitTime = leftover.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/u);
  const markedTime = leftover.match(
    /(?:शाम|shaam|सुबह|subah|दोपहर|dopahar|रात|raat)\s*(\d{1,2})(?::([0-5]\d))?\s*(?:बजे|baje)?/iu,
  );
  const bajeTime = leftover.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(?:baje|बजे)\b/iu);
  const atTime = leftover.match(/\bat\s+(\d{1,2})(?::([0-5]\d))?\b/iu);
  const noon = leftover.match(/\bnoon\b/iu);
  const timeMatch = meridiemTime ?? explicitTime ?? markedTime ?? bajeTime ?? atTime;

  if (noon) {
    time = '12:00';
    leftover = leftover.replace(noon[0], ' ');
  } else if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] ?? 0);
    const raw = timeMatch[0].toLowerCase();
    const suffix = meridiemTime === timeMatch ? (timeMatch[3] ?? '').toLowerCase() : '';
    if (/p\.?m\.?/u.test(suffix) || /^(?:शाम|shaam|दोपहर|dopahar|रात|raat)/iu.test(raw)) {
      if (hour < 12) hour += 12;
    } else if (/a\.?m\.?/u.test(suffix) || /^(?:सुबह|subah)/iu.test(raw)) {
      if (hour === 12) hour = 0;
    } else if (!explicitTime || explicitTime !== timeMatch) {
      if (hour >= 1 && hour <= 6) hour += 12;
      else if (hour === 12) hour = 12;
    }
    if (hour <= 23) {
      time = `${pad(hour)}:${pad(minute)}`;
      leftover = leftover.replace(timeMatch[0], ' ');
    }
  }
  if (!time) {
    const bareHour = leftover.match(/^\s*(\d{1,2})\s*$/u);
    if (bareHour) {
      let hour = Number(bareHour[1]);
      if (hour >= 1 && hour <= 6) hour += 12;
      if (hour <= 23) time = `${pad(hour)}:00`;
      leftover = leftover.replace(bareHour[0], ' ');
    }
  }

  return {
    ...(parsedDate ? { date: localDate(parsedDate) } : {}),
    ...(time ? { time } : {}),
    leftover: cleanLeftover(leftover),
  };
}
