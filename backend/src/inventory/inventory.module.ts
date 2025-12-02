import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { CategoryNormalizerService } from '../outbound/category-normalizer.service';

@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}-${file.originalname}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Check file extension first (more reliable than mimetype)
        if (file.originalname.match(/\.(xlsx|xls)$/i)) {
          cb(null, true);
        } else if (file.mimetype && (
          file.mimetype.includes('spreadsheet') || 
          file.mimetype.includes('excel') ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )) {
          cb(null, true);
        } else {
          cb(new Error('Only Excel files (.xlsx, .xls) are allowed!'), false);
        }
      },
      limits: {
        fileSize: 25 * 1024 * 1024, // 25MB
      },
    }),
  ],
  controllers: [InventoryController],
  providers: [InventoryService, CategoryNormalizerService],
  exports: [InventoryService],
})
export class InventoryModule {}
