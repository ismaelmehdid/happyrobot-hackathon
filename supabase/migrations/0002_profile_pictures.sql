-- Konbini Happy Robot — profile picture storage
-- Run this once in Supabase SQL Editor after 0001_init.sql.

-- Public bucket so the CDN URL returned by getPublicUrl() can be rendered
-- directly as an <img src>. Writes still require service-role (admin) auth
-- because we add no INSERT/UPDATE/DELETE policies for the authenticated role.
insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'profile-pictures',
    'profile-pictures',
    true,
    5242880,                                       -- 5MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  )
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
