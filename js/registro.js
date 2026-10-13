import { sql } from './neon-config.js';
import { verificarSesion, cerrarSesion } from './auth.js';

// Verificar autenticación al cargar
const usuario = verificarSesion();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Mostrar nombre del usuario logueado en la cabecera
    const userInfoElem = document.getElementById('user-info');
    if (userInfoElem && usuario) {
        userInfoElem.innerHTML = `Bienvenido, <strong>${usuario.nombre}</strong> | <a href="#" id="btn-logout">Cerrar Sesión</a>`;
        document.getElementById('btn-logout').addEventListener('click', (e) => {
            e.preventDefault();
            cerrarSesion();
        });
    }

    const reclamoForm = document.getElementById('form-reclamo');
    const tablaMisReclamos = document.getElementById('tabla-mis-reclamos');

    // =========================================================
    // LÓGICA DE CÁLCULO DE TASACIÓN EN TIEMPO REAL (TARIFARIO)
    // =========================================================
    const inputTasacion = document.getElementById('valor_tasacion');
    const displayMonto = document.getElementById('monto_calculado_display');
    const inputMontoOculto = document.getElementById('monto_calculado');

    if (inputTasacion) {
        inputTasacion.addEventListener('input', (e) => {
            const valorTasacion = parseFloat(e.target.value) || 0;
            
            // Fórmula institucional: (1.5% del valor de tasación) + S/ 12.00 por apertura
            const tasaVariable = valorTasacion * 0.015;
            const tasaFija = 12.00;
            const totalPagar = tasaVariable + tasaFija;

            const totalFormateado = 'S/ ' + totalPagar.toFixed(2);

            if (displayMonto) displayMonto.textContent = totalFormateado;
            if (inputMontoOculto) inputMontoOculto.value = totalPagar.toFixed(2);
        });
    }

    // 2. Cargar registros propios del cliente al iniciar (RF-33.5)
    if (tablaMisReclamos && usuario) {
        await cargarMisReclamos(tablaMisReclamos);
    }

    // 3. Guardar Reclamo en BD asociado al id del usuario con Tasación y Monto
    if (reclamoForm) {
        reclamoForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nombre = document.getElementById('reclamo-nombre').value.trim();
            const dni = document.getElementById('reclamo-dni').value.trim();
            const tipoImpuesto = document.getElementById('reclamo-tipo').value;
            const motivo = document.getElementById('reclamo-motivo').value.trim();

            // Captura de los campos financieros
            const valorTasacion = parseFloat(document.getElementById('valor_tasacion').value) || 0.00;
            const montoCalculado = parseFloat(document.getElementById('monto_calculado').value) || 12.00;

            const codigoSeguimiento = 'REC-' + Math.random().toString(36).substring(2, 10).toUpperCase();

            const submitBtn = reclamoForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Guardando en BD...</span>';

            try {
                // INSERT completo en la tabla 'reclamos_tributarios'
                await sql`
                    INSERT INTO reclamos_tributarios (
                        codigo_seguimiento, 
                        nombre_propietario, 
                        dni, 
                        tipo_impuesto, 
                        motivo, 
                        valor_tasacion, 
                        monto_calculado, 
                        estado_pago, 
                        estado, 
                        fecha_registro, 
                        usuario_id
                    ) VALUES (
                        ${codigoSeguimiento}, 
                        ${nombre}, 
                        ${dni}, 
                        ${tipoImpuesto}, 
                        ${motivo}, 
                        ${valorTasacion}, 
                        ${montoCalculado}, 
                        'Pendiente', 
                        'registrado', 
                        NOW(), 
                        ${usuario.id}
                    )
                `;

                // Mostrar mensaje o caja de resultado
                const resultBox = document.getElementById('reclamo-resultado');
                const codigoSpan = document.getElementById('codigo-generado');
                
                if (codigoSpan) codigoSpan.textContent = codigoSeguimiento;
                if (resultBox) {
                    resultBox.style.display = 'block';
                    resultBox.classList.add('active');
                    resultBox.scrollIntoView({ behavior: 'smooth' });
                }

                reclamoForm.reset();
                if (displayMonto) displayMonto.textContent = 'S/ 12.00';
                if (inputMontoOculto) inputMontoOculto.value = '12.00';

                // Recargar la lista de reclamos del cliente
                if (tablaMisReclamos) await cargarMisReclamos(tablaMisReclamos);

            } catch (err) {
                alert('Error al registrar en la Base de Datos: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }
});

// =========================================================
// 4. CONSULTA DE DEUDA / RECLAMOS (FILTRADO, EDICIÓN Y PAGO)
// =========================================================
const formConsulta = document.getElementById('form-consulta');
const resultadoContainer = document.getElementById('resultado-busqueda-container');
const tbodyResultados = document.getElementById('tbody-resultados-consulta');

if (formConsulta) {
    formConsulta.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!usuario) {
            alert('Debe iniciar sesión para consultar sus reclamos.');
            return;
        }

        const tipoImpuesto = document.getElementById('consulta-tipo').value;
        const dniIngresado = document.getElementById('consulta-dni').value.trim();

        try {
            let reclamosEncontrados = [];

            if (tipoImpuesto === 'TODOS') {
                reclamosEncontrados = await sql`
                    SELECT id, codigo_seguimiento, tipo_impuesto, motivo, valor_tasacion, monto_calculado, estado_pago, estado, fecha_registro
                    FROM reclamos_tributarios
                    WHERE usuario_id = ${usuario.id} AND dni = ${dniIngresado}
                    ORDER BY fecha_registro DESC
                `;
            } else {
                reclamosEncontrados = await sql`
                    SELECT id, codigo_seguimiento, tipo_impuesto, motivo, valor_tasacion, monto_calculado, estado_pago, estado, fecha_registro
                    FROM reclamos_tributarios
                    WHERE usuario_id = ${usuario.id} 
                      AND dni = ${dniIngresado} 
                      AND tipo_impuesto = ${tipoImpuesto}
                    ORDER BY fecha_registro DESC
                `;
            }

            if (resultadoContainer) resultadoContainer.style.display = 'block';

            if (reclamosEncontrados.length === 0) {
                tbodyResultados.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 15px;">No se encontraron registros que coincidan con los datos ingresados.</td></tr>';
                return;
            }

            // Mapeo dinámico con Botones Editar + Pagar al lado
            tbodyResultados.innerHTML = reclamosEncontrados.map(rec => {
                const esEditable = rec.estado.toLowerCase() === 'registrado';
                const esPendientePago = rec.estado_pago === 'Pendiente';

                // Botón Editar (Solo activo si estado es registrado)
                const botonEditar = esEditable
                    ? `<button class="btn-editar-propio" data-id="${rec.id}" data-tipo="${rec.tipo_impuesto}" data-motivo="${rec.motivo}" style="background-color: #ffc107; color: #000; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-right: 5px;">Editar</button>`
                    : `<span style="color: #6c757d; font-size: 0.85em; font-weight: bold; margin-right: 5px;">Atendido</span>`;

                // Botón Pagar (Si está Pendiente te redirige a pasarela.html, si ya pagó muestra PAGADO)
                const botonPagar = esPendientePago
                    ? `<a href="pasarela.html?id=${rec.id}" style="background-color: #28a745; color: #fff; text-decoration: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 0.85rem; display: inline-block;">Pagar</a>`
                    : `<span style="background-color: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85rem;">PAGADO</span>`;

                const fechaFormateada = new Date(rec.fecha_registro).toLocaleDateString();

                return `
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 12px 16px; font-weight: bold; color: #003366;">${rec.codigo_seguimiento}</td>
                        <td style="padding: 12px 16px;">${rec.tipo_impuesto}</td>
                        <td style="padding: 12px 16px;">${rec.motivo}</td>
                        <td style="padding: 12px 16px; font-weight: bold; color: #28a745;">S/ ${parseFloat(rec.monto_calculado || 0).toFixed(2)}</td>
                        <td style="padding: 12px 16px;">
                            <span class="badge badge-${rec.estado.toLowerCase()}" style="padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85rem;">
                                ${rec.estado.toUpperCase()}
                            </span>
                        </td>
                        <td style="padding: 12px 16px; white-space: nowrap;">${fechaFormateada}</td>
                        <td style="padding: 12px 16px; text-align: center; white-space: nowrap;">
                            ${botonEditar}
                            ${botonPagar}
                        </td>
                    </tr>
                `;
            }).join('');

            // Asignar eventos de edición
            document.querySelectorAll('#tbody-resultados-consulta .btn-editar-propio').forEach(btn => {
                btn.addEventListener('click', async (evt) => {
                    const id = evt.target.dataset.id;
                    const tipoActual = evt.target.dataset.tipo;
                    const motivoActual = evt.target.dataset.motivo;

                    const nuevoMotivo = prompt(`Editar motivo de su reclamo (${tipoActual}):`, motivoActual);
                    if (!nuevoMotivo || nuevoMotivo.trim() === '') return;

                    try {
                        const res = await sql`
                            UPDATE reclamos_tributarios
                            SET motivo = ${nuevoMotivo.trim()}
                            WHERE id = ${id} AND usuario_id = ${usuario.id} AND estado = 'registrado'
                            RETURNING id
                        `;

                        if (res.length > 0) {
                            alert('Reclamo actualizado correctamente.');
                            formConsulta.dispatchEvent(new Event('submit'));
                        } else {
                            alert('No se pudo editar: El reclamo ya no se encuentra en estado registrado.');
                        }
                    } catch (err) {
                        alert('Error al actualizar el reclamo: ' + err.message);
                    }
                });
            });

        } catch (error) {
            console.error('Error al realizar la consulta:', error);
            alert('Ocurrió un error al consultar los reclamos.');
        }
    });
}

