import { getDay, getDate, getMonth, lastDayOfMonth } from "date-fns";

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, month, day);
    if (date.getMonth() !== month) break;
    if (getDay(date) === weekday) {
      count += 1;
      if (count === nth) return day;
    }
  }
  return null;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const last = getDate(lastDayOfMonth(new Date(year, month, 1)));
  for (let day = last; day >= 1; day--) {
    if (getDay(new Date(year, month, day)) === weekday) return day;
  }
  return null;
}

export function getUsHolidayName(date: Date): string | null {
  const year = date.getFullYear();
  const month = getMonth(date);
  const day = getDate(date);

  if (month === 0 && day === 1) return "New Year's Day";
  if (month === 0 && day === nthWeekdayOfMonth(year, 0, 1, 3)) return "MLK Day";
  if (month === 1 && day === nthWeekdayOfMonth(year, 1, 1, 3)) return "Presidents Day";
  if (month === 4 && day === lastWeekdayOfMonth(year, 4, 1)) return "Memorial Day";
  if (month === 5 && day === 19) return "Juneteenth";
  if (month === 6 && day === 4) return "Independence Day";
  if (month === 8 && day === nthWeekdayOfMonth(year, 8, 1, 1)) return "Labor Day";
  if (month === 9 && day === nthWeekdayOfMonth(year, 9, 1, 2)) return "Columbus Day";
  if (month === 10 && day === 11) return "Veterans Day";
  if (month === 10 && day === nthWeekdayOfMonth(year, 10, 4, 4)) return "Thanksgiving";
  if (month === 11 && day === 25) return "Christmas";

  return null;
}
