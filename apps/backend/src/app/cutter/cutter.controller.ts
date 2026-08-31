import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { CutterCommunicationService, CutterPortInfo, GrblStatus } from '@webcutter/cutter-communication';

interface ConnectDto {
  path: string;
  baudRate?: number;
}

interface CommandDto {
  command: string;
}

@Controller('cutter')
export class CutterController {
  constructor(private readonly cutterCommunication: CutterCommunicationService) {}

  @Get('ports')
  listPorts(): Promise<CutterPortInfo[]> {
    return this.cutterCommunication.listAvailablePorts();
  }

  @Post('connect')
  async connect(@Body() body: ConnectDto): Promise<{ connected: boolean }> {
    if (!body?.path) {
      throw new BadRequestException('Le champ "path" est requis (ex: /dev/ttyUSB0).');
    }

    await this.cutterCommunication.connect({ path: body.path, baudRate: body.baudRate });
    return { connected: true };
  }

  @Post('disconnect')
  async disconnect(): Promise<{ connected: boolean }> {
    await this.cutterCommunication.disconnect();
    return { connected: false };
  }

  @Get('status')
  async status(): Promise<{ connected: boolean; grbl?: GrblStatus }> {
    const connected = this.cutterCommunication.isConnected();
    if (!connected) {
      return { connected };
    }

    return { connected, grbl: await this.cutterCommunication.getStatus() };
  }

  @Post('command')
  async sendCommand(@Body() body: CommandDto): Promise<{ response: string }> {
    if (!body?.command) {
      throw new BadRequestException('Le champ "command" est requis.');
    }

    return { response: await this.cutterCommunication.sendCommand(body.command) };
  }
}
