import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wymlgsraovjeqazzxosp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ubyjLtVs3EIWrjptLgICZQ_8bXzO1B7';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
