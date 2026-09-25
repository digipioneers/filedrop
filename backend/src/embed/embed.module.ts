import { Module } from '@nestjs/common';
import { EmbedController } from './embed.controller';

@Module({ controllers: [EmbedController] })
export class EmbedModule {}
