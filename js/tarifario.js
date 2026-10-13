const TarifarioSAT = {
    // Regla de cálculo para reclamos tributarios
    calcularTasaReclamo(valorTasacion) {
        const valor = parseFloat(valorTasacion) || 0;
        if (valor <= 0) return 12.00; // Si no hay tasación, aplica solo la apertura de carpeta S/ 12.00
        
        // 1.5% del valor de tasación + S/ 12.00 por apertura de carpeta
        const monto = (valor * 0.015) + 12.00;
        
        // Redondeo estándar a 2 decimales
        return Math.round(monto * 100) / 100;
    },

    // Actualiza en tiempo real los campos de cotización en el formulario HTML
    inicializarCotizador() {
        const inputTasacion = document.getElementById('valor_tasacion') || document.getElementById('valorTasacion');
        const displayMonto = document.getElementById('monto_calculado_display') || document.getElementById('montoDisplay');
        const hiddenMonto = document.getElementById('monto_calculado') || document.getElementById('montoCalculado');

        if (!inputTasacion) return;

        const recalcular = () => {
            const valor = inputTasacion.value;
            const total = this.calcularTasaReclamo(valor);

            if (displayMonto) {
                displayMonto.textContent = `S/ ${total.toFixed(2)}`;
            }
            if (hiddenMonto) {
                hiddenMonto.value = total.toFixed(2);
            }
        };

        // Escuchar cambios mientras el usuario escribe
        inputTasacion.addEventListener('input', recalcular);
        inputTasacion.addEventListener('change', recalcular);
        
        // Ejecutar cálculo inicial
        recalcular();
    }
};

// Auto-inicializar si el DOM ya cargó
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TarifarioSAT.inicializarCotizador());
} else {
    TarifarioSAT.inicializarCotizador();
}