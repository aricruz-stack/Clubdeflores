function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autenticado como administrador' });
}

function requireSocio(req, res, next) {
  if (req.session && req.session.socioId) return next();
  return res.status(401).json({ error: 'No autenticado como socio' });
}

module.exports = { requireAdmin, requireSocio };
