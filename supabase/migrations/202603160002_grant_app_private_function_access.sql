grant usage on schema app_private to postgres, service_role;
grant execute on function app_private.jsonb_contains_forbidden_keys(jsonb, text[]) to postgres, service_role;
grant execute on function app_private.jsonb_size_bytes(jsonb) to postgres, service_role;
grant execute on function app_private.jsonb_is_text_array(jsonb, integer) to postgres, service_role;
grant execute on function app_private.is_storage_path(text) to postgres, service_role;
