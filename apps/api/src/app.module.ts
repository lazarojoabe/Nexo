import { Module } from '@nestjs/common';
import { AuthController, QuizController, EssayController, HealthController } from './controllers';
import { EssayService, QuizService } from './services';
import { GeminiProvider } from './gemini.provider';
import { PrismaService } from './prisma.service';
import { HandwritingPreprocessor } from './handwriting-preprocessor';
import { EssayStorageService } from './essay-storage.service';
import { ESSAY_AI_PROVIDER } from './essay-engine/provider';
import { AuthIdentityService } from './auth-identity.service';
import { UserProfileService } from './user-profile.service';
import { RateLimitService } from './rate-limit.service';
import { AuthSignupService } from './auth-signup.service';

@Module({ controllers: [HealthController, AuthController, QuizController, EssayController], providers: [QuizService, EssayService, GeminiProvider, { provide: ESSAY_AI_PROVIDER, useExisting: GeminiProvider }, PrismaService, HandwritingPreprocessor, EssayStorageService, AuthIdentityService, UserProfileService, RateLimitService, AuthSignupService] })
export class AppModule {}
