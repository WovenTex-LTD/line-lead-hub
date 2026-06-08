-- Lina: record which tools each assistant message invoked.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS tools_used jsonb;

COMMENT ON COLUMN chat_messages.tools_used IS
  'Array of {name, input} for tools Lina invoked while producing this message.';
