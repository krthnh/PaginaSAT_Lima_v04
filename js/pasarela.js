import { sql } from './neon-config.js';
import { verificarSesion } from './auth.js';

const usuario = verificarSesion();

// Cargar dinámicamente la librería de confeti si no existe en el proyecto
if (!window.confetti) {
    const scriptConfetti = document.createElement('script');
    scriptConfetti.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/dist/confetti.browser.min.js';
    document.head.appendChild(scriptConfetti);
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Obtener expediente de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const reclamoId = urlParams.get('id');

    if (!reclamoId) {
        alert('No se especificó un expediente válido.');
        window.location.href = 'index.html';
        return;
    }

    // 2. Cargar información de la deuda desde Neon SQL
    const [reclamo] = await sql`
        SELECT id, codigo_seguimiento, monto_calculado 
        FROM reclamos_tributarios 
        WHERE id = ${reclamoId} AND estado_pago = 'Pendiente'
    `;

    if (!reclamo) {
        alert('El reclamo no existe o ya ha sido pagado.');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('resumen-codigo').textContent = reclamo.codigo_seguimiento;
    document.getElementById('resumen-monto').textContent = `S/ ${parseFloat(reclamo.monto_calculado).toFixed(2)}`;

    // Alternar entre métodos de pago
    const radioTarjeta = document.getElementById('radio-tarjeta');
    const radioBilletera = document.getElementById('radio-billetera');
    const formTarjeta = document.getElementById('form-pago-tarjeta');
    const formBilletera = document.getElementById('form-pago-billetera');

    radioTarjeta.addEventListener('change', () => {
        formTarjeta.style.display = 'block';
        formBilletera.style.display = 'none';
    });

    radioBilletera.addEventListener('change', () => {
        formTarjeta.style.display = 'none';
        formBilletera.style.display = 'block';
    });

    // Control dinámico del selector de cuotas (Solo visible si es Crédito)
    const selectTipoTarjeta = document.getElementById('tarjeta-tipo');
    const grupoCuotas = document.getElementById('grupo-cuotas');

    selectTipoTarjeta.addEventListener('change', (e) => {
        grupoCuotas.style.display = (e.target.value === 'Credito') ? 'block' : 'none';
    });

    // Restricción en tiempo de escritura para el campo de mes (solo dígitos)
    const inputMes = document.getElementById('tarjeta-mes');
    if (inputMes) {
        inputMes.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
    }

    // 3. PROCESAR PAGO CON TARJETA DE CRÉDITO / DÉBITO
    formTarjeta.addEventListener('submit', async (e) => {
        e.preventDefault();

        const marca = document.getElementById('tarjeta-marca').value;
        const numero = document.getElementById('tarjeta-numero').value.trim();
        const titular = document.getElementById('tarjeta-titular').value.trim().toUpperCase();
        const dni = document.getElementById('tarjeta-dni').value.trim();
        const tipo = document.getElementById('tarjeta-tipo').value;
        let mes = document.getElementById('tarjeta-mes').value.trim();
        const anio = document.getElementById('tarjeta-anio').value.trim();
        
        // Captura de cuotas desde el input editable
        const cuotasVal = document.getElementById('tarjeta-cuotas')?.value;
        const cuotas = tipo === 'Credito' ? Math.max(1, parseInt(cuotasVal, 10) || 1) : 1;

        // Validaciones en cliente
        if (numero.length !== 16 || isNaN(numero)) return alert('Número de tarjeta inválido (requiere 16 dígitos).');
        if (dni.length !== 8 || isNaN(dni)) return alert('DNI inválido (requiere 8 dígitos).');

        // Validación estricta para el mes (debe ser un número entre 1 y 12)
        const mesNum = parseInt(mes, 10);
        if (isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
            return alert('El mes de expiración debe ser un número entre 1 y 12.');
        }

        // Formatear mes a 2 dígitos (ej: "5" -> "05")
        mes = mesNum.toString().padStart(2, '0');

        if (anio.length !== 2 || isNaN(anio)) return alert('Año de expiración inválido (2 dígitos).');

        const msgBox = document.getElementById('pago-mensaje');
        msgBox.style.display = 'block';
        msgBox.style.backgroundColor = '#fff3cd';
        msgBox.style.color = '#856404';
        msgBox.textContent = 'Validando tarjeta con la entidad bancaria...';

        try {
            // Consultar si existe la tarjeta registrada
            let [tarjetaValida] = await sql`
                SELECT id FROM banco_tarjetas 
                WHERE numero_tarjeta = ${numero} 
                  AND mes_expiracion = ${mes} 
                  AND anio_expiracion = ${anio}
            `;

            // Si no existe, se auto-registra en modo prueba con los datos capturados
            if (!tarjetaValida) {
                const [nuevaTarjeta] = await sql`
                    INSERT INTO banco_tarjetas (
                        numero_tarjeta, mes_expiracion, anio_expiracion, 
                        nombre_titular, tipo_tarjeta, numero_cuotas, 
                        dni_titular, marca_tarjeta
                    ) VALUES (
                        ${numero}, ${mes}, ${anio}, 
                        ${titular}, ${tipo}, ${cuotas}, 
                        ${dni}, ${marca}
                    ) RETURNING id
                `;
                tarjetaValida = nuevaTarjeta;
            }

            const detalleMedioPago = tipo === 'Credito' 
                ? `Tarjeta ${marca} Crédito (${cuotas} ${cuotas > 1 ? 'cuotas' : 'cuota'})` 
                : `Tarjeta ${marca} Débito`;

            await procesarTransaccion(reclamo.id, reclamo.monto_calculado, detalleMedioPago);

        } catch (err) {
            msgBox.style.backgroundColor = '#f8d7da';
            msgBox.style.color = '#721c24';
            msgBox.textContent = 'Error de Autorización: ' + err.message;
        }
    });

    // 4. PROCESAR PAGO CON BILLETERA DIGITAL (YAPE / PLIN)
    formBilletera.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tipoBilletera = document.getElementById('billetera-tipo').value;
        const celular = document.getElementById('billetera-celular').value.trim();

        if (celular.length !== 9 || isNaN(celular)) return alert('Número de celular inválido (requiere 9 dígitos).');

        const msgBox = document.getElementById('pago-mensaje');
        msgBox.style.display = 'block';
        msgBox.style.backgroundColor = '#fff3cd';
        msgBox.style.color = '#856404';
        msgBox.textContent = `Verificando cuenta en ${tipoBilletera}...`;

        try {
            // Verificar si el número existe en billeteras
            let [billeteraValida] = await sql`
                SELECT id FROM billeteras 
                WHERE numero_celular = ${celular} AND tipo = ${tipoBilletera}
            `;

            // Auto-registro simulado para pruebas
            if (!billeteraValida) {
                const [nuevaBilletera] = await sql`
                    INSERT INTO billeteras (numero_celular, tipo)
                    VALUES (${celular}, ${tipoBilletera})
                    RETURNING id
                `;
                billeteraValida = nuevaBilletera;
            }

            await procesarTransaccion(reclamo.id, reclamo.monto_calculado, `Billetera (${tipoBilletera})`);

        } catch (err) {
            msgBox.style.backgroundColor = '#f8d7da';
            msgBox.style.color = '#721c24';
            msgBox.textContent = 'Error de Autorización: ' + err.message;
        }
    });
});

