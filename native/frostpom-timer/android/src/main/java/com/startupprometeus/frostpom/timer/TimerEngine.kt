package com.startupprometeus.frostpom.timer

import android.content.Context
import android.util.Log
import kotlin.math.min

/**
 * FrostPom (v4.6) — el que decide: con la copia del reloj (TimerStore) pone al día la
 * notificación en curso, el aviso del final, los widgets y la actualización cada 15 min.
 *
 * Regla de oro: un error aquí nunca puede cerrar la app. Todo va en try/catch; en el peor caso
 * no se ve la notificación o el widget se queda quieto.
 */
object TimerEngine {
    private const val TAG = "FrostTimer"
    private const val TICK_MS = 15 * 60_000L // el dibujo del widget avanza cada 15 min (límite de Android)

    /** Pone todo al día con el reloj guardado. */
    fun refresh(ctx: Context, now: Long = System.currentTimeMillis()) {
        val st = TimerStore.load(ctx)
        // Llegó a cero sin que sonara el aviso (por ejemplo, el teléfono estaba apagado)
        if (st.status == TimerState.RUNNING && st.endAt <= now) {
            ended(ctx, now)
            return
        }
        guard("notificación") { TimerNotification.show(ctx, st, now) }
        guard("aviso del final") {
            if (st.status == TimerState.RUNNING) TimerAlarm.scheduleEnd(ctx, st.endAt) else TimerAlarm.cancelEnd(ctx)
        }
        guard("cada 15 min") {
            if (st.status == TimerState.RUNNING) TimerAlarm.scheduleTick(ctx, min(now + TICK_MS, st.endAt)) else TimerAlarm.cancelTick(ctx)
        }
        guard("widget") { FrostWidget.updateAll(ctx, st, now) }
    }

    /**
     * Un botón de la notificación o del widget: "toggle" (empezar/pausar/continuar), "skip",
     * "finish" o "reset". Cambia la copia al instante y anota la acción para la app web.
     */
    fun act(ctx: Context, button: String, now: Long = System.currentTimeMillis()) {
        val st = TimerStore.load(ctx)
        val (act, next) = when (button) {
            "toggle" -> when (st.status) {
                TimerState.RUNNING -> "pause" to st.pause(now)
                TimerState.PAUSED -> "resume" to st.resume(now)
                TimerState.IDLE -> "start" to st.start(now)
                else -> "" to null
            }
            "skip" -> "skip" to st.skip()
            "finish" -> "finish" to st.finish(now)
            "reset" -> "reset" to st.reset()
            else -> "" to null
        }
        if (next == null || act.isEmpty()) {
            refresh(ctx, now) // nada que hacer: por si la notificación estaba vieja
            return
        }
        TimerStore.save(ctx, next)
        TimerStore.addPending(ctx, PendingAction(act, now, st.block))
        refresh(ctx, now)
        FrostTimerPlugin.actionsPending() // si la app está abierta, la aplica enseguida
    }

    /** Sonó el aviso del final. */
    fun ended(ctx: Context, now: Long = System.currentTimeMillis()) {
        val st = TimerStore.load(ctx)
        if (st.status != TimerState.RUNNING) return
        if (st.endAt > now + 1500L) { // el bloque se movió (pausa, cambio de hora): se reprograma
            refresh(ctx, now)
            return
        }
        TimerStore.save(ctx, st.done())
        // Con la app a la vista, ella misma celebra y guarda el bloque: no hace falta otro aviso
        if (!FrostTimerPlugin.inForeground) guard("aviso") { TimerNotification.showEnd(ctx, st) }
        refresh(ctx, now)
    }

    private inline fun guard(what: String, block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo actualizar: $what", e)
        }
    }
}
