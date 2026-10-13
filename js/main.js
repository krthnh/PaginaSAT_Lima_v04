import { sql } from './neon-config.js';
import { verificarSesion } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar sesión activa si no estamos en login
    if (!window.location.pathname.includes('login.html')) {
        verificarSesion();
    }

    // 2. Control del formulario de consulta
    const formConsulta = document.getElementById('form-consulta');
    const containerResultados = document.getElementById('resultado-busqueda-container');
    const tbody = document.getElementById('tbody-resultados-consulta');

    if (formConsulta) {
        formConsulta.addEventListener('submit', async (e) => {
            e.preventDefault();

            const dni = document.getElementById('consulta-dni')?.value.trim();
            const tipoFiltro = document.getElementById('consulta-tipo')?.value || 'TODOS';
            const submitBtn = formConsulta.querySelector('button[type="submit"]');

            if (!dni || dni.length !== 8 || isNaN(dni)) {
                alert('Por favor, ingrese un número de DNI válido (8 dígitos).');
                return;
            }

            // Cambiar estado del botón
            const textoOriginal = submitBtn.textContent;
            submitBtn.textContent = 'Buscando registros...';
            submitBtn.disabled = true;

            try {
                let reclamos;

                if (tipoFiltro === 'TODOS') {
                    reclamos = await sql`
                        SELECT id, codigo_seguimiento, tipo_impuesto, motivo, monto_calculado, 
                               estado, estado_pago, numero_comprobante, fecha_registro 
                        FROM reclamos_tributarios 
                        WHERE dni = ${dni}
                        ORDER BY id DESC
                    `;
                } else {
                    reclamos = await sql`
                        SELECT id, codigo_seguimiento, tipo_impuesto, motivo, monto_calculado, 
                               estado, estado_pago, numero_comprobante, fecha_registro 
                        FROM reclamos_tributarios 
                        WHERE dni = ${dni} AND tipo_impuesto = ${tipoFiltro}
                        ORDER BY id DESC
                    `;
                }

                // Mostrar la sección de resultados
                if (containerResultados) {
                    containerResultados.style.display = 'block';
                }

                if (!reclamos || reclamos.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="8" style="text-align: center; padding: 20px; color: #6c757d;">
                                No se encontraron registros asociados al DNI <strong>${dni}</strong>.
                            </td>
                        </tr>
                    `;
                } else {
                    tbody.innerHTML = reclamos.map(r => {
                        const esPagado = r.estado_pago === 'Pagado';
                        const estadoGeneral = (r.estado || 'REGISTRADO').toUpperCase();
                        
                        // 1. Fecha de registro
                        const fechaFormateada = r.fecha_registro 
                            ? new Date(r.fecha_registro).toLocaleDateString('es-PE') 
                            : '-';

                        // 2. Monto
                        const montoFormateado = `S/ ${parseFloat(r.monto_calculado || 0).toFixed(2)}`;

                        // 3. COMPROBANTE (Muestra CMP-VS-XXXXXX si existe/está pagado, o '-' si está pendiente)
                        const valComprobante = r.numero_comprobante || r.comprobante;
                        const comprobanteTexto = (valComprobante && String(valComprobante).trim() !== '' && String(valComprobante) !== 'null')
                            ? `<strong style="color: #003366; font-family: monospace; font-size: 0.95rem;">${valComprobante}</strong>` 
                            : '<span style="color: #aaa;">-</span>';

                        // 4. Botón EDITAR (mientras esté en estado REGISTRADO)
                        let btnEditarHtml = '';
                        if (estadoGeneral === 'REGISTRADO') {
                            btnEditarHtml = `<a href="editar_reclamo.html?id=${r.id}" style="background-color: #ffc107; color: #000; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-size: 0.85rem; font-weight: bold; margin-right: 6px; display: inline-block;">Editar</a>`;
                        }

                        // 5. Botón de Pago / Insignia PAGADO
                        const btnPagoHtml = esPagado 
                            ? '<span class="badge-pagado" style="background-color: #28a745; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 0.85rem; display: inline-block;">PAGADO</span>' 
                            : `<a href="pasarela.html?id=${r.id}" style="background-color: #003366; color: white; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-size: 0.85rem; font-weight: bold; display: inline-block;">Pagar Online</a>`;

                        const accionContenido = `${btnEditarHtml}${btnPagoHtml}`;

                        // Retornar las 8 celdas <td> en orden estricto
                        return `
                            <tr>
                                <td style="padding: 12px;"><strong>${r.codigo_seguimiento || '-'}</strong></td>
                                <td style="padding: 12px;">${r.tipo_impuesto || '-'}</td>
                                <td style="padding: 12px;">${r.motivo || '-'}</td>
                                <td style="padding: 12px;"><strong style="color: #28a745;">${montoFormateado}</strong></td>
                                <td style="padding: 12px;"><strong>${estadoGeneral}</strong></td>
                                <td style="padding: 12px; text-align: center;">${comprobanteTexto}</td>
                                <td style="padding: 12px; text-align: center;">${fechaFormateada}</td>
                                <td style="padding: 12px; text-align: center; white-space: nowrap;">${accionContenido}</td>
                            </tr>
                        `;
                    }).join('');
                }

                // Desplazamiento suave a los resultados
                containerResultados.scrollIntoView({ behavior: 'smooth' });

            } catch (err) {
                console.error('Error en la consulta:', err);
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; color: red; padding: 20px;">
                            Error al consultar la base de datos: ${err.message}
                        </td>
                    </tr>
                `;
            } finally {
                submitBtn.textContent = textoOriginal;
                submitBtn.disabled = false;
            }
        });
    }
});