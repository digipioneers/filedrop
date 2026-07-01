import { IsString, IsEnum, IsBoolean, IsNumber, IsArray, IsOptional, Min, Max } from 'class-validator';
import { FieldType, AssignmentType } from '../entities/upload-field.entity';

export class CreateUploadFieldDto {
  @IsEnum(FieldType)
  fieldType: FieldType;

  @IsEnum(AssignmentType)
  @IsOptional()
  assignmentType?: AssignmentType;

  @IsArray()
  @IsOptional()
  assignmentIds?: string[];

  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  helpText?: string;

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsString()
  @IsOptional()
  buttonText?: string;

  @IsNumber()
  @IsOptional()
  @Min(0.1)
  maxFileSizeMb?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minFileSizeMb?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  maxFiles?: number;

  @IsArray()
  @IsOptional()
  allowedExtensions?: string[];

  @IsNumber()
  @IsOptional()
  minWidth?: number;

  @IsNumber()
  @IsOptional()
  maxWidth?: number;

  @IsNumber()
  @IsOptional()
  minHeight?: number;

  @IsNumber()
  @IsOptional()
  maxHeight?: number;

  @IsString()
  @IsOptional()
  requiredAspectRatio?: string;

  @IsBoolean()
  @IsOptional()
  enableCropping?: boolean;

  @IsBoolean()
  @IsOptional()
  enableRotation?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class UpdateUploadFieldDto extends CreateUploadFieldDto {}

export class UploadFileDto {
  @IsString()
  fieldId: string;

  @IsString()
  @IsOptional()
  cartToken?: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;
}
