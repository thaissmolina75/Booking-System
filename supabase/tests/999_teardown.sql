-- Remove the helpers created by 000_setup.sql.
select extensions.plan(1);
drop schema if exists tests cascade;
select extensions.pass('test helpers removed');
select * from extensions.finish();
