import { verificarSesion, cerrarSesion } from './auth.js';
import { obtenerTodosLosReclamos, actualizarEstadoReclamo, eliminarReclamo } from './panel.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar sesión activa
    const usuario = verificarSesion();
    if (!usuario) return;

    // Mostrar información de quien está en sesión
    document.getElementById('info-usuario').textContent = `${usuario.nombre} (${usuario.rol.toUpperCase()})`;

    // Evento cerrar sesión
    document.getElementById('btn-cerrar-sesion').addEventListener('click', cerrarSesion);

    // 2. Cargar tabla de registros inicial
    await cargarTabla();

    // 3. RF-33.13: Refresco automático cada 15 segundos para sincronizar pagos
    setInterval(async () => {
        await cargarTabla();
    }, 15000);
});

async function cargarTabla() {
    const cuerpoTabla = document.getElementById('tabla-cuerpo');
    const reclamos = await obtenerTodosLosReclamos();

    if (!reclamos || reclamos.length === 0) {
        cuerpoTabla.innerHTML = '<tr><td colspan="10" style="text-align:center;">No hay reclamos registrados en el sistema.</td></tr>';
        return;
    }

    cuerpoTabla.innerHTML = reclamos.map(rec => {
        const esPagado = rec.estado_pago === 'Pagado';
        const badgePagoClass = esPagado ? 'badge-pagado' : 'badge-pendiente';
        const comprobanteTexto = rec.numero_comprobante 
            ? `<strong>${rec.numero_comprobante}</strong>` 
            : '<span style="color:#aaa;">-</span>';

        return `
            <tr>
                <td><strong>${rec.codigo_seguimiento}</strong></td>
                <td>${rec.nombre_propietario}</td>
                <td>${rec.dni}</td>
                <td>${rec.tipo_impuesto}</td>
                <td>${rec.motivo}</td>
                <td><span class="badge badge-${rec.estado.toLowerCase()}">${rec.estado.toUpperCase()}</span></td>
                <td><span class="badge-pago ${badgePagoClass}">${(rec.estado_pago || 'PENDIENTE').toUpperCase()}</span></td>
                <td>${comprobanteTexto}</td>
                <td>${new Date(rec.fecha_registro).toLocaleDateString('es-PE')}</td>
                <td>
                    <button class="btn-accion btn-editar" data-id="${rec.id}" data-motivo="${rec.motivo}" data-estado="${rec.estado}">Estado</button>
                    <button class="btn-accion btn-eliminar" data-id="${rec.id}">Eliminar</button>
                </td>
            </tr>
        `;
    }).join('');

    // Reasignar eventos a los botones
    document.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', cambiarEstadoModal);
    });

    document.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', borrarRegistro);
    });
}

// Función para cambiar estado/motivo
async function cambiarEstadoModal(e) {
    const id = e.target.dataset.id;
    const estadoActual = e.target.dataset.estado;
    const motivoActual = e.target.dataset.motivo;

    const nuevoEstado = prompt("Nuevo estado ('registrado', 'atendido', 'rechazado'):", estadoActual);
    if (!nuevoEstado) return;

    const nuevoMotivo = prompt("Actualizar motivo:", motivoActual);
    if (nuevoMotivo === null) return;

    const res = await actualizarEstadoReclamo(id, nuevoEstado.toLowerCase(), nuevoMotivo);
    if (res.ok) {
        alert("Registro actualizado con éxito");
        cargarTabla();
    } else {
        alert("Error al actualizar: " + res.error);
    }
}

// Función para eliminar registro
async function borrarRegistro(e) {
    const id = e.target.dataset.id;
    if (confirm("¿Estás seguro de eliminar este reclamo de la base de datos?")) {
        const res = await eliminarReclamo(id);
        if (res.ok) {
            alert("Reclamo eliminado correctamente");
            cargarTabla();
        } else {
            alert("Error al eliminar: " + res.error);
        }
    }
}