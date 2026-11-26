UPDATE barbers
SET name = CASE id
    WHEN 'capster-a' THEN 'Tio'
    WHEN 'capster-b' THEN 'Angger'
    WHEN 'capster-c' THEN 'Yudha'
  END || CASE WHEN name LIKE '% (Demo)' THEN ' (Demo)' ELSE '' END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (id = 'capster-a' AND name IN ('Capster A', 'Capster A (Demo)'))
   OR (id = 'capster-b' AND name IN ('Capster B', 'Capster B (Demo)'))
   OR (id = 'capster-c' AND name IN ('Capster C', 'Capster C (Demo)'));

UPDATE state_version
SET revision = revision + 1
WHERE id = 1 AND changes() > 0;
