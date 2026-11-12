-- A decorated create response must see the row inserted earlier in the same call.
alter function private.menu_order_display(jsonb) volatile;
