import { Test, TestingModule } from '@nestjs/testing';
import { EmailTemplateService } from './email-template.service';
import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// Mock the fs module so we don't hit the real disk
jest.mock('fs');

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailTemplateService],
    }).compile();

    service = module.get<EmailTemplateService>(EmailTemplateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('render', () => {
    it('should successfully render a template with context', () => {
      const templateName = 'Winner';
      const context = { username: 'Clinton' };
      const mockHbsContent = 'Hello {{username}}';

      // Mock fs to say the file exists and return our fake string
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(mockHbsContent);

      const result = service.render(templateName, context);

      expect(result).toBe('Hello Clinton');
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if template does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(() => {
        service.render('non-existent', {});
      }).toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException if handlebars fails to compile', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Hello {{username');

      expect(() => {
        service.render('broken-template', { username: 'Clinton' });
      }).toThrow(InternalServerErrorException);
    });
  });
});