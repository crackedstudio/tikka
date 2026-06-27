/**
 * Oracle Jobs Service
 * 
 * Handles persistent storage and recovery of job state to survive oracle restarts.
 * Integrates with Supabase for durable job state tracking.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { JobState } from '../queue/job-state.types';

export interface OracleJobRecord {
  id?: number;
  job_id: string;
  raffle_id: number;
  state: JobState;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class OracleJobsService implements OnModuleInit {
  private readonly logger = new Logger(OracleJobsService.name);
  private supabase: SupabaseClient;
  private initialized = false;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured. Job persistence disabled.');
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async onModuleInit(): Promise<void> {
    if (!this.supabase) {
      return;
    }

    try {
      // Test connection
      const { error } = await this.supabase.from('oracle_jobs').select('id', { count: 'exact', head: true });
      if (error) {
        this.logger.error(`Failed to connect to oracle_jobs table: ${error.message}`);
        return;
      }
      this.initialized = true;
      this.logger.log('Oracle jobs persistence initialized');
    } catch (err) {
      this.logger.error(`Error initializing oracle jobs service: ${err}`);
    }
  }

  /**
   * Create or update a job record in the database
   */
  async upsertJob(job: OracleJobRecord): Promise<OracleJobRecord | null> {
    if (!this.initialized) {
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .from('oracle_jobs')
        .upsert({
          job_id: job.job_id,
          raffle_id: job.raffle_id,
          state: job.state,
          metadata: job.metadata || {},
        }, {
          onConflict: 'job_id',
        })
        .select()
        .single();

      if (error) {
        this.logger.error(`Failed to upsert job ${job.job_id}: ${error.message}`);
        return null;
      }

      return data as OracleJobRecord;
    } catch (err) {
      this.logger.error(`Error upserting job ${job.job_id}: ${err}`);
      return null;
    }
  }

  /**
   * Get a single job by job_id
   */
  async getJob(jobId: string): Promise<OracleJobRecord | null> {
    if (!this.initialized) {
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .from('oracle_jobs')
        .select()
        .eq('job_id', jobId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        this.logger.error(`Failed to get job ${jobId}: ${error.message}`);
        return null;
      }

      return data as OracleJobRecord | null;
    } catch (err) {
      this.logger.error(`Error getting job ${jobId}: ${err}`);
      return null;
    }
  }

  /**
   * Get all jobs in a specific state (for recovery on startup)
   */
  async getJobsByState(state: JobState): Promise<OracleJobRecord[]> {
    if (!this.initialized) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .from('oracle_jobs')
        .select()
        .eq('state', state);

      if (error) {
        this.logger.error(`Failed to get jobs by state ${state}: ${error.message}`);
        return [];
      }

      return (data as OracleJobRecord[]) || [];
    } catch (err) {
      this.logger.error(`Error getting jobs by state ${state}: ${err}`);
      return [];
    }
  }

  /**
   * Get all IN_PROGRESS jobs (GENERATING, SUBMITTING, CONFIRMING)
   */
  async getInProgressJobs(): Promise<OracleJobRecord[]> {
    if (!this.initialized) {
      return [];
    }

    try {
      const inProgressStates = [
        JobState.GENERATING,
        JobState.SUBMITTING,
        JobState.CONFIRMING,
        JobState.RETRYING,
      ];

      const { data, error } = await this.supabase
        .from('oracle_jobs')
        .select()
        .in('state', inProgressStates);

      if (error) {
        this.logger.error(`Failed to get in-progress jobs: ${error.message}`);
        return [];
      }

      return (data as OracleJobRecord[]) || [];
    } catch (err) {
      this.logger.error(`Error getting in-progress jobs: ${err}`);
      return [];
    }
  }

  /**
   * Update job state
   */
  async updateJobState(jobId: string, state: JobState, metadata?: Record<string, any>): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      const { error } = await this.supabase
        .from('oracle_jobs')
        .update({
          state,
          metadata: metadata || {},
        })
        .eq('job_id', jobId);

      if (error) {
        this.logger.error(`Failed to update job ${jobId} state to ${state}: ${error.message}`);
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error(`Error updating job ${jobId} state: ${err}`);
      return false;
    }
  }

  /**
   * Delete a job (cleanup)
   */
  async deleteJob(jobId: string): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      const { error } = await this.supabase
        .from('oracle_jobs')
        .delete()
        .eq('job_id', jobId);

      if (error) {
        this.logger.error(`Failed to delete job ${jobId}: ${error.message}`);
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error(`Error deleting job ${jobId}: ${err}`);
      return false;
    }
  }

  /**
   * Delete old completed jobs (cleanup)
   */
  async deleteOldJobs(olderThanMinutes: number = 60): Promise<number> {
    if (!this.initialized) {
      return 0;
    }

    try {
      const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

      const { data, error } = await this.supabase
        .from('oracle_jobs')
        .delete()
        .lt('updated_at', cutoffTime)
        .in('state', [JobState.CONFIRMED, JobState.FAILED, JobState.DEAD_LETTERED])
        .select();

      if (error) {
        this.logger.error(`Failed to delete old jobs: ${error.message}`);
        return 0;
      }

      const deletedCount = (data as any[])?.length || 0;
      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} old completed jobs`);
      }
      return deletedCount;
    } catch (err) {
      this.logger.error(`Error deleting old jobs: ${err}`);
      return 0;
    }
  }

  /**
   * Check if service is initialized and connected
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
