const TOKEN_KEY = 'pi_token';
const USER_KEY = 'pi_user';

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const session = {
  get token() {
    return safe(() => sessionStorage.getItem(TOKEN_KEY));
  },
  get user() {
    return safe(() => JSON.parse(sessionStorage.getItem(USER_KEY)));
  },
  save(token, user) {
    safe(() => {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    });
  },
  clear() {
    safe(() => {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    });
  },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Request failed (${status})`);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const can = (user, permission) => Boolean(user?.permissions?.includes(permission));
