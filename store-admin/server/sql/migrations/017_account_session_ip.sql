ALTER TABLE account_sessions
  ADD COLUMN ip_address INET,
  ADD COLUMN revocation_reason TEXT;
