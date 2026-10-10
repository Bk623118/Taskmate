import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';

process.env.JWT_SECRET ??= 'dedicated-e2e-secret-at-least-16';

const databaseUrl = process.env.DATABASE_URL;
const databaseName = databaseUrl
  ? decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//u, ''))
  : '';
const enabled = Boolean(databaseUrl && /test/iu.test(databaseName));

describe.skipIf(!enabled)('task permission API (dedicated test database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aliceCookie: string;
  let rahulCookie: string;
  let taskId: number;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'Test@1234';
  const emails = [
    `alice-${suffix}@test.local`,
    `rahul-${suffix}@test.local`,
    `priya-${suffix}@test.local`,
  ];

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const alice = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Alice Test', email: emails[0], password })
      .expect(201);
    const rahul = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Rahul Test', email: emails[1], password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Priya Test', email: emails[2], password })
      .expect(201);
    aliceCookie = alice.headers['set-cookie'][0].split(';')[0];
    rahulCookie = rahul.headers['set-cookie'][0].split(';')[0];

    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const assignee = users.find((user) => user.email === emails[1]);
    if (!assignee) throw new Error('Test assignee was not created.');
    const created = await request(app.getHttpServer())
      .post('/tasks')
      .set('Cookie', aliceCookie)
      .send({
        title: 'E2E permission task',
        description: 'Permission checks',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        assignedToId: assignee.id,
      })
      .expect(201);
    taskId = created.body.id as number;
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      const ids = users.map((user) => user.id);
      if (ids.length) {
        await prisma.task.deleteMany({
          where: { OR: [{ assignedById: { in: ids } }, { assignedToId: { in: ids } }] },
        });
        await prisma.chatState.deleteMany({ where: { userId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    }
    if (app) await app.close();
  });

  it('allows the creator to update all task fields', async () => {
    const result = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Cookie', aliceCookie)
      .send({
        title: 'Creator updated title',
        description: 'Creator updated description',
        dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      })
      .expect(200);
    expect(result.body.title).toBe('Creator updated title');
    expect(JSON.stringify(result.body)).not.toContain('password');
  });

  it.each([
    ['title', { title: 'Denied title' }],
    ['description', { description: 'Denied description' }],
    ['dueAt', { dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }],
    ['assignedToId', { assignedToId: 1 }],
  ])('denies an assignee edit to %s', async (_field, body) => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Cookie', rahulCookie)
      .send(body)
      .expect(403);
  });

  it('allows an assignee to change status', async () => {
    const result = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Cookie', rahulCookie)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(result.body.status).toBe('IN_PROGRESS');
  });

  it('denies an unrelated user on GET and PATCH', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emails[2], password })
      .expect(201);
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer()).get(`/tasks/${taskId}`).set('Cookie', cookie).expect(403);
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Cookie', cookie)
      .send({ status: 'COMPLETED' })
      .expect(403);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/tasks').expect(401);
  });

  it('rejects a client-supplied creator id', async () => {
    await request(app.getHttpServer())
      .post('/tasks')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Unsafe task',
        description: '',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        assignedById: 2,
      })
      .expect(400);
  });

  it('never returns password hashes from auth, users, or tasks', async () => {
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', aliceCookie)
      .expect(200);
    const userList = await request(app.getHttpServer())
      .get('/users')
      .set('Cookie', aliceCookie)
      .expect(200);
    const taskResponse = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Cookie', aliceCookie)
      .expect(200);
    for (const body of [me.body, userList.body, taskResponse.body]) {
      expect(JSON.stringify(body)).not.toMatch(/\$2[aby]\$/u);
    }
  });
});
