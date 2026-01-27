import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Request, Response } from "express";
import { config } from "../../config";
import logger from "../../config/logger";
import { cache } from "../services";

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

export interface VolumeRow {
  chain: string;
  buy_usd: number;
  sell_usd: number;
  total_usd: number;
}

export interface MonthlyVolume extends VolumeRow {
  month: string;
}

export interface ChainVolume {
  chain: string;
  buy_usd: number;
  sell_usd: number;
  total_usd: number;
}

export interface DailyVolume {
  day: string;
  chains: ChainVolume[];
}

export interface MonthlyVolume {
  month: string;
  chains: ChainVolume[];
}

export interface WeeklyVolume {
  week: string;
  startDate: string;
  endDate: string;
  chains: ChainVolume[];
}

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    if (!config.supabase.url) {
      throw new Error("Missing Supabase URL in configuration.");
    }
    if (!config.supabase.anonKey) {
      throw new Error("Missing Supabase Key in configuration.");
    }
    supabaseClient = createClient(config.supabase.url, config.supabase.anonKey);
  }
  return supabaseClient;
}

const zeroVolume = (key: string, keyName: "day" | "month"): any => ({
  [keyName]: key,
  chains: []
});

async function getMonthlyVolumes(): Promise<MonthlyVolume[]> {
  const cacheKey = `monthly`;
  const cached = cache.get<MonthlyVolume[]>(cacheKey);
  if (cached) return cached;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("get_monthly_volumes_by_chain", { year_param: null });
    if (error) throw error;

    const rawData = (data as MonthlyVolume[]) || [];
    if (!rawData.length) return [];

    const dataMap = new Map(rawData.map(row => [row.month, row]));

    const [startYear, startMonth] = rawData[0].month.split("-").map(Number);
    const current = new Date(startYear, startMonth - 1, 1);
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const volumes: MonthlyVolume[] = [];

    while (current < end) {
      const monthStr = current.toISOString().slice(0, 7);
      volumes.push(dataMap.get(monthStr) || zeroVolume(monthStr, "month"));
      current.setMonth(current.getMonth() + 1);
    }

    cache.set(cacheKey, volumes, CACHE_TTL_SECONDS);
    return volumes;
  } catch (error: any) {
    throw new Error("Could not calculate monthly volumes: " + error.message);
  }
}

async function getDailyVolumes(startDate: string, endDate: string): Promise<DailyVolume[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_daily_volumes_by_chain", {
    end_date: endDate,
    start_date: startDate
  });

  if (error) throw error;

  const rawData = (data as DailyVolume[]) || [];
  const dataMap = new Map(rawData.map(row => [row.day, row]));

  const current = new Date(startDate);
  const end = new Date(endDate);
  const volumes: DailyVolume[] = [];

  while (current <= end) {
    const dayStr = current.toISOString().slice(0, 10);
    // If date is missing, return empty chains array instead of zeroed fields
    volumes.push(dataMap.get(dayStr) || { chains: [], day: dayStr });
    current.setDate(current.getDate() + 1);
  }

  return volumes;
}

function aggregateWeekly(daily: DailyVolume[]): WeeklyVolume[] {
  const weeks: WeeklyVolume[] = [];

  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    const startDay = chunk[0].day;
    const endDay = chunk[chunk.length - 1].day;

    const chainTotals = new Map<string, any>();

    chunk.forEach(day => {
      day.chains.forEach((c: any) => {
        const existing = chainTotals.get(c.chain) || { buy_usd: 0, chain: c.chain, sell_usd: 0, total_usd: 0 };
        existing.buy_usd += c.buy_usd;
        existing.sell_usd += c.sell_usd;
        existing.total_usd += c.total_usd;
        chainTotals.set(c.chain, existing);
      });
    });

    weeks.push({
      chains: Array.from(chainTotals.values()),
      endDate: endDay,
      startDate: startDay,
      week: `${startDay} to ${endDay}`
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
    logger.error("Error fetching volumes:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
