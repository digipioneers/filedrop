import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FILEDROP_EMBED_JS_B64 } from './filedrop-embed.generated';

/**
 * Serves the standalone Filedrop widget for themes that don't support app
 * blocks. Public and cacheable. Runs the same widget as the theme app extension
 * (upload, editor, live preview and designer).
 */
@ApiTags('Embed (Public)')
@Controller('embed')
export class EmbedController {
  private readonly js = Buffer.from(FILEDROP_EMBED_JS_B64, 'base64').toString('utf8');

  @Get('widget.js')
  @ApiOperation({ summary: 'Standalone widget script for non-app-block themes' })
  serve(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(this.js);
  }
}
