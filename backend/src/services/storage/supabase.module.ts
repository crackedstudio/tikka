import { Global, Module } from '@nestjs/common';
import { supabaseProvider } from './supabase.provider';

@Global()
@Module({
  providers: [supabaseProvider],
  exports: [supabaseProvider],
})
export class SupabaseModule {}
