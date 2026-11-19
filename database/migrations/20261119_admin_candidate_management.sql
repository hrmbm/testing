-- Portal Rekrutmen: izinkan admin menghapus foto KTP privat milik kandidat.
-- Jalankan sekali melalui Supabase SQL Editor sebelum memakai tombol Hapus di Tahap 2.

drop policy if exists "portal admin deletes candidate KTP" on storage.objects;
create policy "portal admin deletes candidate KTP"
on storage.objects
for delete to authenticated
using (bucket_id = 'candidate-identity' and public.is_portal_admin());
