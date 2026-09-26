require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const adminRoutes = require('./routes/admin');
const socioRoutes = require('./routes/socio');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Hash de la contraseña de admin (se calcula una vez al arrancar)
app.locals.adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin', 10);

app.use(express.json({ limit: '3mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'clave-de-desarrollo-cambiar',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 dias
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/admin', adminRoutes);
app.use('/api/socio', socioRoutes);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor de la floreria corriendo en el puerto ${PORT}`);
});
