import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { SafeUser, TaskView } from '../shared/types.js';
import { ChatMessageDto } from './dto/chat-message.dto.js';
import { ChatService } from './chat.service.js';

type AuthenticatedRequest = Request & { user: SafeUser };
type ChatLanguage = 'en' | 'hi' | 'hinglish';
type ChatHistoryMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  language: ChatLanguage;
  tasks: TaskView[];
  createdAt: string;
  quickReplies?: { label: string; value: string }[];
};
type ChatConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('history')
  getHistory(
    @Query('conversationId') conversationId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    conversationId: string | null;
    conversations: ChatConversationSummary[];
    messages: ChatHistoryMessage[];
  }> {
    return this.chatService.getHistory(request.user, conversationId);
  }

  @Post('conversations')
  startConversation(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ conversationId: string }> {
    return this.chatService.startConversation(request.user);
  }

  @Delete('history')
  clearHistory(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ ok: true }> {
    return this.chatService.clearHistory(request.user);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  handle(
    @Body() input: ChatMessageDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    reply: string;
    tasks: TaskView[];
    language: ChatLanguage;
    quickReplies?: { label: string; value: string }[];
  }> {
    return this.chatService.handle(
      request.user,
      input.message,
      input.language,
      input.conversationId,
    );
  }
}
