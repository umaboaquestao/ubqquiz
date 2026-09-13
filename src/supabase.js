const SUPABASE_URL = 'https://zwyvepsxmerblrwfqtxw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mUTBuM4Ycd6XyRf0I2hBbA_WMCda7eb';

export const supabaseConfig = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  isConfigured: !SUPABASE_URL.startsWith('COLOCAR_') && !SUPABASE_ANON_KEY.startsWith('COLOCAR_'),
};

let client;

export async function getSupabase() {
  if (!supabaseConfig.isConfigured) return null;
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  }
  return client;
}

export function makeRoomCode() {
  return `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function createSession(roomCode) {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const hostToken = crypto.randomUUID();
  const { data, error } = await supabase.from('quiz_sessions').insert({ room_code: roomCode, host_token: hostToken }).select().single();
  if (error) throw error;
  return { ...data, hostToken };
}

export async function joinSession(roomCode, name) {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data: session, error: sessionError } = await supabase.from('quiz_sessions').select('*').eq('room_code', roomCode).eq('status', 'lobby').single();
  if (sessionError) throw sessionError;
  const { data: player, error: playerError } = await supabase.from('quiz_players').insert({ session_id: session.id, name }).select().single();
  if (playerError) throw playerError;
  return { session, player };
}

export async function subscribeToSession(sessionId, onChange) {
  const supabase = await getSupabase();
  if (!supabase) return () => {};
  const channel = supabase.channel(`quiz-session-${sessionId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_sessions', filter: `id=eq.${sessionId}` }, onChange).subscribe();
  return () => supabase.removeChannel(channel);
}
