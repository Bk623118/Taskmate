import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { TaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SafeUser } from '../shared/types.js';
import { ASSIGNEE_UPDATE_FORBIDDEN_MESSAGE, TASK_FORBIDDEN_MESSAGE } from './task.constants.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksService } from './tasks.service.js';

const creator: SafeUser = { id: 10, name: 'Alice', email: 'alice@test.local' };
const assignee: SafeUser = { id: 11, name: 'Rahul', email: 'rahul@test.local' };
const outsider: SafeUser = { id: 12, name: 'Priya', email: 'priya@test.local' };

const record = {
  id: 40,
  title: 'Send report',
  description: 'Weekly status report',
  dueAt: new Date('2026-11-10T12:00:00.000Z'),
  status: TaskStatus.PENDING,
  assignedById: creator.id,
  assignedToId: assignee.id,
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  updatedAt: new Date('2026-10-02T12:00:00.000Z'),
  assignedTo: assignee,
  assignedBy: creator,
};

function setup() {
  const prisma = {
    task: {
      findUnique: vi.fn().mockResolvedValue(record),
      update: vi.fn().mockResolvedValue({
        ...record,
        title: 'Updated report',
        status: TaskStatus.IN_PROGRESS,
      }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: assignee.id }) },
  };
  const service = new TasksService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('TasksService permissions', () => {
  it('lets the creator edit every task field', async () => {
    const { service, prisma } = setup();
    const result = await service.update(
      record.id,
      {
        title: 'Updated report',
        description: 'New description',
        dueAt: '2026-11-11T13:00:00.000Z',
        assignedToId: outsider.id,
        status: TaskStatus.IN_PROGRESS,
      },
      creator,
    );
    expect(result.permissions).toEqual({ canEditAll: true, canUpdateStatus: true });
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: record.id },
        data: expect.objectContaining({
          title: 'Updated report',
          description: 'New description',
          assignedToId: outsider.id,
          status: TaskStatus.IN_PROGRESS,
        }),
      }),
    );
  });

  it('lets the assignee change status', async () => {
    const { service, prisma } = setup();
    const changes = plainToInstance(UpdateTaskDto, {
      status: TaskStatus.IN_PROGRESS,
    });
    const result = await service.update(
      record.id,
      changes,
      assignee,
    );
    expect(result.permissions).toEqual({ canEditAll: false, canUpdateStatus: true });
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: TaskStatus.IN_PROGRESS } }),
    );
  });

  it.each([
    ['title', { title: 'Other title' }],
    ['description', { description: 'Other description' }],
    ['dueAt', { dueAt: '2026-11-11T13:00:00.000Z' }],
    ['assignedToId', { assignedToId: outsider.id }],
  ])('rejects an assignee change to %s', async (_field, changes) => {
    const { service, prisma } = setup();
    await expect(
      service.update(record.id, changes, assignee),
    ).rejects.toMatchObject({
      message: ASSIGNEE_UPDATE_FORBIDDEN_MESSAGE,
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('rejects a third user on both read and update', async () => {
    const { service, prisma } = setup();
    await expect(service.get(record.id, outsider)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(record.id, { status: TaskStatus.COMPLETED }, outsider),
    ).rejects.toMatchObject({ message: TASK_FORBIDDEN_MESSAGE });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('rejects an empty update', async () => {
    const { service, prisma } = setup();
    await expect(service.update(record.id, {}, creator)).rejects.toThrow(
      'At least one task field must be provided',
    );
    expect(prisma.task.findUnique).not.toHaveBeenCalled();
  });
});
