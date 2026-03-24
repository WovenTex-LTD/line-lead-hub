-- Trigger: fire send-push-notification edge function when a notification row is inserted

create or replace function notify_push_on_insert()
returns trigger language plpgsql security definer as $$
declare
  service_url text;
  service_key text;
begin
  -- Only fire if user_id is set (skip factory-wide broadcasts without a target user)
  if new.user_id is null then
    return new;
  end if;

  select current_setting('app.supabase_url', true) into service_url;
  select current_setting('app.service_role_key', true) into service_key;

  perform net.http_post(
    url := service_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'notification_id', new.id,
      'user_id',         new.user_id,
      'title',           new.title,
      'message',         coalesce(new.message, ''),
      'type',            new.type,
      'data',            coalesce(new.data, '{}'::jsonb)
    )
  );

  return new;
exception when others then
  -- Never block the insert if push fails
  raise warning 'Push notification trigger failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_notification_inserted on notifications;
create trigger on_notification_inserted
  after insert on notifications
  for each row execute function notify_push_on_insert();
