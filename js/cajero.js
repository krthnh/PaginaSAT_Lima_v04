import { sql } from './neon-config.js';
import { verificarSesion, cerrarSesion } from './auth.js';

const usuario = verificarSesion();

// Verificar que el rol sea cajero o admin
if (usuario.rol !== 'cajero' && usuario.rol !== 'admin') {
    alert('Acceso no autorizado para este panel.');
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    // Mostrar nombre del cajero
    document.getElementById('cajero-nombre').textContent = `${usuario.nombre || 'Cajero'} (CAJERO)`;
    
    // Botón cerrar sesión
    document.getElementById('btn-cerrar-sesion').addEventListener('click', cerrarSesion);

    // Cargar reclamos iniciales
    cargarReclamos();

    // Filtro de búsqueda en tiempo real (RF-33.12: Búsqueda ILIKE)[cite: 9]
    const inputBusqueda = document.getElementById('input-busqueda');
    inputBusqueda.addEventListener('input', () => {
        cargarReclamos(inputBusqueda.value.trim());
    });
});

async function cargarReclamos(filtro = '') {
    const tbody = document.getElementById('tabla-reclamos-cajero');
    
    try {
        let reclamos;

        if (filtro) {
            const termino = `%${filtro}%`;
            reclamos = await sql`
                SELECT id, codigo_seguimiento, nombre_propietario, dni, tipo_impuesto, motivo, 
                       monto_calculado, estado_pago, numero_comprobante 
                FROM reclamos_tributarios 
                WHERE codigo_seguimiento ILIKE ${termino} 
                   OR dni ILIKE ${termino} 
                   OR nombre_propietario ILIKE ${termino}
                ORDER BY id DESC
            `;
        } else {
            reclamos = await sql`
                SELECT id, codigo_seguimiento, nombre_propietario, dni, tipo_impuesto, motivo, 
                       monto_calculado, estado_pago, numero_comprobante 
                FROM reclamos_tributarios 
                ORDER BY id DESC
            `;
        }

        if (reclamos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">No se encontraron reclamos registrados.</td></tr>`;
            return;
        }

        tbody.innerHTML = reclamos.map(r => {
            const esPagado = r.estado_pago === 'Pagado';
            const badgeClass = esPagado ? 'badge-pagado' : 'badge-pendiente';
            const montoFormateado = `S/ ${parseFloat(r.monto_calculado).toFixed(2)}`;
            const comprobanteTexto = r.numero_comprobante 
                ? `<strong>${r.numero_comprobante}</strong>` 
                : '<span style="color: #aaa;">-</span>';

            return `
                <tr>
                    <td><strong>${r.codigo_seguimiento}</strong></td>
                    <td>${r.nombre_propietario}</td>
                    <td>${r.dni}</td>
                    <td>${r.tipo_impuesto}</td>
                    <td>${r.motivo}</td>
                    <td><strong>${montoFormateado}</strong></td>
                    <td>${comprobanteTexto}</td>
                    <td><span class="badge-pago ${badgeClass}">${r.estado_pago.toUpperCase()}</span></td>
                    <td>
                        ${!esPagado ? `
                            <button class="btn-cobrar" onclick="procesarCobroCaja(${r.id}, '${r.codigo_seguimiento}',${r.monto_calculado})">
                                Cobrar en Caja
                            </button>
                        ` : '<span style="color: #6c757d; font-size: 0.85rem;">Completado</span>'}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" class="loading-cell" style="color: red;">Error al obtener los datos: ${err.message}</td></tr>`;
    }
}

// Función global para procesar cobro en efectivo en ventanilla (RF-33.12)[cite: 9]
window.procesarCobroCaja = async function(reclamoId, codigo, monto) {
    const confirmar = confirm(`¿Confirmar cobro en efectivo para el reclamo ${codigo} por el monto de S/ ${parseFloat(monto).toFixed(2)}?`);
    if (!confirmar) return;

    try {
        const numComprobante = 'CMP-CJ' + Math.random().toString(36).substring(2, 8).toUpperCase();

        // 1. Insertar pago registrando la transacción[cite: 8]
        await sql`
            INSERT INTO pagos (reclamo_id, monto, medio_pago, numero_comprobante, fecha_pago)
            VALUES (${reclamoId}, ${monto}, 'Cobro Presencial en Caja', ${numComprobante}, NOW())
        `;

        // 2. Actualizar estado del reclamo y asignar el comprobante[cite: 8]
        await sql`
            UPDATE reclamos_tributarios 
            SET estado_pago = 'Pagado', 
                fecha_pago = NOW(), 
                numero_comprobante = ${numComprobante}
            WHERE id = ${reclamoId}
        `;

        alert(`¡Cobro realizado con éxito!\nNúmero de comprobante emitido: ${numComprobante}`);
        
        // Recargar la tabla
        const inputBusqueda = document.getElementById('input-busqueda');
        cargarReclamos(inputBusqueda ? inputBusqueda.value.trim() : '');

    } catch (err) {
        alert('Error al registrar el cobro en caja: ' + err.message);
    }
};