import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { CutterCommunicationService, CutterPortInfo, GrblStatus } from '@webcutter/cutter-communication';
import { MachineService } from '../machine/machine.service';

interface CommandDto {
  command: string;
}

@Controller('cutter')
export class CutterController {
  constructor(
    private readonly cutterCommunication: CutterCommunicationService,
    private readonly machineService: MachineService,
  ) {}

  @Get('ports')
  listPorts(): Promise<CutterPortInfo[]> {
    return this.cutterCommunication.listAvailablePorts();
  }

  @Post('connect')
  async connect(): Promise<{ connected: boolean }> {
    const machine = await this.machineService.get();
    await this.cutterCommunication.connect({
      path: machine.serialPortPath,
      baudRate: machine.baudRate,
      dataBits: machine.dataBits as 5 | 6 | 7 | 8,
      stopBits: machine.stopBits as 1 | 1.5 | 2,
      parity: machine.parity,
    });
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
      throw new BadRequestException('The "command" field is required.');
    }

    return { response: await this.cutterCommunication.sendCommand(body.command) };
  }
}
