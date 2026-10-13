import { sql } from './neon-config.js';
import { verificarSesion } from './auth.js';

const usuario = verificarSesion();

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Obtener parámetros de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const reclamoId = urlParams.get('id');

    if (!reclamoId) {
        alert('No se especificó un expediente válido.');
        window.location.href = 'ReclamosTributarios.html';
        return;
    }

    // 2. Obtener datos del reclamo desde Neon BD
    const [reclamo] = await sql`
        SELECT id, codigo_seguimiento, monto_calculado 
        FROM reclamos_tributarios 
        WHERE id = ${reclamoId} AND estado_pago = 'Pendiente'
    `;

    if (!reclamo) {
        alert('El reclamo no existe o ya ha sido pagado.');
        window.location.href = 'ReclamosTributarios.html';
        return;
    }

    document.getElementById('resumen-codigo').textContent = reclamo.codigo_seguimiento;
    document.getElementById('resumen-monto').textContent = `S/ ${parseFloat(reclamo.monto_calculado).toFixed(2)}`;

    // Toggle entre métodos de pago
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

    // 3. RF-33.10: PROCESAR PAGO CON TARJETA
    formTarjeta.addEventListener('submit', async (e) => {
        e.preventDefault();
        const numero = document.getElementById('tarjeta-numero').value.trim();
        const exp = document.getElementById('tarjeta-exp').value.trim();
        const cvv = document.getElementById('tarjeta-cvv').value.trim();

        if (numero.length !== 16 || isNaN(numero)) return alert('Número de tarjeta inválido (requiere 16 dígitos).');
        if (cvv.length !== 3 || isNaN(cvv)) return alert('CVV inválido.');

        await procesarTransaccion(reclamo.id, reclamo.monto_calculado, 'Tarjeta Crédito/Débito', {
            numero, exp
        });
    });

    // 4. RF-33.11: PROCESAR PAGO CON BILLETERA DIGITAL
    formBilletera.addEventListener('submit', async (e) => {
        e.preventDefault();
        const billetera = document.getElementById('billetera-nombre').value;
        const celular = document.getElementById('billetera-celular').value.trim();

        if (celular.length !== 9 || isNaN(celular)) return alert('Número de celular inválido (9 dígitos).');

        await procesarTransaccion(reclamo.id, reclamo.monto_calculado, `Billetera (${billetera})`, {
            billetera, celular
        });
    });
});

async function procesarTransaccion(reclamoId, monto, medioPago, detalles) {
    const msgBox = document.getElementById('pago-mensaje');
    msgBox.style.display = 'block';
    msgBox.style.backgroundColor = '#fff3cd';
    msgBox.textContent = 'Procesando pago con la entidad financiera...';

    try {
        const numComprobante = 'CMP-' + Math.random().toString(36).substring(2, 10).toUpperCase();

        // A. Insertar en tabla pagos
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

        msgBox.style.backgroundColor = '#d4edda';
        msgBox.style.color = '#155724';
        msgBox.textContent = `¡Pago exitoso! Comprobante: ${numComprobante}. Redirigiendo...`;

        setTimeout(() => {
            window.location.href = 'ReclamosTributarios.html';
        }, 2500);

    } catch (err) {
        msgBox.style.backgroundColor = '#f8d7da';
        msgBox.style.color = '#721c24';
        msgBox.textContent = 'Error al procesar la transacción: ' + err.message;
    }
}