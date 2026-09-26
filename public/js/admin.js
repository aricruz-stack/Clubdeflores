const vistaLogin = document.getElementById('vista-login');
const vistaPanel = document.getElementById('vista-panel');
const loginError = document.getElementById('login-error');

let membresiasCache = [];

async function api(path, opts = {}) {
  const res = await fetch('/api/admin' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de red');
  return data;
}

function formatearFecha(iso) {
  const [y, m, d] = iso.split('-');
  const fecha = new Date(Number(y), Number(m) - 1, Number(d));
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatearPrecio(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

function estadoCuotaHtml(fechaVencimiento) {
  if (!fechaVencimiento) {
    return '<span class="estado-pill sin-datos">Sin registrar</span>';
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const alDia = fechaVencimiento >= hoy;
  return `
    <span class="estado-pill ${alDia ? 'al-dia' : 'vencida'}">${alDia ? 'Al día' : 'Vencida'}</span>
    <span class="venc-detalle">${alDia ? 'Vence' : 'Venció'} el ${formatearFecha(fechaVencimiento)}</span>
  `;
}

// --- Navegacion entre tabs ---
document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-tab]').forEach(i => i.classList.remove('activo'));
    item.classList.add('activo');
    document.querySelectorAll('main > section').forEach(s => s.classList.add('oculto'));
    document.getElementById('tab-' + item.dataset.tab).classList.remove('oculto');
  });
});

// --- Login ---
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const usuario = document.getElementById('usuario').value.trim();
  const password = document.getElementById('password').value;
  try {
    await api('/login', { method: 'POST', body: JSON.stringify({ usuario, password }) });
    entrarAlPanel();
  } catch (err) {
    loginError.textContent = err.message;
  }
});

document.getElementById('btn-salir').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  vistaPanel.classList.add('oculto');
  vistaLogin.classList.remove('oculto');
});

async function entrarAlPanel() {
  vistaLogin.classList.add('oculto');
  vistaPanel.classList.remove('oculto');
  await cargarMembresias();
  await cargarFechas();
  await cargarSocios();
}

// --- Membresias ---
async function cargarMembresias() {
  membresiasCache = await api('/membresias');
  const tbody = document.getElementById('tabla-membresias');
  tbody.innerHTML = membresiasCache.map(m => `
    <tr>
      <td>${m.nombre}</td>
      <td>${m.tipo}</td>
      <td>${formatearPrecio(m.precio)}</td>
      <td>${m.activa ? '<span class="chip-si">Sí</span>' : '<span class="chip-no">No</span>'}</td>
      <td><button class="boton-secundario boton-chico" data-eliminar-membresia="${m.id}">Eliminar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5">Todavía no hay membresías cargadas.</td></tr>';

  tbody.querySelectorAll('[data-eliminar-membresia]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta membresía? También se van a borrar sus fechas de entrega.')) return;
      await api('/membresias/' + btn.dataset.eliminarMembresia, { method: 'DELETE' });
      await cargarMembresias();
      await cargarFechas();
    });
  });

  // refrescar selects que dependen de membresias
  const opciones = membresiasCache.map(m => `<option value="${m.id}">${m.nombre} (${m.tipo})</option>`).join('');
  document.getElementById('f-membresia').innerHTML = opciones || '<option value="">Sin membresías cargadas</option>';
  document.getElementById('s-membresia').innerHTML = '<option value="">Sin asignar</option>' + opciones;
}

document.getElementById('form-membresia').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('m-nombre').value.trim();
  const tipo = document.getElementById('m-tipo').value;
  const precio = document.getElementById('m-precio').value;
  await api('/membresias', { method: 'POST', body: JSON.stringify({ nombre, tipo, precio }) });
  e.target.reset();
  await cargarMembresias();
});

// --- Fechas de entrega ---
async function cargarFechas() {
  const fechas = await api('/fechas');
  const tbody = document.getElementById('tabla-fechas');
  tbody.innerHTML = fechas.map(f => {
    const mem = membresiasCache.find(m => m.id === f.membresia_id);
    return `
      <tr>
        <td>${formatearFecha(f.fecha)}</td>
        <td>${mem ? mem.nombre : '—'}</td>
        <td>${f.cupo_maximo ?? 'Sin límite'}</td>
        <td><button class="boton-secundario boton-chico" data-eliminar-fecha="${f.id}">Eliminar</button></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4">Todavía no hay fechas cargadas.</td></tr>';

  tbody.querySelectorAll('[data-eliminar-fecha]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('/fechas/' + btn.dataset.eliminarFecha, { method: 'DELETE' });
      await cargarFechas();
    });
  });
}

document.getElementById('form-fecha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const membresia_id = document.getElementById('f-membresia').value;
  const fecha = document.getElementById('f-fecha').value;
  const cupo = document.getElementById('f-cupo').value;
  if (!membresia_id) return alert('Primero creá al menos una membresía.');
  await api('/fechas', {
    method: 'POST',
    body: JSON.stringify({ membresia_id, fecha, cupo_maximo: cupo ? Number(cupo) : null })
  });
  e.target.reset();
  await cargarFechas();
});

// --- Socios ---
async function cargarSocios() {
  const socios = await api('/socios');
  const tbody = document.getElementById('tabla-socios');
  tbody.innerHTML = socios.map(s => `
    <tr>
      <td>${s.foto ? `<img src="${s.foto}" alt="" class="avatar-mini">` : `<div class="avatar-mini avatar-mini-vacio">${(s.nombre[0] || '') + (s.apellido[0] || '')}</div>`}</td>
      <td>${s.codigo_socio}</td>
      <td>${s.nombre} ${s.apellido}</td>
      <td>${s.membresia_nombre || '—'}</td>
      <td>${estadoCuotaHtml(s.fecha_vencimiento)}</td>
      <td>${s.entrega_actual_fecha ? formatearFecha(s.entrega_actual_fecha) : 'Sin coordinar'}</td>
      <td>
        <div class="fila-acciones">
          <button class="boton-mini" data-renovar="${s.id}" title="Suma un mes desde hoy o desde el vencimiento actual">Renovar</button>
          <button class="boton-secundario boton-chico" data-eliminar-socio="${s.id}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7">Todavía no hay socios cargados.</td></tr>';

  tbody.querySelectorAll('[data-renovar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api('/socios/' + btn.dataset.renovar + '/renovar', { method: 'POST' });
        await cargarSocios();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('[data-eliminar-socio]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este socio?')) return;
      await api('/socios/' + btn.dataset.eliminarSocio, { method: 'DELETE' });
      await cargarSocios();
    });
  });
}

document.getElementById('form-socio').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    codigo_socio: document.getElementById('s-codigo').value.trim(),
    dni: document.getElementById('s-dni').value.trim(),
    nombre: document.getElementById('s-nombre').value.trim(),
    apellido: document.getElementById('s-apellido').value.trim(),
    membresia_id: document.getElementById('s-membresia').value || null,
    fecha_vencimiento: document.getElementById('s-vencimiento').value || null
  };
  try {
    await api('/socios', { method: 'POST', body: JSON.stringify(body) });
    e.target.reset();
    await cargarSocios();
  } catch (err) {
    alert(err.message);
  }
});

// Si ya hay sesion activa (recarga de pagina), entrar directo
(async () => {
  try {
    const { autenticado } = await api('/sesion');
    if (autenticado) await entrarAlPanel();
  } catch (e) { /* se queda en login */ }
})();
