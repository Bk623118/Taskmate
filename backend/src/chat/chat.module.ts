import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatNormalizer } from './chat-normalizer.js';
import { TasksModule } from '../tasks/tasks.module.js';

@Module({
  imports: [TasksModule],
  controllers: [ChatController],
  providers: [ChatService, ChatNormalizer],
})
export class ChatModule {}
