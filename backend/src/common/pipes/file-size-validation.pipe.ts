import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class FileSizeValidationPipe implements PipeTransform {
  constructor(private readonly maxSizeBytes: number) {}

  transform(file: any) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > this.maxSizeBytes) {
      const mb = (this.maxSizeBytes / 1024 / 1024).toFixed(0);
      throw new BadRequestException(`File too large. Maximum size is ${mb}MB`);
    }
    return file;
  }
}
