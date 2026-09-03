import { GcodeFileInfo, GcodeFileService } from '../gcode-file/gcode-file.service';
import { WorkspaceGcodeGeneratorService } from './workspace-gcode-generator.service';
import { WorkspaceSendToOperationController } from './workspace-send-to-operation.controller';

describe('WorkspaceSendToOperationController', () => {
  let generator: { generate: jest.Mock };
  let gcodeFile: { save: jest.Mock };
  let controller: WorkspaceSendToOperationController;

  beforeEach(() => {
    generator = { generate: jest.fn() };
    gcodeFile = { save: jest.fn() };
    controller = new WorkspaceSendToOperationController(
      generator as unknown as WorkspaceGcodeGeneratorService,
      gcodeFile as unknown as GcodeFileService,
    );
  });

  it('returns the validation errors and stores nothing when the workspace has errors', async () => {
    generator.generate.mockResolvedValue({
      errors: [{ code: 'MISSING_PROFILE', message: 'x', pathIds: ['a'] }],
      gcode: null,
    });

    const result = await controller.sendToOperation({ svg: '<svg/>' });

    expect(result).toEqual({
      errors: [{ code: 'MISSING_PROFILE', message: 'x', pathIds: ['a'] }],
      file: null,
    });
    expect(gcodeFile.save).not.toHaveBeenCalled();
  });

  it('stores the generated g-code as the current Operation file and returns its info', async () => {
    generator.generate.mockResolvedValue({ errors: [], gcode: 'G0 X0 Y0' });
    const fileInfo: GcodeFileInfo = { fileName: 'workspace.gcode', sizeBytes: 8, commandCount: 1 };
    gcodeFile.save.mockReturnValue(fileInfo);

    const result = await controller.sendToOperation({ svg: '<svg/>' });

    expect(gcodeFile.save).toHaveBeenCalledWith('G0 X0 Y0', 'workspace.gcode');
    expect(result).toEqual({ errors: [], file: fileInfo });
  });

  it('turns a parse failure into a BadRequestException instead of a 500', async () => {
    generator.generate.mockRejectedValue(new Error('Unreadable SVG'));

    await expect(controller.sendToOperation({ svg: 'not-svg' })).rejects.toThrow('Unreadable SVG');
  });
});
