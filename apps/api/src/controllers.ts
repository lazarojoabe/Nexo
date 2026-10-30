import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { EssayService, QuizService } from './services';
import { PrismaService } from './prisma.service';
import { AuthIdentityService } from './auth-identity.service';

class StartQuizDto { @IsOptional() @IsString() examId?: string; @IsOptional() @IsString() area?: string; @IsOptional() @IsArray() @ArrayMaxSize(90) @IsString({ each: true }) questionIds?: string[]; }
class AnswerDto { @IsString() @MinLength(1) optionId!: string; }
class CreateEssayDto { @IsString() @MinLength(3) @MaxLength(300) topic!: string; }
class TextDto { @IsString() @MinLength(20) @MaxLength(8000) text!: string; }
class EvaluateDto { @IsBoolean() consent!: boolean; }

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() get() { return { status: 'ok', mode: this.prisma.enabled ? 'configured' : 'demo' }; }
}

@ApiTags('quiz')
@Controller()
export class QuizController {
  constructor(private readonly quiz: QuizService, private readonly identity: AuthIdentityService) {}
  @Get('exams') exams() { return this.quiz.listExams(); }
  @Get('questions') questions(@Query('area') area?: string, @Query('examId') examId?: string) { return this.quiz.listQuestions(area, examId); }
  @Get('questions/:id') async question(@Param('id') id: string) { const { correctOptionId, ...question } = await this.quiz.question(id); return question; }
  @Get('dashboard') dashboard(@Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined) { return this.quiz.dashboard(this.identity.userId(authorization, demoUserId)); }
  @Post('quiz-sessions') start(@Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined, @Body() dto: StartQuizDto) { return this.quiz.createSession(dto.questionIds, dto.examId, this.identity.userId(authorization, demoUserId), dto.area); }
  @Get('quiz-sessions/:id') session(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined) { return this.quiz.session(id, this.identity.userId(authorization, demoUserId)); }
  @Post('quiz-sessions/:id/answers') answer(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined, @Body() dto: AnswerDto, @Query('questionId') questionId: string) { return this.quiz.answer(id, questionId, dto.optionId, this.identity.userId(authorization, demoUserId)); }
  @Get('quiz-sessions/:id/results') results(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined) { return this.quiz.results(id, this.identity.userId(authorization, demoUserId)); }
}

@ApiTags('essays')
@Controller('essays')
export class EssayController {
  constructor(private readonly essays: EssayService, private readonly identity: AuthIdentityService) {}
  @Post() create(@Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined, @Body() dto: CreateEssayDto) { return this.essays.create(this.identity.userId(authorization, demoUserId), dto.topic); }
  @Get() history(@Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined) { return this.essays.history(this.identity.userId(authorization, demoUserId)); }
  @Post(':id/images') @ApiConsumes('multipart/form-data') @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024 } })) image(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined, @UploadedFile() file?: Express.Multer.File) { return this.essays.addImage(id, this.identity.userId(authorization, demoUserId), file); }
  @Post(':id/transcribe') @HttpCode(200) transcribe(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined, @Body() dto: EvaluateDto) { return this.essays.transcribe(id, this.identity.userId(authorization, demoUserId), dto.consent); }
  @Patch(':id/transcription') text(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined, @Body() dto: TextDto) { return this.essays.setText(id, this.identity.userId(authorization, demoUserId), dto.text); }
  @Post(':id/evaluate') @HttpCode(200) evaluate(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined, @Body() dto: EvaluateDto) { return this.essays.evaluate(id, this.identity.userId(authorization, demoUserId), dto.consent); }
  @Get(':id') get(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined) { return this.essays.get(id, this.identity.userId(authorization, demoUserId)); }
  @Get(':id/evaluation') evaluation(@Param('id') id: string, @Headers('authorization') authorization: string | undefined, @Headers('x-user-id') demoUserId: string | undefined) { return this.essays.evaluation(id, this.identity.userId(authorization, demoUserId)); }
}
