DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM account
    GROUP BY LOWER(username)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create case-insensitive username index: duplicate usernames exist when case is ignored.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS account_username_lower_uidx
  ON account (LOWER(username));
