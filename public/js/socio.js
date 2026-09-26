const vistaLogin = document.getElementById('vista-login');
const vistaCarnet = document.getElementById('vista-carnet');
const formLogin = document.getElementById('form-login');
const loginError = document.getElementById('login-error');

async function api(path, opts = {}) {
  const res = await fetch('/api/socio' + path, {
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
  return fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatearFechaCorta(iso) {
  const [y, m, d] = iso.split('-');
  const fecha = new Date(Number(y), Number(m) - 1, Number(d));
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function iniciales(nombre, apellido) {
  const a = (nombre || '').trim().charAt(0);
  const b = (apellido || '').trim().charAt(0);
  return (a + b).toUpperCase() || '--';
}

function estadoCuotaHtml(fechaVencimiento) {
  if (!fechaVencimiento) {
    return '<span class="estado-pill sin-datos"><span class="punto"></span>Sin registrar</span>';
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const alDia = fechaVencimiento >= hoy;
  return `
    <span class="estado-pill ${alDia ? 'al-dia' : 'vencida'}"><span class="punto"></span>${alDia ? 'Al día' : 'Vencida'}</span>
    <span class="venc-detalle">${alDia ? 'Vence' : 'Venció'} el ${formatearFechaCorta(fechaVencimiento)}</span>
  `;
}

function formatearPrecio(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

function pintarSocio(s) {
  document.getElementById('c-nombre').textContent = `${s.nombre} ${s.apellido}`;
  document.getElementById('c-codigo').textContent = s.codigo_socio;
  document.getElementById('c-estado').innerHTML = estadoCuotaHtml(s.fecha_vencimiento);

  const membresiaEl = document.getElementById('c-membresia');
  membresiaEl.innerHTML = s.membresia_nombre
    ? `${s.membresia_nombre}<span class="venc-detalle">${formatearPrecio(s.membresia_precio)} por mes</span>`
    : 'Sin asignar';

  const avatar = document.getElementById('c-avatar');
  if (s.foto) {
    avatar.innerHTML = `<img src="${s.foto}" alt="Foto de ${s.nombre}">`;
    document.getElementById('btn-quitar-foto').classList.remove('oculto');
  } else {
    avatar.textContent = iniciales(s.nombre, s.apellido);
    document.getElementById('btn-quitar-foto').classList.add('oculto');
  }

  document.getElementById('c-entrega').textContent = s.entrega_actual_fecha
    ? formatearFecha(s.entrega_actual_fecha)
    : 'Sin coordinar';
}

async function cargarFechas() {
  const cont = document.getElementById('lista-fechas');
  try {
    const fechas = await api('/fechas-disponibles');
    if (!fechas.length) {
      cont.innerHTML = '<div class="vacio">Todavía no hay fechas cargadas para tu membresía. Consultá con la florería.</div>';
      return;
    }
    cont.innerHTML = '';
    fechas.forEach(f => {
      const div = document.createElement('div');
      const seleccionada = f.entrega_actual_id === f.id;
      div.className = 'opcion-fecha' + (!f.disponible ? ' no-disponible' : '');
      div.innerHTML = `
        <span class="fecha-texto">${formatearFecha(f.fecha)}</span>
        <span class="fecha-chip">${f.disponible ? 'Elegir' : 'Sin cupo'}</span>
      `;
      if (f.disponible) {
        div.addEventListener('click', () => seleccionarFecha(f.id));
      }
      cont.appendChild(div);
    });
  } catch (e) {
    cont.innerHTML = `<div class="vacio">${e.message}</div>`;
  }
}

async function seleccionarFecha(id) {
  try {
    await api('/seleccionar-fecha', { method: 'POST', body: JSON.stringify({ fecha_entrega_id: id }) });
    await iniciarCarnet();
  } catch (e) {
    alert(e.message);
  }
}

async function iniciarCarnet() {
  const socio = await api('/me');
  pintarSocio(socio);
  await cargarFechas();
}

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const codigo_socio = document.getElementById('codigo').value.trim();
  const dni = document.getElementById('dni').value.trim();
  try {
    await api('/login', { method: 'POST', body: JSON.stringify({ codigo_socio, dni }) });
    vistaLogin.classList.add('oculto');
    vistaCarnet.classList.remove('oculto');
    await iniciarCarnet();
  } catch (e) {
    loginError.textContent = e.message;
  }
});

document.getElementById('btn-salir').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  vistaCarnet.classList.add('oculto');
  vistaLogin.classList.remove('oculto');
  formLogin.reset();
});

// --- Foto del socio: se recorta a cuadrado y se reduce en el navegador
// antes de enviarla, para no depender de librerías de imágenes en el server ---

function recortarAJpegCuadrado(img, lado = 320, calidad = 0.85) {
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');

  const escala = Math.max(lado / img.width, lado / img.height);
  const anchoDestino = img.width * escala;
  const altoDestino = img.height * escala;
  const x = (lado - anchoDestino) / 2;
  const y = (lado - altoDestino) / 2;

  ctx.drawImage(img, x, y, anchoDestino, altoDestino);
  return canvas.toDataURL('image/jpeg', calidad);
}

document.getElementById('c-avatar').addEventListener('click', () => {
  document.getElementById('input-foto').click();
});

document.getElementById('input-foto').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;

  const lector = new FileReader();
  lector.onload = async (ev) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const dataUrl = recortarAJpegCuadrado(img);
        await api('/foto', { method: 'POST', body: JSON.stringify({ foto: dataUrl }) });
        await iniciarCarnet();
      } catch (err) {
        alert(err.message);
      }
    };
    img.src = ev.target.result;
  };
  lector.readAsDataURL(archivo);
  e.target.value = '';
});

document.getElementById('btn-quitar-foto').addEventListener('click', async () => {
  try {
    await api('/foto', { method: 'DELETE' });
    await iniciarCarnet();
  } catch (err) {
    alert(err.message);
  }
});

// Si ya hay sesion activa (recarga de pagina), intentar entrar directo al carnet
(async () => {
  try {
    const socio = await api('/me');
    pintarSocio(socio);
    await cargarFechas();
    vistaLogin.classList.add('oculto');
    vistaCarnet.classList.remove('oculto');
  } catch (e) {
    // no hay sesion, se queda en el login
  }
})();
