import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const password = await bcrypt.hash('Test@1234', 12);
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'alice@example.com' },
      update: { name: 'Alice Sharma', password },
      create: { name: 'Alice Sharma', email: 'alice@example.com', password },
    }),
    prisma.user.upsert({
      where: { email: 'rahul@example.com' },
      update: { name: 'Rahul Verma', password },
      create: { name: 'Rahul Verma', email: 'rahul@example.com', password },
    }),
    prisma.user.upsert({
      where: { email: 'priya@example.com' },
      update: { name: 'Priya Singh', password },
      create: { name: 'Priya Singh', email: 'priya@example.com', password },
    }),
  ]);
  const [alice, rahul, priya] = users;
  if (!alice || !rahul || !priya) {
    throw new Error('Seed user creation failed.');
  }

  const sampleTasks = [
    {
      title: 'Send the weekly report',
      description: 'Collect the latest project updates and send the report.',
      dueAt: new Date(Date.now() - 86_400_000),
      status: TaskStatus.PENDING,
      assignedToId: rahul.id,
      assignedById: alice.id,
    },
    {
      title: 'Review launch checklist',
      description: 'Check launch readiness and open items.',
      dueAt: new Date(Date.now() + 86_400_000),
      status: TaskStatus.IN_PROGRESS,
      assignedToId: alice.id,
      assignedById: alice.id,
    },
    {
      title: 'Prepare design notes',
      description: 'Share the design notes with Priya.',
      dueAt: new Date(Date.now() + 2 * 86_400_000),
      status: TaskStatus.COMPLETED,
      assignedToId: priya.id,
      assignedById: alice.id,
    },
    {
      title: 'Book team room',
      description: 'Reserve the meeting room for the planning session.',
      dueAt: new Date(Date.now() + 3 * 86_400_000),
      status: TaskStatus.PENDING,
      assignedToId: priya.id,
      assignedById: rahul.id,
    },
  ];

  for (const task of sampleTasks) {
    const existing = await prisma.task.findFirst({
      where: { title: task.title, assignedById: task.assignedById },
      select: { id: true },
    });
    if (existing) {
      await prisma.task.update({ where: { id: existing.id }, data: task });
    } else {
      await prisma.task.create({ data: task });
    }
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
