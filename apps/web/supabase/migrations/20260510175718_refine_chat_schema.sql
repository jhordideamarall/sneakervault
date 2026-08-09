-- Add new columns for modern chat features
ALTER TABLE internal_messages 
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES internal_messages(id),
ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create an index for faster lookup of replies
CREATE INDEX IF NOT EXISTS idx_internal_messages_parent_id ON internal_messages(parent_id);
