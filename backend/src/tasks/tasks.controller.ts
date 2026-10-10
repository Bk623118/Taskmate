import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { SafeUser, TaskView } from '../shared/types.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TaskQueryDto } from './dto/task-query.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksService } from './tasks.service.js';

type AuthenticatedRequest = Request & { user: SafeUser };

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: TaskQueryDto,
  ): Promise<TaskView[]> {
    return this.tasksService.list(request.user, query);
  }

  @Get(':id')
  get(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<TaskView> {
    return this.tasksService.get(id, request.user);
  }

  @Post()
  create(
    @Body() input: CreateTaskDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TaskView> {
    return this.tasksService.create(input, request.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() changes: UpdateTaskDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TaskView> {
    return this.tasksService.update(id, changes, request.user);
  }
}
