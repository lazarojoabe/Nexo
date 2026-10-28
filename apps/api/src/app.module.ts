import { Module } from '@nestjs/common';
import { QuizController, EssayController, HealthController } from './controllers';
import { EssayService, QuizService } from './services';
import { GeminiProvider } from './gemini.provider';

@Module({ controllers: [HealthController, QuizController, EssayController], providers: [QuizService, EssayService, GeminiProvider] })
export class AppModule {}
