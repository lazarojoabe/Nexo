import { Module } from '@nestjs/common';
import { QuizController, EssayController, HealthController } from './controllers';
import { EssayService, QuizService } from './services';
import { GeminiProvider } from './gemini.provider';
import { PrismaService } from './prisma.service';
import { HandwritingPreprocessor } from './handwriting-preprocessor';
import { EssayStorageService } from './essay-storage.service';
import { ESSAY_AI_PROVIDER } from './essay-engine/provider';
import { AuthIdentityService } from './auth-identity.service';

@Module({ controllers: [HealthController, QuizController, EssayController], providers: [QuizService, EssayService, GeminiProvider, { provide: ESSAY_AI_PROVIDER, useExisting: GeminiProvider }, PrismaService, HandwritingPreprocessor, EssayStorageService, AuthIdentityService] })
export class AppModule {}
