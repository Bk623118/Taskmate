import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SafeUser, TaskView } from '../shared/types.js';
import { ASSIGNEE_UPDATE_FORBIDDEN_MESSAGE, TASK_FORBIDDEN_MESSAGE } from './task.constants.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';
import type { TaskQueryDto } from './dto/task-query.dto.js';

const TASK_INCLUDE = {
  assignedTo: { select: { id: true, name: true, email: true } },
  assignedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TaskInclude;

type TaskRecord = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requester: SafeUser, query: TaskQueryDto = {}): Promise<TaskView[]> {
    const scope = query.scope ?? 'all';
    const where = {
      AND: [
        {
          OR: [
            { assignedById: requester.id },
            { assignedToId: requester.id },
          ],
        },
        scope === 'assigned_to_me'
          ? { assignedToId: requester.id }
          : scope === 'assigned_by_me'
            ? { assignedById: requester.id }
            : {},
        query.status ? { status: query.status } : {},
        query.id ? { id: query.id } : {},
        query.q?.trim()
          ? {
              OR: [
                { title: { contains: query.q.trim(), mode: 'insensitive' as const } },
                {
                  description: {
                    contains: query.q.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {},
      ],
    };
    const records = await this.prisma.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: { dueAt: 'asc' },
    });
    return records.map((record) => this.toTaskView(record, requester.id));
  }

  async get(id: number, requester: SafeUser): Promise<TaskView> {
    const record = await this.findTaskRecord(id);
    if (record.assignedById !== requester.id && record.assignedToId !== requester.id) {
      throw new ForbiddenException('You do not have permission to view this task');
    }
    return this.toTaskView(record, requester.id);
  }

  async create(input: CreateTaskDto, requester: SafeUser): Promise<TaskView> {
    const assignedToId = input.assignedToId ?? requester.id;
    await this.assertAssigneeExists(assignedToId);
    const record = await this.prisma.task.create({
      data: {
        title: input.title.trim(),
        description: input.description,
        dueAt: new Date(input.dueAt),
        assignedToId,
        assignedById: requester.id,
      },
      include: TASK_INCLUDE,
    });
    return this.toTaskView(record, requester.id);
  }

  async update(
    id: number,
    changes: UpdateTaskDto,
    requester: SafeUser,
  ): Promise<TaskView> {
    const providedFields = Object.entries(changes)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field);
    if (providedFields.length === 0) {
      throw new BadRequestException('At least one task field must be provided');
    }
    const record = await this.findTaskRecord(id);
    const isCreator = record.assignedById === requester.id;
    const isAssignee = record.assignedToId === requester.id;

    if (!isCreator && !isAssignee) {
      throw new ForbiddenException(TASK_FORBIDDEN_MESSAGE);
    }
    if (!isCreator && isAssignee) {
      if (providedFields.some((field) => field !== 'status')) {
        throw new ForbiddenException(ASSIGNEE_UPDATE_FORBIDDEN_MESSAGE);
      }
    }
    if (changes.assignedToId !== undefined) {
      await this.assertAssigneeExists(changes.assignedToId);
    }

    const data = {
      ...(changes.title !== undefined ? { title: changes.title.trim() } : {}),
      ...(changes.description !== undefined
        ? { description: changes.description }
        : {}),
      ...(changes.dueAt !== undefined ? { dueAt: new Date(changes.dueAt) } : {}),
      ...(changes.assignedToId !== undefined
        ? { assignedToId: changes.assignedToId }
        : {}),
      ...(changes.status !== undefined ? { status: changes.status } : {}),
    };
    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: TASK_INCLUDE,
    });
    return this.toTaskView(updated, requester.id);
  }

  private async findTaskRecord(id: number) {
    const record = await this.prisma.task.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });
    if (!record) {
      throw new NotFoundException('Task not found');
    }
    return record;
  }

  private async assertAssigneeExists(id: number): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      throw new BadRequestException('Assigned user does not exist');
    }
  }

  private toTaskView(task: TaskRecord, requesterId: number): TaskView {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt.toISOString(),
      status: task.status,
      assignedTo: this.safeUser(task.assignedTo),
      assignedBy: this.safeUser(task.assignedBy),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      permissions: {
        canEditAll: requesterId === task.assignedById,
        canUpdateStatus:
          requesterId === task.assignedById || requesterId === task.assignedToId,
      },
    };
  }

  private safeUser(user: SafeUser): SafeUser {
    return { id: user.id, name: user.name, email: user.email };
  }
}
