import { createClient } from "@supabase/supabase-js";
import { Request, Response } from "express";
import { config } from "../../config";
import { cache } from "../services";

export interface DailyVolume {
  day: string;
  buy_usd: number;
  sell_usd: number;
  total_usd: number;
}

export interface RawDailyVolumeRow {
  day: string;
  buy_usd: string;
  sell_usd: string;
  total_usd: string;
}

export interface RawMonthlyVolumeRow {
  month: string;
  buy_usd: number;
  sell_usd: number;
  total_usd: number;
}

export interface MonthlyVolume extends RawMonthlyVolumeRow {}
export interface WeeklyVolume {
  week: string;
  startDate: string;
  endDate: string;
  volume: number;
}

export interface VolumeData {
  monthly: MonthlyVolume[];
  weekly: WeeklyVolume[];
  daily: DailyVolume[];
  selectedMonth: string;
}

const supabase = createClient(config.supabaseUrl!, config.supabaseKey!);

function getNextMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-").map(Number);
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  return `${nextYear}-${nextMonth.toString().padStart(2, "0")}`;
}

async function getMonthlyVolumes(): Promise<MonthlyVolume[]> {
  const cacheKey = `monthly`;
  const cached = cache.get<MonthlyVolume[]>(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.rpc("get_monthly_volumes");
    console.log("DEBUG - RPC data for monthly: ", data);
    if (error) throw error;

    const rawData = data as RawMonthlyVolumeRow[];

    const dataMap = new Map<string, MonthlyVolume>();
    for (const row of rawData) {
      dataMap.set(row.month, {
        buy_usd: row.buy_usd,
        month: row.month,
        sell_usd: row.sell_usd,
        total_usd: row.total_usd
      });
    }

    const minMonth = rawData[0].month;

    const currentDate = new Date();
    const currentMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, "0")}`;

    const volumes: MonthlyVolume[] = [];
    let iterMonth = minMonth;

    while (iterMonth <= currentMonth) {
      const existing = dataMap.get(iterMonth);
      if (existing) {
        volumes.push(existing);
      } else {
        volumes.push({
          buy_usd: 0,
          month: iterMonth,
          sell_usd: 0,
          total_usd: 0
        });
      }
      iterMonth = getNextMonth(iterMonth);
    }

    // TTL 5 minutes since current year includes current month
    cache.set(cacheKey, volumes, 5 * 60);
    return volumes;
  } catch (rpcError: any) {
    throw new Error("Could not calculate monthly volumes: " + rpcError.message);
  }
}

async function getDailyVolumes(startDate: string, endDate: string): Promise<DailyVolume[]> {
  const cacheKey = `daily-${startDate}-${endDate}`;
  const cached = cache.get<DailyVolume[]>(cacheKey);

  //if (cached) return cached;

  try {
    const { data, error } = await supabase.rpc("get_daily_volumes", { end_date: endDate, start_date: startDate });
    console.log("DEBUG - RPC data: ", data);
    if (error) throw error;

    // Create a map of existing data
    const dataMap = new Map<string, DailyVolume>();
    (data as RawDailyVolumeRow[]).forEach(row => {
      dataMap.set(row.day, {
        buy_usd: parseFloat(row.buy_usd),
        day: row.day,
        sell_usd: parseFloat(row.sell_usd),
        total_usd: parseFloat(row.total_usd)
      });
    });

    const start = new Date(startDate);
    const end = new Date(endDate);
    const volumes: DailyVolume[] = [];
    const current = new Date(start);
    while (current <= end) {
      const dayStr = current.toISOString().slice(0, 10);
      const existing = dataMap.get(dayStr);
      if (existing) {
        volumes.push(existing);
      } else {
        volumes.push({
          buy_usd: 0,
          day: dayStr,
          sell_usd: 0,
          total_usd: 0
        });
      }
      current.setDate(current.getDate() + 1);
    }

    cache.set(cacheKey, volumes, 5 * 60);
    return volumes;
  } catch (rpcError: any) {
    throw new Error("Could not calculate daily volumes: " + rpcError.message);
  }
}

function aggregateWeekly(daily: DailyVolume[], startDate: string, endDate: string): WeeklyVolume[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const numWeeks = Math.ceil(totalDays / 7);

  const weeks: { [key: string]: { volume: number; startDate: Date; endDate: Date } } = {};
  for (let i = 1; i <= numWeeks; i++) {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + (i - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    if (weekEnd > end) {
      weekEnd.setTime(end.getTime());
    }
    weeks[`Week ${i}`] = {
      endDate: weekEnd,
      startDate: weekStart,
      volume: 0
    };
  }

  // Aggregate daily volumes into weeks
  daily.forEach(d => {
    const dayDate = new Date(d.day);
    const daysDiff = Math.floor((dayDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const weekNum = Math.floor(daysDiff / 7) + 1;
    const weekKey = `Week ${weekNum}`;
    if (weeks[weekKey] !== undefined) {
      weeks[weekKey].volume += d.total_usd;
    }
  });

  return Object.entries(weeks)
    .sort((a, b) => {
      const weekA = parseInt(a[0].replace("Week ", ""));
      const weekB = parseInt(b[0].replace("Week ", ""));
      return weekA - weekB;
    })
    .map(([week, data]) => {
      const startMonth = data.startDate.toLocaleString("en-US", { month: "short" });
      const startDay = data.startDate.getDate();
      const endMonth = data.endDate.toLocaleString("en-US", { month: "short" });
      const endDay = data.endDate.getDate();
      const weekLabel = `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
      return {
        endDate: data.endDate.toISOString().slice(0, 10),
        startDate: data.startDate.toISOString().slice(0, 10),
        volume: data.volume,
        week: weekLabel
      };
    });
}

async function getWeeklyVolumes(startDate: string, endDate: string): Promise<WeeklyVolume[]> {
  const cacheKey = `weekly-${startDate}-${endDate}`;
  const cached = cache.get<WeeklyVolume[]>(cacheKey);
  if (cached) return cached;

  const daily = await getDailyVolumes(startDate, endDate);
  const weekly = aggregateWeekly(daily, startDate, endDate);
  cache.set(cacheKey, weekly, 5 * 60);
  return weekly;
}

export const getVolumes = async (req: Request, res: Response) => {
  try {
    const { month, start, end } = req.query;
    let startDate: string;
    let endDate: string;
    let selectedMonth: string | undefined;

    if (start && end) {
      startDate = start as string;
      endDate = end as string;
    } else {
      selectedMonth = (month as string) || new Date().toISOString().slice(0, 7); // YYYY-MM
      startDate = `${selectedMonth}-01`;
      const monthDate = new Date(selectedMonth + "-01");
      monthDate.setMonth(monthDate.getMonth() + 1);
      monthDate.setDate(0);
      endDate = monthDate.toISOString().slice(0, 10);
    }

    console.log("Fetching volumes for period:", startDate, "to", endDate);
    const [monthly, weekly, daily] = await Promise.all([
      getMonthlyVolumes(),
      getWeeklyVolumes(startDate, endDate),
      getDailyVolumes(startDate, endDate)
    ]);

    res.json({
      daily,
      endDate,
      monthly,
      selectedMonth,
      startDate,
      weekly
    });
  } catch (error) {
    console.error("Error fetching volumes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
