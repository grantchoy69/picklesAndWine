-- The project-creation "automatic RLS" option installs this event-trigger
-- function in public. The event trigger runs as its owner and does not require
-- Data API roles to invoke the function directly.
revoke execute on function public.rls_auto_enable()
from public, anon, authenticated;
