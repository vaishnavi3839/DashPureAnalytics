import express from 'express';
import { authenticate, issueToken } from '../auth/rbac.js';

export function authRoutes() {
  const router = express.Router();

  router.post('/auth/login', (req, res) => {
    const user = authenticate(req.body?.email, req.body?.password);
    if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
    return res.json({ token: issueToken(user), user });
  });

  return router;
}
