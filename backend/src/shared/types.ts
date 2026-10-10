import type { TaskStatus, User } from '@prisma/client';

export type SafeUser = Pick<User, 'id' | 'name' | 'email'>;

export interface RequestWithUser extends Request {
  user: SafeUser;
}

export interface TaskView {
  id: number;
  title: string;
  description: string;
  dueAt: string;
  status: TaskStatus;
  assignedTo: SafeUser;
  assignedBy: SafeUser;
  createdAt: string;
  updatedAt: string;
  permissions: { canEditAll: boolean; canUpdateStatus: boolean };
}
