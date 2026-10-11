-- Jalankan sekali di Supabase Dashboard > SQL Editor.
create table if not exists public.lessons (
  id text primary key,
  subject text not null,
  grade text not null,
  topic text not null,
  theme text not null,
  objective text not null,
  material text not null default '',
  kkm integer not null default 70 check (kkm between 0 and 100),
  questions jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.student_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null references public.lessons(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  passed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lessons enable row level security;
alter table public.teachers enable row level security;
alter table public.student_progress enable row level security;

create policy "Anyone can read published lessons" on public.lessons
  for select to anon, authenticated using (true);
create policy "Teachers can add lessons" on public.lessons
  for insert to authenticated with check (
    exists (select 1 from public.teachers t where t.user_id = (select auth.uid()))
  );
create policy "Teachers can edit lessons" on public.lessons
  for update to authenticated using (
    exists (select 1 from public.teachers t where t.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.teachers t where t.user_id = (select auth.uid()))
  );
create policy "Teachers can delete lessons" on public.lessons
  for delete to authenticated using (
    exists (select 1 from public.teachers t where t.user_id = (select auth.uid()))
  );

create policy "Students can read their own progress" on public.student_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students can save their own progress" on public.student_progress
  for insert to authenticated with check (
    (select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous')::boolean is true
  );
create policy "Students can update their own progress" on public.student_progress
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous')::boolean is true);

create policy "Teachers can view teacher membership" on public.teachers
  for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.lessons to anon, authenticated;
grant insert, update, delete on public.lessons to authenticated;
grant select, insert, update on public.student_progress to authenticated;
grant select on public.teachers to authenticated;

-- Setelah membuat akun guru di Authentication > Users, tambahkan ID pengguna:
-- insert into public.teachers (user_id) values ('UUID_USER_GURU');
