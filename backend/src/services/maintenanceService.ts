import { AppDataSource } from "../data-source";
import { MaintenanceState } from "../entities/MaintenanceState";
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
    until: s.until ? s.until.toISOString() : null,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : new Date().toISOString()
  };
}
class MaintenanceService {
  private cache: {
    at: number;
    dto: MaintenanceStateDto;
  } | null = null;
  private readonly cacheTtlMs = 1500;
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
    const row = await this.getOrCreateSingleton();
    const dto = toDto(row);
    this.cache = {
      at: now,
      dto
    };
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
    this.cache = {
      at: Date.now(),
      dto
    };
    return dto;
  }
  async disable(): Promise<MaintenanceStateDto> {
    const row = await this.getOrCreateSingleton();
    row.enabled = false;
    const saved = await this.repo().save(row);
    const dto = toDto(saved);
    this.cache = {
      at: Date.now(),
      dto
    };
    return dto;
  }
}
export const maintenanceService = new MaintenanceService();