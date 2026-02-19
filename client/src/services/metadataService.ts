import { supabase, RAFFLE_METADATA_TABLE } from "../config/supabase";
import type { RaffleMetadata, SupabaseRaffleRecord } from "../types/types";

export class MetadataService {
    /**
     * Upload raffle metadata to Supabase and return the record ID
     */
    static async uploadRaffleMetadata(
        metadata: RaffleMetadata
    ): Promise<string> {
        try {
            console.log("📤 MetadataService: Uploading metadata:", metadata);
            const { data, error } = await supabase
                .from(RAFFLE_METADATA_TABLE)
                .insert([
                    {
                        metadata,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                ])
                .select("id")
                .single();

            if (error) {
                console.error("❌ MetadataService: Upload error:", error);
                throw new Error(`Failed to upload metadata: ${error.message}`);
            }

            console.log("✅ MetadataService: Upload successful, ID:", data.id);
            return data.id;
        } catch (error) {
            console.error("Error uploading raffle metadata:", error);
            throw error;
        }
    }

    /**
     * Fetch raffle metadata by record ID
     */
    static async getRaffleMetadata(
        recordId: string
    ): Promise<RaffleMetadata | null> {
        try {
            const { data, error } = await supabase
                .from(RAFFLE_METADATA_TABLE)
                .select("metadata")
                .eq("id", recordId)
                .single();

            if (error) {
                console.error("Error fetching metadata:", error);
                return null;
            }

            return data.metadata;
        } catch (error) {
            console.error("Error fetching raffle metadata:", error);
            return null;
        }
    }

    /**
     * Fetch raffle metadata by contract raffle ID
     */
    static async getRaffleMetadataByContractId(
        raffleId: number
    ): Promise<RaffleMetadata | null> {
        try {
            const { data, error } = await supabase
                .from(RAFFLE_METADATA_TABLE)
                .select("metadata")
                .eq("raffle_id", raffleId)
                .single();

            if (error) {
                console.error("Error fetching metadata by contract ID:", error);
                return null;
            }

            return data.metadata;
        } catch (error) {
            console.error(
                "Error fetching raffle metadata by contract ID:",
                error
            );
            return null;
        }
    }

    /**
     * Update raffle metadata
     */
    static async updateRaffleMetadata(
        recordId: string,
        metadata: Partial<RaffleMetadata>
    ): Promise<boolean> {
        try {
            const { error } = await supabase
                .from(RAFFLE_METADATA_TABLE)
                .update({
                    metadata: {
                        ...metadata,
                        updatedAt: Date.now(),
                    },
                    updated_at: new Date().toISOString(),
                })
                .eq("id", recordId);

            if (error) {
                throw new Error(`Failed to update metadata: ${error.message}`);
            }

            return true;
        } catch (error) {
            console.error("Error updating raffle metadata:", error);
            return false;
        }
    }

    /**
     * Link a Supabase record to a contract raffle ID
     */
    static async linkToContract(
        recordId: string,
        raffleId: number
    ): Promise<boolean> {
        try {
            const { error } = await supabase
                .from(RAFFLE_METADATA_TABLE)
                .update({
                    raffle_id: raffleId,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", recordId);

            if (error) {
                throw new Error(`Failed to link to contract: ${error.message}`);
            }

            return true;
        } catch (error) {
            console.error("Error linking to contract:", error);
            return false;
        }
    }

    /**
     * Get all raffles by creator
     */
    static async getRafflesByCreator(
        creatorAddress: string
    ): Promise<SupabaseRaffleRecord[]> {
        try {
            const { data, error } = await supabase
                .from(RAFFLE_METADATA_TABLE)
                .select("*")
                .eq("metadata->createdBy", creatorAddress)
                .order("created_at", { ascending: false });

            if (error) {
                throw new Error(
                    `Failed to fetch raffles by creator: ${error.message}`
                );
            }

            return data || [];
        } catch (error) {
            console.error("Error fetching raffles by creator:", error);
            return [];
        }
    }
}
