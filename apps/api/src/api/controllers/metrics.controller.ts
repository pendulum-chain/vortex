import { createClient } from "@supabase/supabase-js";
import { Request, Response } from "express";
import { config } from "../../config";
import { cache } from "../services";

export interface VolumeRow {
  buy_usd: number;
  sell_usd: number;
  total_usd: number;
}

export interface DailyVolume extends VolumeRow {
  day: string;
}

export interface MonthlyVolume extends VolumeRow {
  month: string;
}

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

const zeroVolume = (key: string, keyName: "day" | "month"): any => ({
  [keyName]: key,
  buy_usd: 0,
  sell_usd: 0,
  total_usd: 0
});

async function getMonthlyVolumes(): Promise<MonthlyVolume[]> {
  const cacheKey = `monthly`;
  const cached = cache.get<MonthlyVolume[]>(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.rpc("get_monthly_volumes");
    if (error) throw error;

    const rawData = (data as MonthlyVolume[]) || [];
    if (!rawData.length) return [];

    const dataMap = new Map(rawData.map(row => [row.month, row]));

    const [startYear, startMonth] = rawData[0].month.split("-").map(Number);
    const current = new Date(startYear, startMonth - 1, 1);
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);

    const volumes: MonthlyVolume[] = [];

    while (current <= end) {
      const monthStr = current.toISOString().slice(0, 7);
      volumes.push(dataMap.get(monthStr) || zeroVolume(monthStr, "month"));
      current.setMonth(current.getMonth() + 1);
    }

    cache.set(cacheKey, volumes, 5 * 60);
    return volumes;
  } catch (error: any) {
    throw new Error("Could not calculate monthly volumes: " + error.message);
  }
}

async function getDailyVolumes(startDate: string, endDate: string): Promise<DailyVolume[]> {
  const cacheKey = `daily-${startDate}-${endDate}`;
  const cached = cache.get<DailyVolume[]>(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.rpc("get_daily_volumes", { end_date: endDate, start_date: startDate });
    if (error) throw error;

    const dataMap = new Map((data as DailyVolume[]).map(row => [row.day, row]));

    const current = new Date(startDate);
    const end = new Date(endDate);
    const volumes: DailyVolume[] = [];

    while (current <= end) {
      const dayStr = current.toISOString().slice(0, 10);
      volumes.push(dataMap.get(dayStr) || zeroVolume(dayStr, "day"));
      current.setDate(current.getDate() + 1);
    }

    cache.set(cacheKey, volumes, 5 * 60);
    return volumes;
  } catch (error: any) {
    throw new Error("Could not calculate daily volumes: " + error.message);
  }
}

// TODO make inclusive the last day.
function aggregateWeekly(daily: DailyVolume[]): WeeklyVolume[] {
  const weeks: WeeklyVolume[] = [];

  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    const startDay = chunk[0];
    const endDay = chunk[chunk.length - 1];

    const startDate = new Date(startDay.day);
    const endDate = new Date(endDay.day);

    const startMonth = startDate.toLocaleString("en-US", { month: "short" });
    const endMonth = endDate.toLocaleString("en-US", { month: "short" });
    const weekLabel = `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}`;

    weeks.push({
      endDate: endDay.day,
      startDate: startDay.day,
      volume: chunk.reduce((sum, d) => sum + d.total_usd, 0),
      week: weekLabel
    });
  }

  return weeks;
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
      selectedMonth = (month as string) || new Date().toISOString().slice(0, 7);
      startDate = `${selectedMonth}-01`;
      const [y, m] = selectedMonth.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      endDate = `${selectedMonth}-${lastDay.toString().padStart(2, "0")}`;
    }

    console.log("Fetching volumes for period:", startDate, "to", endDate);

    const [monthly, daily] = await Promise.all([getMonthlyVolumes(), getDailyVolumes(startDate, endDate)]);

    const weekly = aggregateWeekly(daily);

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
