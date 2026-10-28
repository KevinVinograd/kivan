/** Edge validation (Zod) + DTOs for the Service catalog module. */
import { z } from 'zod';

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export interface ServiceDto {
  id: string;
  name: string;
  createdAt: string;
}

interface ServiceRecord {
  id: string;
  name: string;
  createdAt: Date;
}

export function toServiceDto(r: ServiceRecord): ServiceDto {
  return { id: r.id, name: r.name, createdAt: r.createdAt.toISOString() };
}
