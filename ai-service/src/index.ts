import './module-resolver';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { logger } from '../../backend/src/utils/logger';

// IMPORTANT: Load env only from ai-service/.env.
// We intentionally do NOT load ../.env or ../backend/.env to avoid “external .env” surprises.
const findAIServiceRoot = (startDir: string): string | null => {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw);
        if (pkg?.name === 'studycod-ai-service') return dir;
      } catch {
        // ignore
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

const aiServiceRoot = findAIServiceRoot(__dirname) ?? process.cwd();
const envPath = path.join(aiServiceRoot, '.env');
dotenv.config({ path: fs.existsSync(envPath) ? envPath : undefined, override: false });
import { getLLMOrchestrator } from '../../backend/src/services/llm/LLMOrchestrator';
const PORT = process.env.AI_SERVICE_PORT ? parseInt(process.env.AI_SERVICE_PORT, 10) : 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const app = express();
function safePreview(value: unknown, max = 200): string {
  try {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    if (!raw) return '';
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
  } catch {
    return '[unserializable]';
  }
}
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({
  limit: '512kb'
}));
app.use(express.urlencoded({
  extended: false,
  limit: '512kb'
}));
if (!IS_PRODUCTION) {
  app.use(morgan('dev'));
}
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'StudyCod AI Service'
  });
});
app.post('/', async (req: Request, res: Response) => {
  try {
    const {
      mode,
      language,
      params
    } = req.body;
    if (!mode) {
      return res.status(400).json({
        success: false,
        error: 'Missing mode'
      });
    }
    if (!params) {
      return res.status(400).json({
        success: false,
        error: 'Missing params'
      });
    }
    const orchestrator = getLLMOrchestrator();
    let result: any;
    const parsedParams = typeof params === 'string' ? JSON.parse(params) : params;
    if (language) {
      parsedParams.userLanguage = language;
    }
    switch (mode) {
      case 'generate-task':
        result = await orchestrator.generateTaskWithAI(parsedParams);
        break;
      case 'generate-theory':
        result = await orchestrator.generateTheoryWithAI(parsedParams);
        break;
      case 'generate-quiz':
        result = await orchestrator.generateQuizWithAI(parsedParams);
        break;
      case 'generate-task-condition':
        result = await orchestrator.generateTaskCondition(parsedParams);
        logger.info('[AI Service] generateTaskCondition result', {
          hasDescription: !!result?.description,
          descriptionType: typeof result?.description,
          descriptionLength: result?.description?.length,
          fullResult: safePreview(result)
        });
        break;
      case 'generate-task-template':
        result = await orchestrator.generateTaskTemplate(parsedParams);
        break;
      case 'generate-test-data':
        result = await orchestrator.generateTestDataWithAI(parsedParams);
        break;
      case 'generate-text':
      case 'generate-json':
        {
          const {
            OpenRouterProvider
          } = await import('../../backend/src/services/llm/OpenRouterProvider');
          const openRouterProvider = new OpenRouterProvider();
          if (mode === 'generate-text') {
            const textResult = await openRouterProvider.generateText(parsedParams.prompt, parsedParams.systemPrompt, {
              language: language || 'uk',
              temperature: parsedParams.temperature,
              maxTokens: parsedParams.maxTokens,
              userId: parsedParams.userId,
              topicId: parsedParams.topicId
            });
            result = {
              content: textResult
            };
          } else {
            const jsonResult = await openRouterProvider.generateJSON(parsedParams.prompt, parsedParams.schema || {}, parsedParams.systemPrompt, {
              language: language || 'uk',
              temperature: parsedParams.temperature,
              maxTokens: parsedParams.maxTokens,
              userId: parsedParams.userId,
              topicId: parsedParams.topicId
            });
            result = {
              content: JSON.stringify(jsonResult)
            };
          }
          break;
        }
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown mode: ${mode}`
        });
    }
    logger.info('[AI Service] Sending response', {
      mode,
      hasResult: !!result,
      resultType: typeof result,
      resultKeys: result && typeof result === 'object' ? Object.keys(result) : null,
      resultPreview: result && typeof result === 'object' ? safePreview(result) : result
    });
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('[AI Service] Unified endpoint error', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'AI generation failed'
    });
  }
});
app.post('/api/v1/generate-task', async (req: Request, res: Response) => {
  try {
    const {
      params
    } = req.body;
    if (!params) {
      return res.status(400).json({
        success: false,
        error: 'Missing params'
      });
    }
    const orchestrator = getLLMOrchestrator();
    const result = await orchestrator.generateTaskWithAI(params);
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('[AI Service] generateTask error', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'AI generation failed'
    });
  }
});
app.post('/api/v1/generate-theory', async (req: Request, res: Response) => {
  try {
    const {
      params
    } = req.body;
    if (!params) {
      return res.status(400).json({
        success: false,
        error: 'Missing params'
      });
    }
    const orchestrator = getLLMOrchestrator();
    const result = await orchestrator.generateTheoryWithAI(params);
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('[AI Service] generateTheory error', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'AI generation failed'
    });
  }
});
app.post('/api/v1/generate-quiz', async (req: Request, res: Response) => {
  try {
    const {
      params
    } = req.body;
    if (!params) {
      return res.status(400).json({
        success: false,
        error: 'Missing params'
      });
    }
    const orchestrator = getLLMOrchestrator();
    const result = await orchestrator.generateQuizWithAI(params);
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('[AI Service] generateQuiz error', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'AI generation failed'
    });
  }
});
app.post('/api/v1/generate-task-condition', async (req: Request, res: Response) => {
  try {
    const {
      params
    } = req.body;
    if (!params) {
      return res.status(400).json({
        success: false,
        error: 'Missing params'
      });
    }
    const orchestrator = getLLMOrchestrator();
    const result = await orchestrator.generateTaskCondition(params);
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('[AI Service] generateTaskCondition error', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'AI generation failed'
    });
  }
});
app.post('/api/v1/generate-task-template', async (req: Request, res: Response) => {
  try {
    const {
      params
    } = req.body;
    if (!params) {
      return res.status(400).json({
        success: false,
        error: 'Missing params'
      });
    }
    const orchestrator = getLLMOrchestrator();
    const result = await orchestrator.generateTaskTemplate(params);
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('[AI Service] generateTaskTemplate error', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'AI generation failed'
    });
  }
});
app.post('/api/v1/generate-test-data', async (req: Request, res: Response) => {
  try {
    const {
      params
    } = req.body;
    if (!params) {
      return res.status(400).json({
        success: false,
        error: 'Missing params'
      });
    }
    const orchestrator = getLLMOrchestrator();
    const result = await orchestrator.generateTestDataWithAI(params);
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('[AI Service] generateTestData error', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'AI generation failed'
    });
  }
});
app.use((err: any, _req: Request, res: Response, _next: express.NextFunction) => {
  logger.error('[AI Service] Unhandled error', { err });
  res.status(500).json({
    success: false,
    error: IS_PRODUCTION ? 'Internal server error' : err.message
  });
});
app.listen(PORT, () => {
  if (!IS_PRODUCTION) {
    logger.info(`StudyCod AI Service listening on http://localhost:${PORT}`);
  }
});