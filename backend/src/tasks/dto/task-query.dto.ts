import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsString, Min, ValidateIf } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class TaskQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  q?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['assigned_to_me', 'assigned_by_me', 'all'])
  scope?: 'assigned_to_me' | 'assigned_by_me' | 'all';

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id?: number;
}
