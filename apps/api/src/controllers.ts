import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { EssayService, QuizService } from './services';
import { PrismaService } from './prisma.service';

class StartQuizDto { @IsOptional() @IsArray() @IsString({ each: true }) questionIds?: string[]; }
class AnswerDto { @IsString() @MinLength(1) optionId!: string; }
class CreateEssayDto { @IsString() @MinLength(3) @MaxLength(300) topic!: string; }
class TextDto { @IsString() @MinLength(20) @MaxLength(8000) text!: string; }
class EvaluateDto { @IsBoolean() consent!: boolean; }
function demoUser(header?: string) { return header || 'demo-user'; }

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() get() { return { status: 'ok', mode: this.prisma.enabled ? 'configured' : 'demo' }; }
}

@ApiTags('quiz')
@Controller()
export class QuizController {
  constructor(private readonly quiz: QuizService) {}
  @Get('exams') exams() { return [{ id: 'demo-2026', year: 2026, label: 'Demonstração', source: 'Dados demonstrativos — não Inep' }]; }
  @Get('questions') questions(@Query('area') area?: string) { return this.quiz.listQuestions(area); }
  @Get('questions/:id') async question(@Param('id') id: string) { const { correctOptionId, ...question } = await this.quiz.question(id); return question; }
  @Post('quiz-sessions') start(@Body() dto: StartQuizDto) { return this.quiz.createSession(dto.questionIds); }
  @Post('quiz-sessions/:id/answers') answer(@Param('id') id: string, @Body() dto: AnswerDto, @Query('questionId') questionId: string) { return this.quiz.answer(id, questionId, dto.optionId); }
  @Get('quiz-sessions/:id/results') results(@Param('id') id: string) { return this.quiz.results(id); }
}

@ApiTags('essays')
@Controller('essays')
export class EssayController {
  constructor(private readonly essays: EssayService) {}
  @Post() create(@Headers('x-user-id') userId: string | undefined, @Body() dto: CreateEssayDto) { return this.essays.create(demoUser(userId), dto.topic); }
  @Post(':id/images') @ApiConsumes('multipart/form-data') @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024 } })) image(@Param('id') id: string, @Headers('x-user-id') userId: string | undefined, @UploadedFile() file?: Express.Multer.File) { return this.essays.addImage(id, demoUser(userId), file); }
  @Post(':id/transcribe') @HttpCode(200) transcribe(@Param('id') id: string, @Headers('x-user-id') userId: string | undefined, @Body() dto: EvaluateDto) { return this.essays.transcribe(id, demoUser(userId), dto.consent); }
  @Patch(':id/transcription') text(@Param('id') id: string, @Headers('x-user-id') userId: string | undefined, @Body() dto: TextDto) { return this.essays.setText(id, demoUser(userId), dto.text); }
  @Post(':id/evaluate') @HttpCode(200) evaluate(@Param('id') id: string, @Headers('x-user-id') userId: string | undefined, @Body() dto: EvaluateDto) { return this.essays.evaluate(id, demoUser(userId), dto.consent); }
  @Get(':id') get(@Param('id') id: string, @Headers('x-user-id') userId: string | undefined) { return this.essays.get(id, demoUser(userId)); }
  @Get(':id/evaluation') evaluation(@Param('id') id: string, @Headers('x-user-id') userId: string | undefined) { const essay = this.essays.get(id, demoUser(userId)); return essay.evaluation ?? { status: 'pending' }; }
}
