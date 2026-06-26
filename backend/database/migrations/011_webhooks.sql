-- Migration 008: Add Webhooks table
CREATE TABLE IF NOT EXISTS public.webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_address TEXT NOT NULL,
    target_url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    secret TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_webhooks_owner_address ON public.webhooks(owner_address);
CREATE INDEX IF NOT EXISTS idx_webhooks_is_active ON public.webhooks(is_active);

-- Prevent duplicate active webhooks for the same user and target URL
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhooks_unique_subscription 
ON public.webhooks(owner_address, target_url) 
WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own webhooks
CREATE POLICY "Users can manage their own webhooks"
    ON public.webhooks
    FOR ALL
    USING (owner_address = current_setting('request.jwt.claims')::json->>'address');

-- Create a table for delivery logs (optional but helpful for the requirement "Delivery log is queryable by the webhook owner")
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    error_message TEXT,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON public.webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON public.webhook_deliveries(created_at);

-- RLS for deliveries
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Users can only read their own deliveries
CREATE POLICY "Users can view deliveries for their webhooks"
    ON public.webhook_deliveries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.webhooks w 
            WHERE w.id = webhook_deliveries.webhook_id 
            AND w.owner_address = current_setting('request.jwt.claims')::json->>'address'
        )
    );
