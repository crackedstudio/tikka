-- Migration 015: Webhook dead letters table
-- Records permanently-failed webhook deliveries after all retry attempts are exhausted

CREATE TABLE IF NOT EXISTS public.webhook_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
    target_url TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    error_message TEXT,
    attempts_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_dead_letters_webhook_id ON public.webhook_dead_letters(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_dead_letters_created_at ON public.webhook_dead_letters(created_at);

ALTER TABLE public.webhook_dead_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dead letters for their webhooks"
    ON public.webhook_dead_letters
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.webhooks w
            WHERE w.id = webhook_dead_letters.webhook_id
            AND w.owner_address = current_setting('request.jwt.claims')::json->>'address'
        )
    );
