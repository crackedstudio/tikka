import { z } from "zod";
import { supabase, RAFFLE_METADATA_TABLE } from "../config/supabase";
import { api } from "./apiClient";
import { API_CONFIG } from "../config/api";
import type { RaffleMetadata, SupabaseRaffleRecord } from "../types/types";

export const RaffleMetadataSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  image: z.string(),
  images: z.array(z.string()).optional(),
  prizeName: z.string(),
  prizeValue: z.string(),
  prizeCurrency: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  createdBy: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const SafeRaffleMetadataSchema = z.object({
  title: z.string().catch("Unknown Raffle"),
  description: z.string().catch("Metadata could not be loaded"),
  image: z.string().catch(""),
  images: z.array(z.string()).optional().catch(undefined),
  prizeName: z.string().catch("Unknown Prize"),
  prizeValue: z.string().catch("0"),
  prizeCurrency: z.string().catch("XLM"),
  category: z.string().catch("Other"),
  tags: z.array(z.string()).catch([]),
  createdBy: z.string().catch(""),
  createdAt: z.number().catch(0),
  updatedAt: z.number().catch(0),
});

export class MetadataService {
  /**
   * Upload raffle metadata to Supabase and return the record ID
   */
  static async uploadRaffleMetadata(metadata: RaffleMetadata): Promise<string> {
    try {
      const validatedMetadata = RaffleMetadataSchema.parse(metadata);
      console.log("📤 MetadataService: Uploading metadata:", validatedMetadata);
      const { data, error } = await supabase
        .from(RAFFLE_METADATA_TABLE)
        .insert([
          {
            metadata: validatedMetadata,
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
    recordId: string,
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

      return SafeRaffleMetadataSchema.parse(data.metadata) as RaffleMetadata;
    } catch (error) {
      console.error("Error fetching raffle metadata:", error);
      return null;
    }
  }

  /**
   * Fetch raffle metadata by contract raffle ID
   */
  static async getRaffleMetadataByContractId(
    raffleId: number,
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

      return SafeRaffleMetadataSchema.parse(data.metadata) as RaffleMetadata;
    } catch (error) {
      console.error("Error fetching raffle metadata by contract ID:", error);
      return null;
    }
  }

  /**
   * Update raffle metadata
   */
  static async updateRaffleMetadata(
    recordId: string,
    metadata: Partial<RaffleMetadata>,
  ): Promise<boolean> {
    try {
      const partialSchema = RaffleMetadataSchema.partial();
      const validatedMetadata = partialSchema.parse(metadata);

      const { error } = await supabase
        .from(RAFFLE_METADATA_TABLE)
        .update({
          metadata: {
            ...validatedMetadata,
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
    raffleId: number,
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
    creatorAddress: string,
  ): Promise<SupabaseRaffleRecord[]> {
    try {
      const { data, error } = await supabase
        .from(RAFFLE_METADATA_TABLE)
        .select("*")
        .eq("metadata->createdBy", creatorAddress)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch raffles by creator: ${error.message}`);
      }

      return (data || []).map((record) => ({
        ...record,
        metadata: SafeRaffleMetadataSchema.parse(record.metadata) as RaffleMetadata,
      }));
    } catch (error) {
      console.error("Error fetching raffles by creator:", error);
      return [];
    }
  }

  /**
   * Upload raffle metadata and image to the backend backend
   * returns metadataCid (currently: image URL returned by backend)
   */
  static async uploadMetadataWithImage(
    _metadata: Partial<RaffleMetadata>,
    imageFile: File,
  ): Promise<string> {
    try {
      console.log("📤 MetadataService: Uploading raffle image to backend");

      // Create FormData for file upload
      const formData = new FormData();
      formData.append("image", imageFile);

      const response = await api.post<{ url: string }>(
        API_CONFIG.endpoints.raffles.uploadImage,
        formData,
        { requiresAuth: true, headers: {} }, // Content-Type handled automatically for FormData
      );

      // For now, treat the uploaded image URL as the "metadataCid/url" to pass into the contract.
      // A future backend endpoint can persist the full metadata JSON and return a real CID.
      console.log("✅ MetadataService: Image upload successful, url:", response.url);
      return response.url;
    } catch (error) {
      console.error("Error uploading to backend:", error);
      throw error;
    }
  }
}
