export interface ServicePickupDayInput {
  dayOfWeek: string;
  canNumber: number;
}

export interface ScheduledServiceTask {
  scheduledDate: string;
  canNumber: number;
}

export function getDayOfWeekNumber(dayOfWeek: string): number {
  const days: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const normalizedDay = dayOfWeek.toLowerCase();
  if (!(normalizedDay in days)) {
    throw new Error(`Invalid pickup day: ${dayOfWeek}`);
  }

  return days[normalizedDay];
}

export function formatDateOnlyUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseDateOnlyUtc(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function getMonthBoundsUtc(referenceDate: Date): { startOfMonth: Date; endOfMonth: Date } {
  return {
    startOfMonth: new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1)),
    endOfMonth: new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0)),
  };
}

export function generateMonthlyServiceTasks(
  pickupDays: ServicePickupDayInput[],
  referenceDate: Date,
): ScheduledServiceTask[] {
  const { startOfMonth, endOfMonth } = getMonthBoundsUtc(referenceDate);
  const tasksToInsert: ScheduledServiceTask[] = [];

  for (const pickupDay of pickupDays) {
    const targetDay = getDayOfWeekNumber(pickupDay.dayOfWeek);
    const pickupDate = new Date(startOfMonth);

    while (pickupDate.getUTCDay() !== targetDay && pickupDate <= endOfMonth) {
      pickupDate.setUTCDate(pickupDate.getUTCDate() + 1);
    }

    while (pickupDate <= endOfMonth) {
      const serviceDate = new Date(pickupDate);
      serviceDate.setUTCDate(serviceDate.getUTCDate() - 1);

      tasksToInsert.push({
        scheduledDate: formatDateOnlyUtc(serviceDate),
        canNumber: pickupDay.canNumber,
      });

      pickupDate.setUTCDate(pickupDate.getUTCDate() + 7);
    }
  }

  return tasksToInsert.sort((a, b) => {
    if (a.scheduledDate === b.scheduledDate) {
      return a.canNumber - b.canNumber;
    }

    return a.scheduledDate.localeCompare(b.scheduledDate);
  });
}
