-- Run with `supabase test db` against an isolated local installation.
-- Every fixture and role switch is transaction-local and rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'Pacific/Honolulu';

select plan(33);

-- Unique school codes avoid relying on an empty database or deleting prior rows.
select set_config('test.school_views_a', 'pgtap-view-a:' || gen_random_uuid()::text, true);
select set_config('test.school_views_b', 'pgtap-view-b:' || gen_random_uuid()::text, true);
create temporary table original_school_views on commit drop as
  select std_code, day, viewer, created_at from public.school_views;

select has_table('public', 'school_views', 'Raw view records exist');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.school_views'::regclass),
  'Raw view records retain RLS'
);
select policies_are('public', 'school_views', array[]::name[], 'No browser RLS policy is added');
select ok(
  has_table_privilege('service_role', 'public.school_views', 'SELECT'),
  'Server role has SELECT for the explicit conflict target'
);
select ok(
  has_table_privilege('service_role', 'public.school_views', 'INSERT'),
  'Server role has INSERT independently of project default grants'
);
select columns_are(
  'public', 'school_views_today', array['std_code', 'n']::name[],
  'Public aggregate exposes only school code and count'
);
select ok(
  not coalesce(
    (select reloptions @> array['security_invoker=true']
       from pg_class where oid = 'public.school_views_today'::regclass),
    false
  ),
  'Aggregate reads with its owner privileges, without raw browser access'
);
select ok(
  has_table_privilege('anon', 'public.school_views_today', 'SELECT') and
  has_table_privilege('authenticated', 'public.school_views_today', 'SELECT'),
  'Anonymous and signed-in readers retain aggregate SELECT'
);

set local role service_role;

select lives_ok($$
  insert into public.school_views (std_code, day, viewer)
  values (current_setting('test.school_views_a'),
          (now() at time zone 'Asia/Seoul')::date,
          '10000000-0000-4000-8000-000000000001')
  on conflict (std_code, day, viewer) do nothing
$$, 'Server inserts a first view using the API conflict target');
select is(
  (select count(*) from public.school_views
    where std_code = current_setting('test.school_views_a')),
  1::bigint, 'First view creates exactly one raw row'
);
select lives_ok($$
  insert into public.school_views (std_code, day, viewer, created_at)
  values (current_setting('test.school_views_a'),
          (now() at time zone 'Asia/Seoul')::date,
          '10000000-0000-4000-8000-000000000001', '2000-01-01T00:00:00Z')
  on conflict (std_code, day, viewer) do nothing
$$, 'Duplicate ignore succeeds without an UPDATE operation');
select is(
  (select count(*) from public.school_views
    where std_code = current_setting('test.school_views_a')),
  1::bigint, 'Same browser, school, and KST day are counted once'
);
select is(
  (select created_at from public.school_views
    where std_code = current_setting('test.school_views_a')),
  now(), 'Ignoring a duplicate preserves the original timestamp'
);
select lives_ok($$
  insert into public.school_views (std_code, day, viewer)
  values (current_setting('test.school_views_a'),
          (now() at time zone 'Asia/Seoul')::date,
          '10000000-0000-4000-8000-000000000002')
  on conflict (std_code, day, viewer) do nothing
$$, 'A different browser can create its own daily view');
reset role;
select is(
  (select n from public.school_views_today
    where std_code = current_setting('test.school_views_a')),
  2, 'Daily aggregate counts the two distinct viewers'
);
set local role service_role;
select lives_ok($$
  insert into public.school_views (std_code, day, viewer)
  values (current_setting('test.school_views_b'),
          (now() at time zone 'Asia/Seoul')::date,
          '10000000-0000-4000-8000-000000000001')
  on conflict (std_code, day, viewer) do nothing
$$, 'The same browser can separately view another school');
reset role;
select is(
  (select n from public.school_views_today
    where std_code = current_setting('test.school_views_b')),
  1, 'Other school has its independent aggregate'
);
set local role service_role;
select lives_ok($$
  insert into public.school_views (std_code, day, viewer)
  values
    (current_setting('test.school_views_a'),
     (now() at time zone 'Asia/Seoul')::date - 1,
     '10000000-0000-4000-8000-000000000001'),
    (current_setting('test.school_views_a'),
     (now() at time zone 'Asia/Seoul')::date + 1,
     '10000000-0000-4000-8000-000000000001')
  on conflict (std_code, day, viewer) do nothing
$$, 'A browser may have independent records on other KST dates');
reset role;
select is(
  (select n from public.school_views_today
    where std_code = current_setting('test.school_views_a')),
  2, 'Today aggregate excludes yesterday and tomorrow despite session timezone'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select * from public.school_views$$,
  '42501', null, 'Anonymous raw SELECT is denied'
);
select throws_ok($$
  insert into public.school_views (std_code, day, viewer)
  values (current_setting('test.school_views_a'),
          (now() at time zone 'Asia/Seoul')::date,
          '10000000-0000-4000-8000-000000000003')
$$, '42501', null, 'Anonymous raw INSERT is denied');
select throws_ok($$
  update public.school_views set day = day + 1
  where std_code = current_setting('test.school_views_a')
$$, '42501', null, 'Anonymous raw UPDATE is denied');
select throws_ok($$
  delete from public.school_views
  where std_code = current_setting('test.school_views_a')
$$, '42501', null, 'Anonymous raw DELETE is denied');
select results_eq(
  $$select std_code, n from public.school_views_today
     where std_code = current_setting('test.school_views_a')$$,
  $$select current_setting('test.school_views_a'), 2$$,
  'Anonymous reader receives the school aggregate without a viewer identifier'
);

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$select * from public.school_views$$,
  '42501', null, 'Signed-in raw SELECT is denied'
);
select throws_ok($$
  insert into public.school_views (std_code, day, viewer)
  values (current_setting('test.school_views_a'),
          (now() at time zone 'Asia/Seoul')::date,
          '10000000-0000-4000-8000-000000000003')
$$, '42501', null, 'Signed-in raw INSERT is denied');
select throws_ok($$
  update public.school_views set day = day + 1
  where std_code = current_setting('test.school_views_a')
$$, '42501', null, 'Signed-in raw UPDATE is denied');
select throws_ok($$
  delete from public.school_views
  where std_code = current_setting('test.school_views_a')
$$, '42501', null, 'Signed-in raw DELETE is denied');
select results_eq(
  $$select std_code, n from public.school_views_today
     where std_code = current_setting('test.school_views_b')$$,
  $$select current_setting('test.school_views_b'), 1$$,
  'Signed-in reader retains access to aggregate-only school counts'
);

reset role;

select is(
  (select count(*) from public.school_views
    where std_code in (current_setting('test.school_views_a'), current_setting('test.school_views_b'))),
  5::bigint, 'Rejected browser writes leave all five fixture rows intact'
);
select results_eq(
  $$select std_code, day, viewer, created_at from public.school_views
    where std_code not in (current_setting('test.school_views_a'), current_setting('test.school_views_b'))
    order by std_code, day, viewer$$,
  $$select std_code, day, viewer, created_at from original_school_views
    order by std_code, day, viewer$$,
  'All preexisting records remain unchanged'
);
select is(
  (select count(*) from public.school_views),
  (select count(*) + 5 from original_school_views),
  'Tests add only their isolated fixture records'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'school_views'),
  0::bigint, 'Writing and aggregating do not add browser access policies'
);

select * from finish();
rollback;
