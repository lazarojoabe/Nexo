import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { EssayService, QuizService } from './services';
import { PrismaService } from './prisma.service';
import { AuthIdentityService } from './auth-identity.service';
import { UserProfileService } from './user-profile.service';
import { RateLimitService } from './rate-limit.service';
import { AuthSignupService } from './auth-signup.service';

class StartQuizDto { @IsOptional() @IsString() examId?: string; @IsOptional() @IsString() area?: string; @IsOptional() @IsArray() @ArrayMaxSize(90) @IsString({ each: true }) questionIds?: string[]; }
class AnswerDto { @IsString() @MinLength(1) optionId!: string; }
class CreateEssayDto { @IsString() @MinLength(3) @MaxLength(300) topic!: string; }
class TextDto { @IsString() @MinLength(20) @MaxLength(8000) text!: string; }
class EvaluateDto { @IsBoolean() consent!: boolean; }
class SignUpDto { @IsEmail() @MaxLength(320) email!: string; @IsString() @MinLength(10) @MaxLength(128) password!: string; }

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() get() { return { status: 'ok', mode: this.prisma.enabled ? 'configured' : 'demo' }; }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly signup: AuthSignupService, private readonly rateLimit: RateLimitService) {}

  @Post('sign-up')
  signUp(@Body() dto: SignUpDto, @Req() request: { ip?: string }) {
    this.rateLimit.consume('sign-up', request.ip ?? 'unknown', 5, 60 * 60 * 1000);
    return this.signup.signUp(dto.email, dto.password);
  }
}

@ApiTags('quiz')
@Controller()
export class QuizController {
  constructor(private readonly quiz: QuizService, private readonly identity: AuthIdentityService, private readonly profiles: UserProfileService) {}
  @Get('exams') exams() { return this.quiz.listExams(); }
  @Get('questions') questions(@Query('area') area?: string, @Query('examId') examId?: string) { return this.quiz.listQuestions(area, examId); }
  @Get('questions/:id') async question(@Param('id') id: string) { const { correctOptionId, ...question } = await this.quiz.question(id); return question; }
  @Get('dashboard') async dashboard(@Headers('authorization') authorization: string | undefined) { return this.quiz.dashboard(await this.userId(authorization)); }
  @Get('quiz-history') async history(@Headers('authorization') authorization: string | undefined) { return this.quiz.history(await this.userId(authorization)); }
  @Post('quiz-sessions') async start(@Headers('authorization') authorization: string | undefined, @Body() dto: StartQuizDto) { return this.quiz.createSession(dto.questionIds, dto.examId, await this.userId(authorization), dto.area); }
  @Get('quiz-sessions/:id') async session(@Param('id') id: string, @Headers('authorization') authorization: string | undefined) { return this.quiz.session(id, await this.userId(authorization)); }
  @Post('quiz-sessions/:id/answers') async answer(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Body() dto: AnswerDto, @Query('questionId') questionId: string) { return this.quiz.answer(id, questionId, dto.optionId, await this.userId(authorization)); }
  @Get('quiz-sessions/:id/results') async results(@Param('id') id: string, @Headers('authorization') authorization: string | undefined) { return this.quiz.results(id, await this.userId(authorization)); }

  private async userId(authorization?: string) {
    const user = this.identity.identity(authorization);
    await this.profiles.ensure(user);
    return user.id;
  }
}

@ApiTags('essays')
@Controller('essays')
export class EssayController {
  constructor(private readonly essays: EssayService, private readonly identity: AuthIdentityService, private readonly profiles: UserProfileService, private readonly rateLimit: RateLimitService) {}
  @Post() async create(@Headers('authorization') authorization: string | undefined, @Body() dto: CreateEssayDto) { return this.essays.create(await this.userId(authorization), dto.topic); }
  @Get() async history(@Headers('authorization') authorization: string | undefined) { return this.essays.history(await this.userId(authorization)); }
  @Post(':id/images') @ApiConsumes('multipart/form-data') @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } })) async image(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @UploadedFile() file?: Express.Multer.File) { const userId = await this.userId(authorization); this.rateLimit.consume('essay-upload', userId, 10, 10 * 60 * 1000); return this.essays.addImage(id, userId, file); }
  @Post(':id/transcribe') @HttpCode(200) async transcribe(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Body() dto: EvaluateDto) { const userId = await this.userId(authorization); this.rateLimit.consume('essay-transcribe', userId, 6, 10 * 60 * 1000); return this.essays.transcribe(id, userId, dto.consent); }
  @Patch(':id/transcription') async text(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Body() dto: TextDto) { return this.essays.setText(id, await this.userId(authorization), dto.text); }
  @Post(':id/evaluate') @HttpCode(200) async evaluate(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Body() dto: EvaluateDto) { const userId = await this.userId(authorization); this.rateLimit.consume('essay-evaluate', userId, 6, 10 * 60 * 1000); return this.essays.evaluate(id, userId, dto.consent); }
  @Get(':id') async get(@Param('id') id: string, @Headers('authorization') authorization: string | undefined) { return this.essays.get(id, await this.userId(authorization)); }
  @Get(':id/evaluation') async evaluation(@Param('id') id: string, @Headers('authorization') authorization: string | undefined) { return this.essays.evaluation(id, await this.userId(authorization)); }

  private async userId(authorization?: string) {
    const user = this.identity.identity(authorization);
    await this.profiles.ensure(user);
    return user.id;
  }
}
