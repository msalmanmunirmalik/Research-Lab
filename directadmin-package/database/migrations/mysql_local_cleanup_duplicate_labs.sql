-- Local hygiene: remove duplicate/dummy labs for development DBs.
-- Keeps one "Notebook CRUD Lab Updated" (newest) owned by test user.
-- DO NOT run blindly on production without review.

SET FOREIGN_KEY_CHECKS = 0;

-- Virology Lab (showcased dummy)
DELETE FROM lab_follows WHERE lab_id = '1951048a-9fc0-4c20-9ea3-a00410cf4efa';
DELETE FROM lab_join_requests WHERE lab_id = '1951048a-9fc0-4c20-9ea3-a00410cf4efa';
DELETE FROM lab_workspaces WHERE lab_id = '1951048a-9fc0-4c20-9ea3-a00410cf4efa';
DELETE FROM lab_members WHERE lab_id = '1951048a-9fc0-4c20-9ea3-a00410cf4efa';
DELETE FROM labs WHERE id = '1951048a-9fc0-4c20-9ea3-a00410cf4efa';

-- Orphan Notebook CRUD Lab (no members)
DELETE FROM labs WHERE id = '596afd89-a9fe-44f7-881e-384682c68f0b';

-- Duplicate Notebook CRUD Lab Updated (keep efe6da4b-…)
DELETE FROM lab_members WHERE lab_id IN (
  '5c8d76e7-7e27-4109-907b-79f7b02bc6c7',
  '51aeefd1-fef2-4a41-afa5-31758beafaba',
  'c5dc0f01-0870-4a63-8535-e6b0f65204bc',
  'e4648612-262e-4235-9aeb-e29317d1f38e'
);
DELETE FROM lab_follows WHERE lab_id IN (
  '5c8d76e7-7e27-4109-907b-79f7b02bc6c7',
  '51aeefd1-fef2-4a41-afa5-31758beafaba',
  'c5dc0f01-0870-4a63-8535-e6b0f65204bc',
  'e4648612-262e-4235-9aeb-e29317d1f38e'
);
DELETE FROM lab_join_requests WHERE lab_id IN (
  '5c8d76e7-7e27-4109-907b-79f7b02bc6c7',
  '51aeefd1-fef2-4a41-afa5-31758beafaba',
  'c5dc0f01-0870-4a63-8535-e6b0f65204bc',
  'e4648612-262e-4235-9aeb-e29317d1f38e'
);
DELETE FROM lab_workspaces WHERE lab_id IN (
  '5c8d76e7-7e27-4109-907b-79f7b02bc6c7',
  '51aeefd1-fef2-4a41-afa5-31758beafaba',
  'c5dc0f01-0870-4a63-8535-e6b0f65204bc',
  'e4648612-262e-4235-9aeb-e29317d1f38e'
);
DELETE FROM labs WHERE id IN (
  '5c8d76e7-7e27-4109-907b-79f7b02bc6c7',
  '51aeefd1-fef2-4a41-afa5-31758beafaba',
  'c5dc0f01-0870-4a63-8535-e6b0f65204bc',
  'e4648612-262e-4235-9aeb-e29317d1f38e'
);

SET FOREIGN_KEY_CHECKS = 1;
