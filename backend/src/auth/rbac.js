import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// Login (JWT) and role permissions. Routes check permissions, never role names.

export const PERMISSIONS = Object.freeze({
  REPORTS_READ: 'reports:read',
  REPORTS_READ_COST: 'reports:read_cost', // see cost columns on report endpoints
  REPORTS_REASSIGN: 'reports:reassign', //   fix orphaned reports
  COSTS_READ: 'costs:read',
  QUALITY_READ: 'quality:read',
  ALERTS_READ: 'alerts:read',
  ALERTS_ACK: 'alerts:ack',
  SIMULATOR_CONTROL: 'simulator:control',
});

const P = PERMISSIONS;
export const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.values(P),
  finops: [P.REPORTS_READ, P.REPORTS_READ_COST, P.COSTS_READ, P.ALERTS_READ],
  viewer: [P.REPORTS_READ, P.ALERTS_READ],
});

const permissionsFor = (role) => ROLE_PERMISSIONS[role] ?? [];

export const can = (user, permission) => Boolean(user?.permissions.includes(permission));

// Demo user directory. Production would use SSO (OIDC) with roles from IdP group claims;
// these accounts exist so evaluators can try each role (documented in the README).
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

const DEMO_USERS = [
  { email: 'admin@company.com', name: 'Vaishnavi', role: 'admin', password: 'admin123' },
  { email: 'finops@company.com', name: 'Kabir Mehta', role: 'finops', password: 'finops123' },
  { email: 'viewer@company.com', name: 'Meera Iyer', role: 'viewer', password: 'viewer123' },
];

const users = new Map(DEMO_USERS.map(({ password, ...user }) => [user.email, { ...user, passwordHash: hashPassword(password) }]));
// Unknown emails are checked against this hash so the response time doesn't reveal which accounts exist.
const UNKNOWN_USER_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

export function authenticate(email, password) {
  const user = users.get(String(email ?? '').trim().toLowerCase());
  const passwordMatches = verifyPassword(String(password ?? ''), user?.passwordHash ?? UNKNOWN_USER_HASH);
  if (!user || !passwordMatches) return null;
  return { email: user.email, name: user.name, role: user.role, permissions: permissionsFor(user.role) };
}

export function issueToken(user) {
  return jwt.sign({ sub: user.email, name: user.name, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  return { email: payload.sub, name: payload.name, role: payload.role, permissions: permissionsFor(payload.role) };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Missing bearer token' });
  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token is invalid or expired' });
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!can(req.user, permission)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: `Requires permission '${permission}'`, role: req.user?.role });
    }
    return next();
  };
}