async function procesarTransaccion(reclamoId, monto, medioPago) {
    const msgBox = document.getElementById('pago-mensaje');
    msgBox.style.display = 'block';
    msgBox.style.backgroundColor = '#d1ecf1';
    msgBox.style.color = '#0c5460';
    msgBox.textContent = 'Autorizado. Registrando pago en el sistema del SAT...';

    const numComprobante = 'CMP-VS-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    // A. Registrar en tabla de pagos
    await sql`
        INSERT INTO pagos (reclamo_id, monto, medio_pago, numero_comprobante, fecha_pago)
        VALUES (${reclamoId}, ${monto}, ${medioPago}, ${numComprobante}, NOW())
    `;

    // B. Actualizar estado del reclamo a 'Pagado'
    await sql`
        UPDATE reclamos_tributarios 
        SET estado_pago = 'Pagado', 
            fecha_pago = NOW(), 
            numero_comprobante = ${numComprobante}
        WHERE id = ${reclamoId}
    `;

    // C. 🎉 ¡Lanzar la celebración de confeti desde los costados!
    lanzarConfeti();

    msgBox.style.backgroundColor = '#d4edda';
    msgBox.style.color = '#155724';
    msgBox.textContent = `¡Pago exitoso! Comprobante: ${numComprobante}. Redirigiendo...`;

    // Redirección con margen para visualizar el confeti
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 3500);
}

// FUNCIÓN DE CONFETI DESDE LOS LATERALES
function lanzarConfeti() {
    if (typeof confetti !== 'function') return;

    const duracion = 2500;
    const finalAnimacion = Date.now() + duracion;

    const interval = setInterval(() => {
        const tiempoRestante = finalAnimacion - Date.now();

        if (tiempoRestante <= 0) {
            return clearInterval(interval);
        }

        const particleCount = 50 * (tiempoRestante / duracion);

        // Cañón Izquierdo
        confetti({
            particleCount,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.85 },
            colors: ['#28a745', '#0056b3', '#ffc107', '#dc3545', '#17a2b8']
        });

        // Cañón Derecho
        confetti({
            particleCount,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.85 },
            colors: ['#28a745', '#0056b3', '#ffc107', '#dc3545', '#17a2b8']
        });
    }, 250);
}