// Función para listar únicamente los registros propios (RF-33.5)
async function cargarMisReclamos(contenedorTbody) {
    try {
        const reclamos = await sql`
            SELECT id, codigo_seguimiento, tipo_impuesto, motivo, valor_tasacion, monto_calculado, estado_pago, estado, fecha_registro
            FROM reclamos_tributarios
            WHERE usuario_id = ${usuario.id}
            ORDER BY fecha_registro DESC
        `;

        if (reclamos.length === 0) {
            contenedorTbody.innerHTML = '<tr><td colspan="7">No tienes reclamos registrados.</td></tr>';
            return;
        }

        contenedorTbody.innerHTML = reclamos.map(rec => {
            const puedeEditar = rec.estado === 'registrado';
            const esPendientePago = rec.estado_pago === 'Pendiente';

            const botonEditar = puedeEditar 
                ? `<button class="btn-editar-propio" data-id="${rec.id}" data-tipo="${rec.tipo_impuesto}" data-motivo="${rec.motivo}" style="background-color: #ffc107; color: #000; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-right: 5px;">Editar</button>`
                : `<span style="color: #6c757d; font-size: 0.85em; margin-right: 5px;">Atendido</span>`;

            const botonPagar = esPendientePago
                ? `<a href="pasarela.html?id=${rec.id}" style="background-color: #28a745; color: #fff; text-decoration: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 0.85rem; display: inline-block;">Pagar</a>`
                : `<span style="background-color: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85rem;">PAGADO</span>`;

            return `
                <tr>
                    <td><strong>${rec.codigo_seguimiento}</strong></td>
                    <td>${rec.tipo_impuesto}</td>
                    <td>${rec.motivo}</td>
                    <td><strong style="color: #28a745;">S/ ${parseFloat(rec.monto_calculado || 0).toFixed(2)}</strong></td>
                    <td><span class="badge badge-${rec.estado}">${rec.estado.toUpperCase()}</span></td>
                    <td>${new Date(rec.fecha_registro).toLocaleDateString()}</td>
                    <td style="white-space: nowrap; text-align: center;">
                        ${botonEditar}
                        ${botonPagar}
                    </td>
                </tr>
            `;
        }).join('');

        // Eventos para actualizar reclamo propio (RF-33.6)
        document.querySelectorAll('.btn-editar-propio').forEach(btn => {
            btn.addEventListener('click', editarReclamoPropio);
        });
    } catch (error) {
        console.error('Error al cargar reclamos propios:', error);
    }
}

// Función para editar reclamo propio si estado es 'registrado' (RF-33.6)
async function editarReclamoPropio(e) {
    const id = e.target.dataset.id;
    const tipoActual = e.target.dataset.tipo;
    const motivoActual = e.target.dataset.motivo;

    const nuevoTipo = prompt("Editar Tipo de Impuesto:", tipoActual);
    if (!nuevoTipo) return;

    const nuevoMotivo = prompt("Editar Motivo del Reclamo:", motivoActual);
    if (!nuevoMotivo) return;

    try {
        const resultado = await sql`
            UPDATE reclamos_tributarios 
            SET tipo_impuesto = ${nuevoTipo}, motivo = ${nuevoMotivo}
            WHERE id = ${id} AND usuario_id = ${usuario.id} AND estado = 'registrado'
            RETURNING id
        `;

        if (resultado.length > 0) {
            alert("Reclamo actualizado correctamente.");
            const tablaMisReclamos = document.getElementById('tabla-mis-reclamos');
            if (tablaMisReclamos) await cargarMisReclamos(tablaMisReclamos);
        } else {
            alert("No se pudo editar: El reclamo ya no está en estado 'registrado'.");
        }
    } catch (error) {
        alert("Error al actualizar: " + error.message);
    }
}