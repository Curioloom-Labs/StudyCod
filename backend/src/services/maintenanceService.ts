import { AppDataSource } from "../data-source";
import { MaintenanceState } from "../entities/MaintenanceState";
import { redisKey, runWithRedis } from "./redis/sharedRedis";

const MAINTENANCE_CACHE_KEY = redisKey("maintenance", "state");
export type MaintenanceStateDto = {
  enabled: boolean;
  title: string;
  message: string;
  until: string | null;
  updatedAt: string;
};
function toDto(s: MaintenanceState): MaintenanceStateDto {
  return {
    enabled: !!s.enabled,
    title: String(s.title ?? ""),
    message: String(s.message ?? ""),
    until: s.enabled && s.until ? s.until.toISOString() : null,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : new Date().toISOString()
  };
}
class MaintenanceService {
  private cache: {
    at: number;
    dto: MaintenanceStateDto;
  } | null = null;
  private readonly cacheTtlMs = 1500;

  private setLocalCache(dto: MaintenanceStateDto): void {
    this.cache = {
      at: Date.now(),
      dto,
    };
  }

  private async getFromRedisCache(): Promise<MaintenanceStateDto | null> {
    const raw = await runWithRedis("maintenance cache get", async redis => {
      return await redis.get(MAINTENANCE_CACHE_KEY);
    });

    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw) as MaintenanceStateDto;
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.enabled !== "boolean") return null;
      if (typeof parsed.title !== "string") return null;
      if (typeof parsed.message !== "string") return null;
      if (typeof parsed.updatedAt !== "string") return null;
      if (parsed.until !== null && typeof parsed.until !== "string") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async setRedisCache(dto: MaintenanceStateDto): Promise<void> {
    await runWithRedis("maintenance cache set", async redis => {
      await redis.set(MAINTENANCE_CACHE_KEY, JSON.stringify(dto), {
        PX: this.cacheTtlMs,
      });
      return true;
    });
  }

  private repo() {
    return AppDataSource.getRepository(MaintenanceState);
  }
  private async getOrCreateSingleton(): Promise<MaintenanceState> {
    let row = await this.repo().findOne({
      where: {
        id: 1
      }
    });
    if (row) return row;
    row = this.repo().create({
      id: 1,
      enabled: false,
      title: "Технічне обслуговування",
      message: "Ми оновлюємо платформу.",
      until: null
    });
    return await this.repo().save(row);
  }
  async getStateCached(): Promise<MaintenanceStateDto> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.cacheTtlMs) return this.cache.dto;

    const redisCached = await this.getFromRedisCache();
    if (redisCached) {
      this.setLocalCache(redisCached);
      return redisCached;
    }

    const row = await this.getOrCreateSingleton();
    const dto = toDto(row);
    this.cache = {
      at: now,
      dto,
    };
    await this.setRedisCache(dto);
    return dto;
  }
  async getState(): Promise<MaintenanceStateDto> {
    const row = await this.getOrCreateSingleton();
    return toDto(row);
  }
  async enable(params: {
    title: string;
    message: string;
    until: Date | null;
  }): Promise<MaintenanceStateDto> {
    const row = await this.getOrCreateSingleton();
    row.enabled = true;
    row.title = params.title;
    row.message = params.message;
    row.until = params.until;
    const saved = await this.repo().save(row);
    const dto = toDto(saved);
    this.setLocalCache(dto);
    await this.setRedisCache(dto);
    return dto;
  }
  async disable(): Promise<MaintenanceStateDto> {
    const row = await this.getOrCreateSingleton();
    row.enabled = false;
    row.until = null;
    const saved = await this.repo().save(row);
    const dto = toDto(saved);
    this.setLocalCache(dto);
    await this.setRedisCache(dto);
    return dto;
  }
}
export const maintenanceService = new MaintenanceService();
