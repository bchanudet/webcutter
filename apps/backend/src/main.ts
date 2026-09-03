/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';

/** Express's own default JSON body limit (100kb) is a REST-API-sized assumption that doesn't
 * hold for this app: a workspace SVG (`/workspace/check`, `/generate`, `/send-to-operation`) is
 * vector geometry, not a small JSON payload, and grows with how much a design has to show — a
 * "test pattern" grid with several legend labels (each several curvy glyph paths) already clears
 * 100kb on its own. Raised generously rather than trying to keep every generator under a tight
 * cap that has nothing to do with whether the request is actually malformed. */
const JSON_BODY_LIMIT = '20mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: true });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useWebSocketAdapter(new WsAdapter(app));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
