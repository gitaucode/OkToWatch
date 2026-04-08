function randomCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export async function generateUniqueInviteCode(db) {
  for (let i = 0; i < 6; i++) {
    const code = randomCode(8);
    const existing = await db.prepare('SELECT id FROM households WHERE invite_code = ? LIMIT 1').bind(code).first();
    if (!existing) return code;
  }
  return `${randomCode(4)}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export async function ensureHouseholdTables(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS households (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL UNIQUE,
      name TEXT,
      invite_code TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS household_members (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_households_owner ON households(owner_user_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id, created_at DESC)').run();
}

export async function getOrCreateHouseholdForFamily(auth, env) {
  if (!env.DB) return null;
  await ensureHouseholdTables(env.DB);

  const memberRow = await env.DB.prepare(`
    SELECT hm.household_id, hm.role, h.owner_user_id, h.name, h.invite_code
    FROM household_members hm
    JOIN households h ON h.id = hm.household_id
    WHERE hm.user_id = ?
    LIMIT 1
  `).bind(auth.userId).first();

  if (memberRow) {
    return {
      householdId: memberRow.household_id,
      ownerUserId: memberRow.owner_user_id,
      role: memberRow.role,
      name: memberRow.name || null,
      inviteCode: memberRow.invite_code
    };
  }

  const householdId = crypto.randomUUID().replace(/-/g, '');
  const memberId = crypto.randomUUID().replace(/-/g, '');
  const inviteCode = await generateUniqueInviteCode(env.DB);
  const householdName = `${auth.user.first_name || auth.user.username || 'Family'} Household`;

  await env.DB.prepare(`
    INSERT INTO households (id, owner_user_id, name, invite_code)
    VALUES (?, ?, ?, ?)
  `).bind(householdId, auth.userId, householdName, inviteCode).run();

  await env.DB.prepare(`
    INSERT INTO household_members (id, household_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `).bind(memberId, householdId, auth.userId).run();

  return {
    householdId,
    ownerUserId: auth.userId,
    role: 'owner',
    name: householdName,
    inviteCode
  };
}

export async function resolveDataScope(auth, env) {
  if (!auth?.isFamily) {
    return {
      scopeUserId: auth.userId,
      householdId: null,
      role: null,
      isFamilyScope: false
    };
  }

  const household = await getOrCreateHouseholdForFamily(auth, env);
  return {
    scopeUserId: household?.ownerUserId || auth.userId,
    householdId: household?.householdId || null,
    role: household?.role || null,
    inviteCode: household?.inviteCode || null,
    name: household?.name || null,
    isFamilyScope: true
  };
}
