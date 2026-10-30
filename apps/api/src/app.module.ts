import { Module } from '@nestjs/common';
import { QuizController, EssayController, HealthController } from './controllers';
import { EssayService, QuizService } from './services';
import { GeminiProvider } from './gemini.provider';
import { PrismaService } from './prisma.service';
import { HandwritingPreprocessor } from './handwriting-preprocessor';
import { EssayStorageService } from './essay-storage.service';

@Module({ controllers: [HealthController, QuizController, EssayController], providers: [QuizService, EssayService, GeminiProvider, PrismaService, HandwritingPreprocessor, EssayStorageService] })
export class AppModule {}
