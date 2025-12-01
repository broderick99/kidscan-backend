import { IsEnum, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ServicePickupDayDto {
  @ApiProperty({ enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] })
  @IsEnum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  dayOfWeek: string;

  @ApiProperty({ minimum: 1, maximum: 3 })
  @IsNumber()
  @Min(1)
  @Max(3)
  canNumber: number;
}