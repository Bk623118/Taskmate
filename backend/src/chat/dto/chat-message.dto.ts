import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ChatMessageDto {
  @IsString()
  @Length(1, 500)
  message!: string;

  @IsOptional()
  @IsIn(['en', 'hi', 'hinglish'])
  language?: 'en' | 'hi' | 'hinglish';

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
