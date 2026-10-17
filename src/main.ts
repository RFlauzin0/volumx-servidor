import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { requestOrigin } from './lib/localStorage';


async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // bodyParser: false — we register our own parsers below with a 50mb limit.
  // If Nest registers its default parser (100kb) first, large base64 images
  // are rejected with 413 before reaching our custom parser.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Increase body size limit for base64 image payloads
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  app.enableCors({ origin: '*' });

  // Behind Caddy the real scheme/host arrive in X-Forwarded-* headers.
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', true);
  // Remember each request's own address, for building file links.
  app.use((req: any, _res: any, next: any) => {
    const host = req.get('host');
    requestOrigin.run(host ? `${req.protocol}://${host}/` : '', next);
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Liveness probe for Docker / the install script.
  app.getHttpAdapter().get('/health', (_req: any, res: any) => res.json({ ok: true }));

  // Swagger no-cache middleware
  const swaggerPath = 'api-docs';
  app.use(`/${swaggerPath}`, (req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  const config = new DocumentBuilder()
    .setTitle('VolumX API')
    .setDescription('Forest Inventory Management API - Automated volumetric calculations for Brazilian forestry')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(swaggerPath, app, document, {
    customSiteTitle: 'VolumX API',
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info { margin: 30px 0; }
      .swagger-ui .info .title { color: #2d6a4f; font-size: 2em; }
      .swagger-ui .info .description p { color: #444; font-size: 1.1em; }
      .swagger-ui .opblock-tag { color: #2d6a4f; font-size: 1.1em; border-bottom: 1px solid #e8e8e8; }
      .swagger-ui .opblock.opblock-post { border-color: #2d6a4f; background: rgba(45,106,79,0.05); }
      .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #2d6a4f; }
      .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #1b4332; }
      .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #c1121f; }
      .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: #e07a5f; }
      .swagger-ui .btn.authorize { color: #2d6a4f; border-color: #2d6a4f; }
      body { background: #fafafa; }
    `,
  });

  await app.listen(Number(process.env.PORT) || 3000, "0.0.0.0");
  const port = Number(process.env.PORT) || 3000;
  logger.log(`VolumX API running on port ${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/${swaggerPath}`);
}
bootstrap();
