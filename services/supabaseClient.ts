import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://aobgylvnxopahzulwyse.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvYmd5bHZueG9wYWh6dWx3eXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NzM4MjUsImV4cCI6MjA4NjQ0OTgyNX0.ax9py4jUheXrluqVwzFlv7OBnUUMwPgTlSGlLNgmbnk';

export const supabase = createClient(supabaseUrl, supabaseKey);