// =============================================================================
// FAXWARE SUPABASE INTEGRATION
// Social Features, Real-time Chat, Friends System
// =============================================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

// Supabase Configuration - Set these in your environment or config
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Local storage for user session
const ROOT = path.dirname(__dirname);
const sessionPath = path.join(ROOT, '.faxware_session.json');

let currentSession = null;

// =============================================================================
// HTTP HELPER
// =============================================================================

function supabaseRequest(endpoint, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return reject(new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'));
    }

    const url = new URL(endpoint, SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            reject(new Error(json.message || json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

function loadSession() {
  try {
    if (fs.existsSync(sessionPath)) {
      currentSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      return currentSession;
    }
  } catch (e) {}
  return null;
}

function saveSession(session) {
  currentSession = session;
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
}

function clearSession() {
  currentSession = null;
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

function getSession() {
  return currentSession || loadSession();
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

async function signUp(email, password, username) {
  const result = await supabaseRequest('/auth/v1/signup', 'POST', {
    email,
    password,
    data: { username }
  });
  
  if (result.access_token) {
    saveSession(result);
  }
  
  return result;
}

async function signIn(email, password) {
  const result = await supabaseRequest('/auth/v1/token?grant_type=password', 'POST', {
    email,
    password
  });
  
  if (result.access_token) {
    saveSession(result);
  }
  
  return result;
}

async function signOut() {
  const session = getSession();
  if (session?.access_token) {
    try {
      await supabaseRequest('/auth/v1/logout', 'POST', null, session.access_token);
    } catch (e) {}
  }
  clearSession();
  return { success: true };
}

async function getUser() {
  const session = getSession();
  if (!session?.access_token) {
    return null;
  }
  
  try {
    return await supabaseRequest('/auth/v1/user', 'GET', null, session.access_token);
  } catch (e) {
    return null;
  }
}

// =============================================================================
// USER PROFILES
// =============================================================================

async function getProfile(userId) {
  const session = getSession();
  return supabaseRequest(
    `/rest/v1/profiles?id=eq.${userId}&select=*`,
    'GET',
    null,
    session?.access_token
  );
}

async function updateProfile(updates) {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  return supabaseRequest(
    `/rest/v1/profiles?id=eq.${session.user.id}`,
    'PATCH',
    updates,
    session.access_token
  );
}

async function searchUsers(query) {
  const session = getSession();
  return supabaseRequest(
    `/rest/v1/profiles?username=ilike.%${query}%&select=id,username,avatar_url,status`,
    'GET',
    null,
    session?.access_token
  );
}

// =============================================================================
// FRIENDS SYSTEM
// =============================================================================

async function getFriends() {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  return supabaseRequest(
    `/rest/v1/friends?user_id=eq.${session.user.id}&status=eq.accepted&select=*,friend:profiles(id,username,avatar_url,status)`,
    'GET',
    null,
    session.access_token
  );
}

async function getFriendRequests() {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  return supabaseRequest(
    `/rest/v1/friends?friend_id=eq.${session.user.id}&status=eq.pending&select=*,user:profiles!user_id(id,username,avatar_url)`,
    'GET',
    null,
    session.access_token
  );
}

async function sendFriendRequest(friendId) {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  return supabaseRequest(
    '/rest/v1/friends',
    'POST',
    {
      user_id: session.user.id,
      friend_id: friendId,
      status: 'pending'
    },
    session.access_token
  );
}

async function acceptFriendRequest(requestId) {
  const session = getSession();
  return supabaseRequest(
    `/rest/v1/friends?id=eq.${requestId}`,
    'PATCH',
    { status: 'accepted' },
    session.access_token
  );
}

async function removeFriend(friendId) {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  return supabaseRequest(
    `/rest/v1/friends?or=(and(user_id.eq.${session.user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${session.user.id}))`,
    'DELETE',
    null,
    session.access_token
  );
}

// =============================================================================
// MESSAGING
// =============================================================================

async function getConversations() {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  return supabaseRequest(
    `/rest/v1/conversations?or=(user1_id.eq.${session.user.id},user2_id.eq.${session.user.id})&select=*`,
    'GET',
    null,
    session.access_token
  );
}

async function getMessages(conversationId, limit = 50) {
  const session = getSession();
  return supabaseRequest(
    `/rest/v1/messages?conversation_id=eq.${conversationId}&order=created_at.desc&limit=${limit}&select=*,sender:profiles!sender_id(username,avatar_url)`,
    'GET',
    null,
    session.access_token
  );
}

async function sendMessage(conversationId, content) {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  return supabaseRequest(
    '/rest/v1/messages',
    'POST',
    {
      conversation_id: conversationId,
      sender_id: session.user.id,
      content
    },
    session.access_token
  );
}

async function startConversation(otherUserId) {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  // Check if conversation exists
  const existing = await supabaseRequest(
    `/rest/v1/conversations?or=(and(user1_id.eq.${session.user.id},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${session.user.id}))&select=*`,
    'GET',
    null,
    session.access_token
  );
  
  if (existing && existing.length > 0) {
    return existing[0];
  }
  
  // Create new conversation
  return supabaseRequest(
    '/rest/v1/conversations',
    'POST',
    {
      user1_id: session.user.id,
      user2_id: otherUserId
    },
    session.access_token
  );
}

// =============================================================================
// SHARING
// =============================================================================

async function shareItem(type, content, recipientId = null) {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  return supabaseRequest(
    '/rest/v1/shared_items',
    'POST',
    {
      owner_id: session.user.id,
      recipient_id: recipientId,
      type, // 'recipe', 'memory', 'file', 'prompt'
      content: JSON.stringify(content),
      is_public: !recipientId
    },
    session.access_token
  );
}

async function getSharedItems(type = null) {
  const session = getSession();
  let query = `/rest/v1/shared_items?or=(is_public.eq.true,recipient_id.eq.${session?.user?.id || 'null'})&select=*,owner:profiles!owner_id(username,avatar_url)`;
  
  if (type) {
    query += `&type=eq.${type}`;
  }
  
  return supabaseRequest(query, 'GET', null, session?.access_token);
}

async function getMySharedItems() {
  const session = getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');
  
  return supabaseRequest(
    `/rest/v1/shared_items?owner_id=eq.${session.user.id}&select=*`,
    'GET',
    null,
    session.access_token
  );
}

// =============================================================================
// STATUS CHECK
// =============================================================================

function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function isAuthenticated() {
  return !!getSession()?.access_token;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Config
  isConfigured,
  isAuthenticated,
  
  // Auth
  signUp,
  signIn,
  signOut,
  getUser,
  getSession,
  
  // Profiles
  getProfile,
  updateProfile,
  searchUsers,
  
  // Friends
  getFriends,
  getFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  
  // Messaging
  getConversations,
  getMessages,
  sendMessage,
  startConversation,
  
  // Sharing
  shareItem,
  getSharedItems,
  getMySharedItems
};
