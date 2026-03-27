
DELETE FROM public.score_audit_log WHERE score_id IN (
  '86f3edae-03da-400e-bcd3-67a92e27b190',
  '778391f7-ef47-4cdb-898d-0c4e7e258551',
  '814a0664-807e-4e5e-a361-681bb1a4530b'
);

DELETE FROM public.current_high_scores WHERE id IN (
  '86f3edae-03da-400e-bcd3-67a92e27b190',
  '778391f7-ef47-4cdb-898d-0c4e7e258551',
  '814a0664-807e-4e5e-a361-681bb1a4530b'
);
