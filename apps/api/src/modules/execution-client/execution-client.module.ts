import { Module } from '@nestjs/common';
import { ExecutionClientService } from './execution-client.service.js';

@Module({
  providers: [ExecutionClientService],
  exports: [ExecutionClientService],
})
export class ExecutionClientModule {}
